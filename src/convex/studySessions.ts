import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import type { GenericQueryCtx, GenericMutationCtx } from "convex/server";
import { v } from "convex/values";
import type { Id, Doc, DataModel } from "./_generated/dataModel";
import {
  selectQuestions,
  selectFromIds,
  pickDailyWarmup,
  countAvailableQuestions,
} from "./lib/sessionBuilder";
import {
  resolveSessionConfig,
  computeElapsedSeconds,
  SESSION_TYPE_LABEL,
} from "./lib/sessionCore";
import type { SessionQuestionState } from "./lib/sessionCore";
import { buildSnapshotRows, persistAttempt } from "./lib/sessionTransactions";
import { todayLocal } from "./lib/stats";

/**
 * STUDY SESSION ENGINE — endpoint central.
 *
 * Um único motor alimenta: questões rápidas (custom), do dia (daily),
 * treinar erros (error_review), favoritos (favorites), revisão (review),
 * simulado (simulation) e prova oficial (exam).
 * A diferença entre eles está principalmente na configuração da sessão
 * (políticas em lib/sessionCore.ts) e na seleção de questões
 * (lib/sessionBuilder.ts). Regras puras em lib/sessionCore.ts, transações
 * em lib/sessionTransactions.ts.
 */

/** Busca a sessão e valida posse (RLS da aplicação). null se de outro usuário. */
async function getOwnedSession(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
  sessionId: Id<"studySessions">,
): Promise<Doc<"studySessions"> | null> {
  const session = await ctx.db.get(sessionId);
  if (!session) return null;
  const userId = await getAuthUserId(ctx as never);
  if (userId === null) throw new Error("Não autenticado");
  return session.userId === userId ? session : null;
}

async function requireOwnedSession(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
  sessionId: Id<"studySessions">,
): Promise<Doc<"studySessions">> {
  const session = await getOwnedSession(ctx, sessionId);
  if (!session) throw new Error("Sessão não encontrada");
  return session;
}

// ============================================================
// FATOS DO SNAPSHOT (grupo por questão)
// ============================================================

interface QuestionGroup {
  row: Doc<"studySessionQuestions">;
  question: Doc<"questions"> | null;
  subjectRow: Doc<"taxonomyNodes"> | null;
  topicRow: Doc<"taxonomyNodes"> | null;
  examRow: Doc<"exams"> | null;
  editionRow: Doc<"examEditions"> | null;
  videoRow: Doc<"videos"> | null;
  review: {
    position: number;
    selectedLetter?: string;
    isCorrect?: boolean;
    timeSpentSeconds?: number;
    marked: boolean;
  } | null;
}

async function getQuestionGroups(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
  sessionId: Id<"studySessions">,
): Promise<QuestionGroup[]> {
  const rows = await ctx.db
    .query("studySessionQuestions")
    .withIndex("by_session_position", (q) => q.eq("sessionId", sessionId))
    .collect();
  rows.sort((a, b) => a.position - b.position);
  const groups: QuestionGroup[] = [];
  for (const row of rows) {
    const question = await ctx.db.get(row.questionId);
    if (!question) continue; // snapshot é a verdade; questões removidas são ignoradas
    groups.push({
      row,
      question,
      subjectRow: await ctx.db.get(question.subjectId),
      topicRow: question.topicId ? await ctx.db.get(question.topicId) : null,
      examRow: question.examId ? await ctx.db.get(question.examId) : null,
      editionRow: question.editionId ? await ctx.db.get(question.editionId) : null,
      videoRow: question.videoId ? await ctx.db.get(question.videoId) : null,
      review:
        row.status === "answered" || row.markedForReview
          ? {
              position: row.position,
              selectedLetter: row.selectedLetter,
              isCorrect: row.isCorrect,
              timeSpentSeconds: row.timeSpentSeconds,
              marked: row.markedForReview,
            }
          : null,
    });
  }
  return groups;
}

/** Projeta o snapshot para o formato puro usado no cálculo de resultado. */
/**
 * Snapshot enviado ao client. Nada do gabarito vaza antes da hora:
 * - a letra escolhida só viaja para questões já respondidas;
 * - acerto/erro só no modo estudo — no modo prova o resultado só é
 *   calculado após finalizar (getResultQuestions).
 */
