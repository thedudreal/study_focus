import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import type { GenericMutationCtx } from "convex/server";
import { v } from "convex/values";
import type { Id, Doc, DataModel } from "./_generated/dataModel";
import {
  pickQuestions,
  pickDailyWarmup,
  type SessionConfig,
} from "./lib/sessionBuilder";

/**
 * STUDY SESSION ENGINE
 * Treino personalizado, questões do dia, prova, erros e favoritos são todos
 * o mesmo mecanismo de sessão; muda apenas a seleção e o modo de feedback.
 */

const MAX_PER_SESSION = 90;

async function requireUser(ctx: GenericMutationCtx<DataModel>): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Não autenticado");
  return userId;
}

// ---- Criação ----

export const createSession = mutation({
  args: {
    type: v.union(v.literal("custom"), v.literal("daily"), v.literal("exam")),
    feedbackMode: v.union(v.literal("immediate"), v.literal("end")),
    examId: v.optional(v.id("exams")),
    editionId: v.optional(v.id("examEditions")),
    subjectId: v.optional(v.id("taxonomyNodes")),
    difficulty: v.optional(v.union(
      v.literal("easy"),
      v.literal("medium"),
      v.literal("hard"),
    )),
    questionCount: v.optional(v.number()),
    shuffle: v.optional(v.boolean()),
    source: v.optional(v.union(v.literal("errors"), v.literal("favorites"))),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const today = new Date().toISOString().slice(0, 10);

    let questionIds: Id<"questions">[] = [];
    let questionCount = args.questionCount ?? 10;
    let dailyKind: "warmup" | "review" | "challenge" | undefined;

    if (args.source === "errors") {
      const errors = await ctx.db
        .query("errorBook")
        .withIndex("by_user_active", (q) =>
          q.eq("userId", userId).eq("resolved", false),
        )
        .collect();
      const sorted = errors.sort((a, b) => b.lastErrorAt - a.lastErrorAt);
      questionIds = sorted.slice(0, Math.min(questionCount, MAX_PER_SESSION)).map((e) => e.questionId);
    } else if (args.source === "favorites") {
      const favs = await ctx.db
        .query("favorites")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      const sorted = favs.sort((a, b) => b.createdAt - a.createdAt);
      questionIds = sorted.slice(0, Math.min(questionCount, MAX_PER_SESSION)).map((f) => f.questionId);
    } else if (args.type === "daily") {
      const picked = await pickDailyWarmup(ctx, userId, today, Math.min(questionCount, 10));
      questionIds = picked;
      dailyKind = "warmup";
      questionCount = picked.length;
    } else {
      const config: SessionConfig = {
        type: args.type,
        examId: args.examId,
        editionId: args.editionId,
        subjectId: args.subjectId,
        difficulty: args.difficulty,
        questionCount: Math.min(questionCount, MAX_PER_SESSION),
        feedbackMode: args.feedbackMode,
        shuffle: args.shuffle ?? true,
      };
      const seed = Date.now() & 0xffffffff;
      questionIds = await pickQuestions(ctx, config, seed);
      questionCount = questionIds.length;
    }

    if (questionIds.length === 0) {
      throw new Error(
        "Nenhuma questão encontrada para os filtros escolhidos. Ajuste os filtros ou tente outro tipo de sessão.",
      );
    }

    const sessionId = await ctx.db.insert("studySessions", {
      userId,
      type: args.type,
      feedbackMode: args.feedbackMode,
      examId: args.examId,
      editionId: args.editionId,
      subjectId: args.subjectId,
      questionCount,
      questionIds,
      dailyKind,
      source: args.source,
      status: "active",
      currentIndex: 0,
      answers: [],
      startedAt: Date.now(),
    });

    return sessionId;
  },
});

// ---- Navegação ----