function groupsToStates(
  groups: QuestionGroup[],
  showFeedback: boolean,
): SessionQuestionState[] {
  return groups.map((g) => ({
    questionId: g.row.questionId,
    position: g.row.position,
    status: g.row.status,
    selectedLetter: g.row.status === "answered" ? g.row.selectedLetter : undefined,
    isCorrect: g.row.status === "answered" && showFeedback ? g.row.isCorrect : undefined,
    timeSpentSeconds: g.row.timeSpentSeconds,
    markedForReview: g.row.markedForReview,
  }));
}

// ============================================================
// CRIAÇÃO
// ============================================================

export const createSession = mutation({
  args: {
    type: v.union(
      v.literal("custom"),
      v.literal("daily"),
      v.literal("exam"),
      v.literal("single_question"),
      v.literal("error_review"),
      v.literal("favorites"),
      v.literal("review"),
      v.literal("simulation"),
    ),
    questionCount: v.optional(v.number()),
    feedbackMode: v.optional(v.union(v.literal("immediate"), v.literal("end"))),
    timerMode: v.optional(
      v.union(v.literal("none"), v.literal("total"), v.literal("per_question")),
    ),
    totalTimeSeconds: v.optional(v.number()),
    perQuestionSeconds: v.optional(v.number()),
    orderMode: v.optional(v.union(v.literal("original"), v.literal("random"))),
    allowBackNavigation: v.optional(v.boolean()),
    allowPause: v.optional(v.boolean()),
    // filtros de origem
    examId: v.optional(v.id("exams")),
    editionId: v.optional(v.id("examEditions")),
    subjectId: v.optional(v.id("taxonomyNodes")),
    topicId: v.optional(v.id("taxonomyNodes")),
    difficulty: v.optional(v.union(
      v.literal("easy"),
      v.literal("medium"),
      v.literal("hard"),
    )),
    // metadados
    title: v.optional(v.string()),
    /** seed do embaralhamento (ordem estável); normalmente omitido */
    seed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Não autenticado");

    const config = resolveSessionConfig({
      type: args.type,
      questionCount: args.questionCount,
      feedbackMode: args.feedbackMode,
      timerMode: args.timerMode,
      totalTimeSeconds: args.totalTimeSeconds,
      perQuestionSeconds: args.perQuestionSeconds,
      orderMode: args.orderMode,
      allowBackNavigation: args.allowBackNavigation,
      allowPause: args.allowPause,
      examId: args.examId,
      editionId: args.editionId,
      subjectId: args.subjectId,
      topicId: args.topicId,
      difficulty: args.difficulty,
    });

    const seed = args.seed ?? (Date.now() & 0xffffffff);

    // ---- SELEÇÃO (somente publicadas; garantia de quantidade) ----
    let picked: Id<"questions">[] = [];
    let available = 0;

    if (config.type === "daily") {
      const report = await pickDailyWarmup(
        ctx,
        userId,
        todayLocal(),
        config.questionCount,
      );
      picked = report.picked;
      available = report.available;
    } else if (config.type === "error_review") {
      const errors = await ctx.db
        .query("errorBook")
        .withIndex("by_user_active", (q) =>
          q.eq("userId", userId).eq("resolved", false),
        )
        .collect();
      const newestFirst = errors
        .sort((a, b) => b.lastErrorAt - a.lastErrorAt)
        .map((e) => e.questionId);
      const report = await selectFromIds(
        ctx,
        newestFirst,
        config.questionCount,
        config.orderMode,
        seed,
      );
      picked = report.picked;
      available = report.available;
    } else if (config.type === "favorites") {
      const favs = await ctx.db
        .query("favorites")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      const newestFirst = favs
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((f) => f.questionId);
      const report = await selectFromIds(
        ctx,
        newestFirst,
        config.questionCount,
        config.orderMode,
        seed,
      );
      picked = report.picked;
      available = report.available;
    } else {
      const report = await selectQuestions(
        ctx,
        {
          examId: args.examId,
          editionId: args.editionId,
          subjectId: args.subjectId,
          topicId: args.topicId,
          difficulty: args.difficulty,
        },
        config.questionCount,
        config.orderMode,
        seed,
      );
      picked = report.picked;
      available = report.available;
    }

    if (picked.length === 0) {
      if (config.type === "favorites") {
        throw new Error(
          "Você ainda não tem questões favoritas. Salve questões durante o treino para montar esta sessão.",
        );
      }
      if (config.type === "error_review") {
        throw new Error("Seu caderno de erros está vazio — nada para treinar agora.");
      }
      throw new Error(
        available === 0
          ? "Não encontramos questões publicadas para essa configuração. Altere os filtros."
          : "Não encontramos questões suficientes para essa configuração. Altere os filtros.",
      );
    }

    const now = Date.now();
    const sessionId = await ctx.db.insert("studySessions", {
      userId,
      type: config.type,
      status: "in_progress",
      title: args.title,
      feedbackMode: config.feedbackMode,
      timerMode: config.timerMode,
      totalTimeSeconds: config.totalTimeSeconds,
      perQuestionSeconds: config.perQuestionSeconds,
      orderMode: config.orderMode,
      allowBackNavigation: config.allowBackNavigation,
      allowPause: config.allowPause,
      examId: args.examId,
      editionId: args.editionId,
      subjectId: args.subjectId,
      topicId: args.topicId,
      difficulty: config.difficulty,
      questionCount: picked.length,
      dailyKind: config.type === "daily" ? "warmup" : undefined,
      answeredCount: 0,
      correctCount: 0,
      incorrectCount: 0,
      currentIndex: 0,
      startedAt: now,
      pausedAccumSeconds: 0,
    });

    // SNAPSHOT: define UMA VEZ quais questões pertencem à sessão e sua ordem.
    for (const row of buildSnapshotRows(picked)) {
      await ctx.db.insert("studySessionQuestions", {
        sessionId,
        questionId: row.questionId,
        position: row.position,
        status: row.status,
        markedForReview: row.markedForReview,
      });
    }

    return sessionId;
  },
});

/** Quantidade disponível para um filtro (alimenta o dialog "Começar com N"). */
export const previewSelection = query({
  args: {
    examId: v.optional(v.id("exams")),
    editionId: v.optional(v.id("examEditions")),
    subjectId: v.optional(v.id("taxonomyNodes")),
    topicId: v.optional(v.id("taxonomyNodes")),
    difficulty: v.optional(v.union(
      v.literal("easy"),
      v.literal("medium"),
      v.literal("hard"),
    )),
    requested: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Não autenticado");
    const available = await countAvailableQuestions(ctx, {
      examId: args.examId,
      editionId: args.editionId,
      subjectId: args.subjectId,
      topicId: args.topicId,
      difficulty: args.difficulty,
    });
    return { available, requested: args.requested };
  },
});

// ============================================================
// ESTADO (PLAYER)
// ============================================================

/** Estado completo da sessão para o player: questão corrente + navegação. */
export const getSessionState = query({
  args: { sessionId: v.id("studySessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await getOwnedSession(ctx, sessionId);
    if (!session) return null;

    const groups = await getQuestionGroups(ctx, sessionId);
    const currentIndex = Math.min(
      session.currentIndex ?? 0,
      Math.max(0, groups.length - 1),
    );
    const group = groups[currentIndex];
    const paused = session.status === "paused";
    const showFeedback = session.feedbackMode === "immediate";

    const elapsed = paused
      ? computeElapsedSeconds(
          session.lastPausedAt ?? Date.now(),
          session.startedAt,
          session.pausedAccumSeconds,
        )
      : computeElapsedSeconds(Date.now(), session.startedAt, session.pausedAccumSeconds);

    let isFavorite = false;
    if (group?.question) {
      const userId = await getAuthUserId(ctx);
      if (userId !== null) {
        const fav = await ctx.db
          .query("favorites")
          .withIndex("by_user_question", (q) =>
            q.eq("userId", userId).eq("questionId", group.question!._id),
          )
          .unique();
        isFavorite = fav !== null;
      }
    }

    const question = group?.question
      ? {
          _id: group.question._id,
          statement: group.question.statement,
          context: group.question.context,
          alternatives: group.question.alternatives,
          // gabarito só viaja ao cliente quando pode ser revelado
          correctLetter: showFeedback ? group.question.correctLetter : undefined,
          explanation: showFeedback ? group.question.explanation : undefined,
          difficulty: group.question.difficulty,
          subjectName: group.subjectRow?.name ?? "—",
          topicName: group.topicRow?.name,
          examName: group.examRow?.name,
          editionLabel: group.editionRow
            ? `${group.editionRow.year}${group.editionRow.phase ? ` · ${group.editionRow.phase}` : ""}`
            : undefined,
          sourceRef: group.question.sourceRef,
          videoUrl: group.videoRow?.url,
          videoTitle: group.videoRow?.title,
        }
      : null;

    return {
      serverNow: Date.now(),
      session: {
        _id: session._id,
        type: session.type,
        typeLabel: SESSION_TYPE_LABEL[session.type] ?? session.type,
        title: session.title ?? (SESSION_TYPE_LABEL[session.type] ?? session.type),
        status: session.status,
        feedbackMode: session.feedbackMode,
        timerMode: session.timerMode,
        totalTimeSeconds: session.totalTimeSeconds,
        perQuestionSeconds: session.perQuestionSeconds,
        orderMode: session.orderMode,
        allowBackNavigation: session.allowBackNavigation,
        allowPause: session.allowPause,
        pausedAccumSeconds: session.pausedAccumSeconds,
        questionCount: session.questionCount,
        currentIndex,
        elapsedSeconds: elapsed,
        paused,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
      },
      question,
      isFavorite,
      review: group?.review ?? null,
      questions: groupsToStates(groups, showFeedback),
    };
  },
});

// ============================================================
// RESPOSTA
// ============================================================

export const answerQuestion = mutation({
  args: {
    sessionId: v.id("studySessions"),
    position: v.number(),
    selectedLetter: v.string(),
    timeSpentSeconds: v.optional(v.number()),
  },
  handler: async (ctx, { sessionId, position, selectedLetter, timeSpentSeconds }) => {
    const session = await requireOwnedSession(ctx, sessionId);

    if (session.status === "paused") {
      throw new Error("Sessão pausada — retome antes de responder.");
    }
    if (session.status !== "in_progress" && session.status !== "created") {
      throw new Error("Sessão já finalizada");
    }

    // Sem navegação para trás: só a questão corrente pode ser respondida.
    if (!session.allowBackNavigation && position !== (session.currentIndex ?? 0)) {
      throw new Error(
        "Nesta sessão você segue a ordem — responda a questão corrente para avançar.",
      );
    }

    const row = await ctx.db
      .query("studySessionQuestions")
      .withIndex("by_session_position", (q) =>
        q.eq("sessionId", sessionId).eq("position", position),
      )
      .unique();
    if (!row) throw new Error("Questão não pertence a esta sessão");

    const question = await ctx.db.get(row.questionId);
    if (!question) throw new Error("Questão não encontrada");

    const isCorrect = question.correctLetter === selectedLetter;
    const wasAnswered = row.status === "answered";
    const wasCorrect = row.isCorrect === true;

    await ctx.db.patch(row._id, {
      status: "answered",
      selectedLetter,
      isCorrect,
      timeSpentSeconds,
      answeredAt: Date.now(),
    });

    // O cursor só se move via navigateTo — a correção imediata precisa
    // continuar visível na questão recém-respondida.

    // Contadores desnormalizados.
    let answeredDelta = 0;
    let correctDelta = 0;
    let incorrectDelta = 0;
    if (wasAnswered) {
      if (wasCorrect && !isCorrect) {
        correctDelta = -1;
        incorrectDelta = 1;
      } else if (!wasCorrect && isCorrect) {
        correctDelta = 1;
        incorrectDelta = -1;
      }
    } else {
      answeredDelta = 1;
      correctDelta = isCorrect ? 1 : 0;
      incorrectDelta = isCorrect ? 0 : 1;
    }
    if (answeredDelta !== 0 || correctDelta !== 0 || incorrectDelta !== 0) {
      await ctx.db.patch(sessionId, {
        answeredCount: session.answeredCount + answeredDelta,
        correctCount: session.correctCount + correctDelta,
        incorrectCount: session.incorrectCount + incorrectDelta,
      });
    }

    // Primeira resposta grava tentativa + caderno de erros + stats.
    // Re-resposta (aprendizado) reconcilia os registros sem duplicar histórico.
    const userId = session.userId;
    if (!wasAnswered) {
      await persistAttempt(
        ctx,
        userId,
        sessionId,
        question,
        position,
        selectedLetter,
        isCorrect,
        timeSpentSeconds,
      );
    } else {
      await reconcileReanswer(
        ctx,
        userId,
        sessionId,
        position,
        question,
        selectedLetter,
        isCorrect,
        wasCorrect,
        timeSpentSeconds,
      );
    }

    return {
      isCorrect,
      // gabarito volta só no modo imediato (modo prova corrige no final)
      correctLetter: session.feedbackMode === "immediate" ? question.correctLetter : undefined,
      explanation: session.feedbackMode === "immediate" ? question.explanation : undefined,
    };
  },
});

/** Re-resposta: ajusta tentativa, caderno de erros e totais sem duplicar. */
async function reconcileReanswer(
  ctx: GenericMutationCtx<DataModel>,
  userId: Id<"users">,
  sessionId: Id<"studySessions">,
  position: number,
  question: Doc<"questions">,
  selectedLetter: string,
  isCorrect: boolean,
  wasCorrect: boolean,
  timeSpentSeconds: number | undefined,
): Promise<void> {
  const attempt = await ctx.db
    .query("questionAttempts")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .filter((q) => q.eq(q.field("sessionPosition"), position))
    .first();
  if (attempt) {
    await ctx.db.patch(attempt._id, {
      selectedLetter,
      isCorrect,
      timeSpentSeconds,
      answeredAt: Date.now(),
    });
  }

  const errorEntry = await ctx.db
    .query("errorBook")
    .withIndex("by_user_question", (q) =>
      q.eq("userId", userId).eq("questionId", question._id),
    )
    .unique();

  if (isCorrect) {
    if (errorEntry && !errorEntry.resolved) {
      await ctx.db.patch(errorEntry._id, { resolved: true });
    }
  } else if (errorEntry) {
    await ctx.db.patch(errorEntry._id, {
      errorCount: errorEntry.errorCount + 1,
      lastErrorAt: Date.now(),
      resolved: false,
    });
  } else {
    await ctx.db.insert("errorBook", {
      userId,
      questionId: question._id,
      errorCount: 1,
      lastErrorAt: Date.now(),
      resolved: false,
    });
  }

  if (wasCorrect !== isCorrect) {
    const stats = await ctx.db
      .query("userStats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (stats) {
      const today = todayLocal();
      await ctx.db.patch(stats._id, {
        totalCorrect: Math.max(0, stats.totalCorrect + (isCorrect ? 1 : -1)),
      });
      const daily = await ctx.db
        .query("dailyAnswers")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", today))
        .unique();
      if (daily) {
        await ctx.db.patch(daily._id, {
          correct: Math.max(0, daily.correct + (isCorrect ? 1 : -1)),
        });
      }
    }
  }
}


// ============================================================
// SKIP / MARCAÇÃO
// ============================================================

/** Deixa a questão pendente (aluno pretende voltar). Não conta como resposta. */
export const skipQuestion = mutation({
  args: { sessionId: v.id("studySessions"), position: v.number() },
  handler: async (ctx, { sessionId, position }) => {
    const session = await requireOwnedSession(ctx, sessionId);
    if (session.status === "paused") {
      throw new Error("Retome a sessão antes de navegar nas questões.");
    }
    if (session.status !== "in_progress" && session.status !== "created") {
      throw new Error("Sessão já finalizada");
    }
    const row = await ctx.db
      .query("studySessionQuestions")
      .withIndex("by_session_position", (q) =>
        q.eq("sessionId", sessionId).eq("position", position),
      )
      .unique();
    if (!row) throw new Error("Questão não pertence a esta sessão");
    if (row.status !== "answered") {
      await ctx.db.patch(row._id, {
        status: "skipped",
        selectedLetter: undefined,
        isCorrect: undefined,
        answeredAt: undefined,
      });
    }
    return { ok: true as const };
  },
});

/** Navegação: move o cursor server-side. Sem volta, só a corrente é permitida. */
export const navigateTo = mutation({
  args: { sessionId: v.id("studySessions"), position: v.number() },
  handler: async (ctx, { sessionId, position }) => {
    const session = await requireOwnedSession(ctx, sessionId);
    if (session.status === "paused") {
      throw new Error("Sessão pausada — retome antes de navegar.");
    }
    if (session.status !== "in_progress" && session.status !== "created") {
      throw new Error("Sessão já finalizada");
    }
    if (position < 0 || position >= session.questionCount) {
      throw new Error("Questão fora do intervalo da sessão");
    }
    // Sem volta: só a corrente ou a próxima são alcançáveis.
    const current = session.currentIndex ?? 0;
    if (!session.allowBackNavigation && position !== current && position !== current + 1) {
      throw new Error("Nesta sessão você segue a ordem — não é possível voltar.");
    }
    if (position !== current) {
      await ctx.db.patch(sessionId, { currentIndex: position });
    }
    return { ok: true as const };
  },
});

/** 🔖 Marca/desmarca a questão para revisão (marca do aluno, não é erro). */
export const setMarkedForReview = mutation({
  args: {
    sessionId: v.id("studySessions"),
    position: v.number(),
    marked: v.boolean(),
  },
  handler: async (ctx, { sessionId, position, marked }) => {
    await requireOwnedSession(ctx, sessionId);
    const row = await ctx.db
      .query("studySessionQuestions")
      .withIndex("by_session_position", (q) =>
        q.eq("sessionId", sessionId).eq("position", position),
      )
      .unique();
    if (!row) throw new Error("Questão não pertence a esta sessão");
    await ctx.db.patch(row._id, { markedForReview: marked });
    return { marked };
  },
});

// ============================================================
// PAUSA / ABANDONO
// ============================================================

/** Pausa real: congela o relógio acumulando o tempo desde o último resume. */
export const pauseSession = mutation({
  args: { sessionId: v.id("studySessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await requireOwnedSession(ctx, sessionId);
    if (!session.allowPause) {
      throw new Error("Esta sessão não permite pausa.");
    }
    if (session.status !== "in_progress" && session.status !== "created") {
      return { ok: true as const, status: session.status };
    }
    await ctx.db.patch(sessionId, {
      status: "paused",
      lastPausedAt: Date.now(),
    });
    return { ok: true as const, status: "paused" as const };
  },
});

export const resumeSession = mutation({
  args: { sessionId: v.id("studySessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await requireOwnedSession(ctx, sessionId);
    if (session.status !== "paused") {
      return { ok: true as const, status: session.status };
    }
    const pausedAt = session.lastPausedAt ?? Date.now();
    const pausedSeconds = Math.max(0, Math.round((Date.now() - pausedAt) / 1000));
    await ctx.db.patch(sessionId, {
      status: "in_progress",
      pausedAccumSeconds: session.pausedAccumSeconds + pausedSeconds,
      lastPausedAt: undefined,
    });
    return { ok: true as const, status: "in_progress" as const };
  },
});

/** Abandona: progresso já respondido permanece salvo no banco. */
export const abandonSession = mutation({
  args: { sessionId: v.id("studySessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await requireOwnedSession(ctx, sessionId);
    if (session.status === "completed") {
      return { ok: true as const, status: "completed" as const };
    }
    let pausedSeconds = session.pausedAccumSeconds;
    if (session.status === "paused" && session.lastPausedAt) {
      pausedSeconds += Math.max(0, Math.round((Date.now() - session.lastPausedAt) / 1000));
    }
    const elapsed = computeElapsedSeconds(Date.now(), session.startedAt, pausedSeconds);
    await ctx.db.patch(sessionId, {
      status: "abandoned",
      timerSeconds: elapsed,
      lastPausedAt: undefined,
      pausedAccumSeconds: pausedSeconds,
      completedAt: Date.now(),
    });
    return { ok: true as const, status: "abandoned" as const };
  },
});

// ============================================================
// FINALIZAÇÃO + RESULTADO
// ============================================================

export const finishSession = mutation({
  args: { sessionId: v.id("studySessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await requireOwnedSession(ctx, sessionId);

    if (session.status === "completed") {
      throw new Error("Sessão já finalizada");
    }

    const groups = await getQuestionGroups(ctx, sessionId);

    // Modo "end" (prova): tentativas persistidas AGORA, em bloco.
    if (session.feedbackMode === "end") {
      for (const g of groups) {
        if (g.row.status !== "answered" || !g.question) continue;
        await persistAttempt(
          ctx,
          session.userId,
          sessionId,
          g.question,
          g.row.position,
          g.row.selectedLetter,
          g.row.isCorrect === true,
          g.row.timeSpentSeconds,
        );
      }
    }

    let pausedSeconds = session.pausedAccumSeconds;
    if (session.status === "paused" && session.lastPausedAt) {
      pausedSeconds += Math.max(0, Math.round((Date.now() - session.lastPausedAt) / 1000));
    }
    const elapsed = computeElapsedSeconds(Date.now(), session.startedAt, pausedSeconds);

    const answered = groups.filter((g) => g.row.status === "answered").length;
    const correct = groups.filter((g) => g.row.isCorrect === true).length;
    const skipped = groups.filter((g) => g.row.status === "skipped").length;
    const marked = groups.filter((g) => g.row.markedForReview).length;
    const total = groups.length || session.questionCount;

    await ctx.db.patch(sessionId, {
      status: "completed",
      pausedAccumSeconds: pausedSeconds,
      lastPausedAt: undefined,
      completedAt: Date.now(),
      timerSeconds: elapsed,
      answeredCount: answered,
      correctCount: correct,
      incorrectCount: answered - correct,
      questionCount: total,
    });

    return {
      total,
      answered,
      correct,
      incorrect: answered - correct,
      blank: total - answered - skipped,
      skipped,
      marked,
      percent: total > 0 ? Math.round((correct / total) * 100) : 0,
      elapsedSeconds: elapsed,
    };
  },
});

/** Resumo do resultado (pós-finalização) + desempenho por matéria. */
export const getSessionResult = query({
  args: { sessionId: v.id("studySessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await getOwnedSession(ctx, sessionId);
    if (!session) return null;
    const groups = await getQuestionGroups(ctx, sessionId);

    const answered = groups.filter((g) => g.row.status === "answered").length;
    const correct = groups.filter((g) => g.row.isCorrect === true).length;
    const skipped = groups.filter((g) => g.row.status === "skipped").length;
    const marked = groups.filter((g) => g.row.markedForReview).length;
    const total = groups.length || session.questionCount;

    const bySubject = new Map<string, { name: string; total: number; correct: number }>();
    for (const g of groups) {
      if (g.row.status !== "answered" || !g.question) continue;
      const subject = g.subjectRow ?? (await ctx.db.get(g.question.subjectId));
      const entry = bySubject.get(g.question.subjectId) ?? {
        name: subject?.name ?? "—",
        total: 0,
        correct: 0,
      };
      entry.total += 1;
      if (g.row.isCorrect === true) entry.correct += 1;
      bySubject.set(g.question.subjectId, entry);
    }

    const elapsed =
      session.timerSeconds ??
      computeElapsedSeconds(
        session.completedAt ?? Date.now(),
        session.startedAt,
        session.pausedAccumSeconds,
      );

    return {
      _id: session._id,
      type: session.type,
      typeLabel: SESSION_TYPE_LABEL[session.type] ?? session.type,
      title: session.title ?? (SESSION_TYPE_LABEL[session.type] ?? session.type),
      status: session.status,
      total,
      answered,
      correct,
      incorrect: answered - correct,
      blank: total - answered - skipped,
      skipped,
      marked,
      percent: total > 0 ? Math.round((correct / total) * 100) : 0,
      elapsedSeconds: elapsed,
      bySubject: [...bySubject.values()].sort((a, b) => b.total - a.total),
    };
  },
});

/**
 * Questões do resultado para revisão detalhada (enunciado + escolhida +
 * correta + explicação). Só revela gabarito quando a sessão encerrou ou
 * quando o feedback é imediato (modo prova em andamento: sem gabarito).
 */
export const getResultQuestions = query({
  args: { sessionId: v.id("studySessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await getOwnedSession(ctx, sessionId);
    if (!session) return null;

    const sessionFinished =
      session.status === "completed" || session.status === "abandoned";
    if (!sessionFinished && session.feedbackMode !== "immediate") return null;

    const groups = await getQuestionGroups(ctx, sessionId);
    const questions = groups.map((g) => ({
      position: g.row.position,
      questionId: g.question!._id,
      statement: g.question!.statement,
      context: g.question!.context,
      alternatives: g.question!.alternatives,
      correctLetter: g.question!.correctLetter,
      explanation: g.question!.explanation,
      selectedLetter: g.row.selectedLetter,
      isCorrect: g.row.isCorrect,
      status: g.row.status,
      markedForReview: g.row.markedForReview,
      timeSpentSeconds: g.row.timeSpentSeconds,
      subjectName: g.subjectRow?.name,
      topicName: g.topicRow?.name,
      examName: g.examRow?.name,
      editionLabel: g.editionRow
        ? `${g.editionRow.year}${g.editionRow.phase ? ` · ${g.editionRow.phase}` : ""}`
        : undefined,
      sourceRef: g.question!.sourceRef,
      videoUrl: g.videoRow?.url,
      videoTitle: g.videoRow?.title,
    }));

    return { reveal: true as const, questions };
  },
});

// ============================================================
// HISTÓRICO + RETOMADA
// ============================================================

/** Histórico de sessões do usuário (mais recentes primeiro). */
export const listHistory = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const max = Math.min(Math.max(1, limit ?? 20), 100);

    const sessions = await ctx.db
      .query("studySessions")
      .withIndex("by_user_time", (q) => q.eq("userId", userId))
      .order("desc")
      .take(max);

    return sessions.map((s) => {
      const running =
        s.status === "in_progress" ||
        s.status === "paused" ||
        s.status === "created";
      const elapsed = s.timerSeconds ??
        (running
          ? computeElapsedSeconds(
              s.status === "paused" ? (s.lastPausedAt ?? Date.now()) : Date.now(),
              s.startedAt,
              s.pausedAccumSeconds,
            )
          : undefined);
      return {
        _id: s._id,
        type: s.type,
        typeLabel: SESSION_TYPE_LABEL[s.type] ?? s.type,
        title: s.title ?? (SESSION_TYPE_LABEL[s.type] ?? s.type),
        status: s.status,
        questionCount: s.questionCount,
        answeredCount: s.answeredCount,
        correctCount: s.correctCount,
        incorrectCount: s.incorrectCount,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        elapsedSeconds: elapsed,
        percent:
          s.questionCount > 0
            ? Math.round((s.correctCount / s.questionCount) * 100)
            : 0,
      };
    });
  },
});

/** Sessão em andamento/pausada (banner "continuar" no dashboard). */
export const getActiveSession = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const rows = await ctx.db
      .query("studySessions")
      .withIndex("by_user_status", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);
    const active = rows.find(
      (s) =>
        s.status === "in_progress" ||
        s.status === "paused" ||
        s.status === "created",
    );
    if (!active) return null;
    return {
      _id: active._id,
      type: active.type,
      typeLabel: SESSION_TYPE_LABEL[active.type] ?? active.type,
      title: active.title ?? (SESSION_TYPE_LABEL[active.type] ?? active.type),
      status: active.status,
      questionCount: active.questionCount,
      answeredCount: active.answeredCount,
      startedAt: active.startedAt,
    };
  },
});

// ============================================================
// TREINAR ERROS A PARTIR DO RESULTADO (ERROR_REVIEW)
// ============================================================

/** Cria uma sessão error_review com as questões erradas de uma sessão anterior. */
export const retryErrorsSession = mutation({
  args: { sessionId: v.id("studySessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await requireOwnedSession(ctx, sessionId);

    const groups = await getQuestionGroups(ctx, sessionId);
    const wrongIds = groups
      .filter((g) => g.row.status === "answered" && g.row.isCorrect === false)
      .map((g) => g.row.questionId);

    if (wrongIds.length === 0) {
      throw new Error("Nenhum erro nesta sessão — seu caderno agradece.");
    }

    const seed = Date.now() & 0xffffffff;
    const report = await selectFromIds(ctx, wrongIds, wrongIds.length, "random", seed);
    if (report.picked.length === 0) {
      throw new Error("As questões erradas não estão mais publicadas.");
    }

    const now = Date.now();
    const newSessionId = await ctx.db.insert("studySessions", {
      userId: session.userId,
      type: "error_review",
      status: "in_progress",
      title: `Treino de erros · ${session.title ?? (SESSION_TYPE_LABEL[session.type] ?? session.type)}`,
      feedbackMode: "immediate",
      timerMode: "none",
      orderMode: "random",
      allowBackNavigation: true,
      allowPause: true,
      questionCount: report.picked.length,
      answeredCount: 0,
      correctCount: 0,
      incorrectCount: 0,
      currentIndex: 0,
      startedAt: now,
      pausedAccumSeconds: 0,
    });

    for (const row of buildSnapshotRows(report.picked)) {
      await ctx.db.insert("studySessionQuestions", {
        sessionId: newSessionId,
        questionId: row.questionId,
        position: row.position,
        status: row.status,
        markedForReview: row.markedForReview,
      });
    }

    return newSessionId;
  },
});