/** Estado completo da sessão para o player (com questão corrente). */
export const getSessionState = query({
  args: { sessionId: v.id("studySessions") },
  handler: async (ctx, { sessionId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Não autenticado");

    const session = await ctx.db.get(sessionId);
    if (!session || session.userId !== userId) return null;

    const idx = session.currentIndex ?? 0;
    const currentQuestionId = session.questionIds[idx];
    const question = currentQuestionId ? await ctx.db.get(currentQuestionId) : null;

    // Em modo "immediate" mostramos gabarito/explicação de questões já respondidas.
    const showAnswer =
      session.feedbackMode === "end" ? false : undefined;

    const subject = question ? await ctx.db.get(question.subjectId) : null;
    const topic = question?.topicId ? await ctx.db.get(question.topicId) : null;
    const exam = question?.examId ? await ctx.db.get(question.examId) : null;
    const edition = question?.editionId ? await ctx.db.get(question.editionId) : null;
    const video = question?.videoId ? await ctx.db.get(question.videoId) : null;

    return {
      session: {
        _id: session._id,
        type: session.type,
        feedbackMode: session.feedbackMode,
        status: session.status,
        questionCount: session.questionCount,
        currentIndex: idx,
        dailyKind: session.dailyKind,
        source: session.source,
        startedAt: session.startedAt,
        answers: session.answers ?? [],
      },
      question: question
        ? {
            _id: question._id,
            statement: question.statement,
            context: question.context,
            alternatives: question.alternatives,
            // gabarito só vai ao cliente quando já pode ser revelado:
            correctLetter: showAnswer === false ? undefined : undefined,
            explanation: undefined,
            difficulty: question.difficulty,
            subjectName: subject?.name,
            topicName: topic?.name,
            examName: exam?.name,
            editionLabel: edition
              ? `${edition.year}${edition.phase ? ` · ${edition.phase}` : ""}`
              : undefined,
            sourceRef: question.sourceRef,
            videoUrl: video?.url,
            videoTitle: video?.title,
          }
        : null,
    };
  },
});

/**
 * Correção de uma resposta. Em modo "immediate" o gabarito é revelado na hora;
 * em modo "end" a correção acontece apenas ao finalizar.
 */
export const answerQuestion = mutation({
  args: {
    sessionId: v.id("studySessions"),
    questionIndex: v.number(),
    selectedLetter: v.string(),
    timeSpentSeconds: v.optional(v.number()),
  },
  handler: async (ctx, { sessionId, questionIndex, selectedLetter, timeSpentSeconds }) => {
    const userId = await requireUser(ctx);

    const session = await ctx.db.get(sessionId);
    if (!session || session.userId !== userId) throw new Error("Sessão não encontrada");
    if (session.status !== "active") throw new Error("Sessão já finalizada");

    const questionId = session.questionIds[questionIndex];
    const question = await ctx.db.get(questionId);
    if (!question) throw new Error("Questão não encontrada");

    const isCorrect = question.correctLetter === selectedLetter;

    // Atualiza/insere a resposta no array da sessão.
    const answers = [...(session.answers ?? [])];
    const existing = answers.findIndex((a) => a.questionId === questionId);
    const answer = {
      questionId,
      selectedLetter,
      isCorrect,
      timeSpentSeconds,
      flagged: existing >= 0 ? answers[existing].flagged : false,
    };
    if (existing >= 0) answers[existing] = answer;
    else answers.push(answer);

    // Avança o cursor quando respondemos a questão corrente em ordem.
    const currentIndex =
      questionIndex === (session.currentIndex ?? 0)
        ? Math.min(questionIndex + 1, session.questionCount - 1)
        : session.currentIndex ?? 0;

    await ctx.db.patch(sessionId, { answers, currentIndex });

    // Tentativa persistente só no modo imediato (no modo prova, gravamos ao final).
    if (session.feedbackMode === "immediate") {
      await persistAttempt(ctx, userId, sessionId, question, selectedLetter, isCorrect, timeSpentSeconds);
    }

    return {
      isCorrect,
      correctLetter: question.correctLetter,
      explanation: question.explanation ?? null,
    };
  },
});

/** Persiste tentativa + favoritos/erros + stats. Chamado pelo answer e pelo finish. */
export async function persistAttempt(
  ctx: GenericMutationCtx<DataModel>,
  userId: Id<"users">,
  sessionId: Id<"studySessions">,
  question: Doc<"questions">,
  selectedLetter: string | undefined,
  isCorrect: boolean,
  timeSpentSeconds: number | undefined,
): Promise<void> {
  await ctx.db.insert("questionAttempts", {
    userId,
    questionId: question._id,
    sessionId,
    selectedLetter,
    isCorrect,
    timeSpentSeconds,
    subjectId: question.subjectId,
    topicId: question.topicId,
    difficulty: question.difficulty,
    answeredAt: Date.now(),
  });

  // Caderno de erros
  if (!isCorrect) {
    const existing = await ctx.db
      .query("errorBook")
      .withIndex("by_user_question", (q) =>
        q.eq("userId", userId).eq("questionId", question._id),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        errorCount: existing.errorCount + 1,
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
  } else {
    // Acertou após errar antes: marca como resolvido no caderno de erros.
    const existing = await ctx.db
      .query("errorBook")
      .withIndex("by_user_question", (q) =>
        q.eq("userId", userId).eq("questionId", question._id),
      )
      .unique();
    if (existing && !existing.resolved) {
      await ctx.db.patch(existing._id, { resolved: true });
    }
  }

  // Stats + XP + streak + daily
  const stats = await ctx.db
    .query("userStats")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();

  const today = new Date().toISOString().slice(0, 10);
  const { xpForQuestion, nextStreak } = await import("./lib/stats");
  const gainedXp = xpForQuestion(question.difficulty, isCorrect);

  const daily = await ctx.db
    .query("dailyAnswers")
    .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", today))
    .unique();

  if (daily) {
    await ctx.db.patch(daily._id, {
      answered: daily.answered + 1,
      correct: daily.correct + (isCorrect ? 1 : 0),
    });
  } else {
    await ctx.db.insert("dailyAnswers", {
      userId,
      date: today,
      answered: 1,
      correct: isCorrect ? 1 : 0,
    });
  }

  const currentStreak = nextStreak(
    stats?.currentStreak ?? 0,
    stats?.lastStudyDate,
    today,
  );

  if (stats) {
    await ctx.db.patch(stats._id, {
      totalAttempts: stats.totalAttempts + 1,
      totalCorrect: stats.totalCorrect + (isCorrect ? 1 : 0),
      xp: stats.xp + gainedXp,
      currentStreak,
      bestStreak: Math.max(stats.bestStreak, currentStreak),
      lastStudyDate: today,
      updatedAt: Date.now(),
    });
  } else {
    await ctx.db.insert("userStats", {
      userId,
      totalAttempts: 1,
      totalCorrect: isCorrect ? 1 : 0,
      xp: gainedXp,
      currentStreak,
      bestStreak: Math.max(0, currentStreak),
      lastStudyDate: today,
      updatedAt: Date.now(),
    });
  }
}

// ---- Finalização ----

export const finishSession = mutation({
  args: { sessionId: v.id("studySessions") },
  handler: async (ctx, { sessionId }) => {
    const userId = await requireUser(ctx);

    const session = await ctx.db.get(sessionId);
    if (!session || session.userId !== userId) throw new Error("Sessão não encontrada");
    if (session.status === "completed") throw new Error("Sessão já finalizada");

    // No modo prova (end), as tentativas são persistidas agora.
    if (session.feedbackMode === "end") {
      for (const answer of session.answers ?? []) {
        const question = await ctx.db.get(answer.questionId);
        if (!question) continue;
        await persistAttempt(
          ctx,
          userId,
          sessionId,
          question,
          answer.selectedLetter,
          answer.isCorrect ?? false,
          answer.timeSpentSeconds,
        );
      }
    }

    const elapsed = Math.round((Date.now() - session.startedAt) / 1000);
    await ctx.db.patch(sessionId, {
      status: "completed",
      completedAt: Date.now(),
      timerSeconds: session.timerSeconds ?? elapsed,
    });

    return buildResult(session, elapsed);
  },
});

/** Agrega o resultado de uma sessão por matéria/tópico. */
export function buildResult(session: Doc<"studySessions">, elapsedSeconds: number) {
  const answers = session.answers ?? [];
  const answered = answers.filter((a) => a.selectedLetter !== undefined);
  const correct = answered.filter((a) => a.isCorrect === true).length;
  const wrong = answered.filter((a) => a.isCorrect === false).length;
  const blank = session.questionCount - answered.length;

  return {
    totalQuestions: session.questionCount,
    answered: answered.length,
    correct,
    wrong,
    blank,
    percent: answered.length > 0 ? Math.round((correct / answered.length) * 100) : 0,
    elapsedSeconds,
  };
}

/** Resultado detalhado da sessão (após finalizar), com desempenho por matéria. */
export const getSessionResult = query({
  args: { sessionId: v.id("studySessions") },
  handler: async (ctx, { sessionId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Não autenticado");

    const session = await ctx.db.get(sessionId);
    if (!session || session.userId !== userId) return null;

    const elapsed =
      session.timerSeconds ??
      Math.round(((session.completedAt ?? Date.now()) - session.startedAt) / 1000);
    const base = buildResult(session, elapsed);

    const bySubject = new Map<string, { name: string; total: number; correct: number }>();
    for (const answer of session.answers ?? []) {
      if (answer.selectedLetter === undefined) continue;
      const question = await ctx.db.get(answer.questionId);
      if (!question) continue;
      const subject = await ctx.db.get(question.subjectId);
      const key = question.subjectId;
      const entry = bySubject.get(key) ?? {
        name: subject?.name ?? "—",
        total: 0,
        correct: 0,
      };
      entry.total += 1;
      if (answer.isCorrect) entry.correct += 1;
      bySubject.set(key, entry);
    }

    return {
      ...base,
      bySubject: [...bySubject.values()].sort((a, b) => b.total - a.total),
    };
  },
});

/** Retoma sessão ativa (botão "continuar" no dashboard). */
export const getActiveSession = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const session = await ctx.db
      .query("studySessions")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", "active"),
      )
      .order("desc")
      .first();
    return session ?? null;
  },
});

export const abandonSession = mutation({
  args: { sessionId: v.id("studySessions") },
  handler: async (ctx, { sessionId }) => {
    const userId = await requireUser(ctx);
    const session = await ctx.db.get(sessionId);
    if (!session || session.userId !== userId) throw new Error("Sessão não encontrada");
    await ctx.db.patch(sessionId, { status: "abandoned" });
  },
});

export type { SessionConfig };
