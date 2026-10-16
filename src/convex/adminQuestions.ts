import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel, Id, Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { validateQuestion, normalizeLetter } from "./lib/questionValidation";

/**
 * ADMIN — QUESTÕES
 * CRUD completo com filtro/paginação sobre TODOS os status (diferente da busca
 * pública, que só expõe published). Toda mutation exige role "admin".
 */

async function requireAdmin(
  ctx: GenericMutationCtx<DataModel> | GenericQueryCtx<DataModel>,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx as never);
  if (userId === null) throw new Error("Não autenticado");
  const user = await ctx.db.get(userId);
  if (user?.role !== "admin") {
    throw new Error("Acesso restrito a administradores");
  }
  return userId;
}

const statusValidator = v.union(
  v.literal("draft"),
  v.literal("review"),
  v.literal("published"),
  v.literal("archived"),
);

/** Role do usuário corrente ("admin" | "user" | null) — usada por actions. */
export const getCurrentUserRole = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx as never);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    return user?.role ?? null;
  },
});

const difficultyValidator = v.union(
  v.literal("easy"),
  v.literal("medium"),
  v.literal("hard"),
);

const alternativesValidator = v.array(
  v.object({ letter: v.string(), text: v.string() }),
);

/** Transições permitidas do fluxo editorial. */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ["review", "published", "archived"],
  review: ["published", "draft", "archived"],
  published: ["archived", "draft"],
  archived: ["draft", "review"],
};

/**
 * Valida e escreve a questão + sincroniza as alternativas em questionOptions.
 * (helper compartilhado por create/update/import)
 */
export async function writeQuestionWithOptions(
  ctx: GenericMutationCtx<DataModel>,
  questionId: Id<"questions"> | null,
  data: {
    statement: string;
    context?: string;
    alternatives: { letter: string; text: string }[];
    correctLetter: string;
    explanation?: string;
    subjectId: Id<"taxonomyNodes">;
    topicId?: Id<"taxonomyNodes">;
    subtopicId?: Id<"taxonomyNodes">;
    examId?: Id<"exams">;
    editionId?: Id<"examEditions">;
    sourceRef?: string;
    sourceOrder?: number;
    difficulty: "easy" | "medium" | "hard";
    questionType: "multiple_choice";
    sourceId?: string;
    sourceDbId?: Id<"sources">;
    imageUrl?: string;
    status: "draft" | "review" | "published" | "archived";
    importBatchId?: Id<"importBatches">;
    contentHash?: string;
    /** Proveniência do gabarito (lib de contribuições/provas). */
    keySource?: "official" | "provisional" | "in_document";
  },
): Promise<Id<"questions">> {
  const correctIdx = data.alternatives.findIndex(
    (a) => normalizeLetter(a.letter) === normalizeLetter(data.correctLetter),
  );

  const doc = {
    statement: data.statement,
    context: data.context,
    alternatives: data.alternatives.map((a) => ({
      letter: normalizeLetter(a.letter),
      text: a.text,
    })),
    correctLetter: normalizeLetter(data.correctLetter),
    explanation: data.explanation,
    subjectId: data.subjectId,
    topicId: data.topicId,
    subtopicId: data.subtopicId,
    examId: data.examId,
    editionId: data.editionId,
    sourceRef: data.sourceRef,
    sourceOrder: data.sourceOrder,
    difficulty: data.difficulty,
    questionType: data.questionType,
    sourceId: data.sourceId,
    sourceDbId: data.sourceDbId,
    imageUrl: data.imageUrl,
    status: data.status,
    importBatchId: data.importBatchId,
    contentHash: data.contentHash,
    keySource: data.keySource,
  };

  let finalId: Id<"questions">;
  if (questionId === null) {
    finalId = await ctx.db.insert("questions", doc);
  } else {
    await ctx.db.patch(questionId, doc);
    finalId = questionId;
  }

  // Sincroniza questionOptions (delete + reinsert atômico dentro da mutation)
  const existing = await ctx.db
    .query("questionOptions")
    .withIndex("by_question_order", (q) => q.eq("questionId", finalId))
    .collect();
  for (const opt of existing) {
    await ctx.db.delete(opt._id);
  }
  for (const [i, alt] of data.alternatives.entries()) {
    await ctx.db.insert("questionOptions", {
      questionId: finalId,
      label: normalizeLetter(alt.letter),
      text: alt.text,
      isCorrect: i === correctIdx,
      order: i,
    });
  }

  return finalId;
}

// ---------------- Queries ----------------

/** Lista paginada de questões com filtros (admin vê todos os status). */
export const listQuestions = query({
  args: {
    status: v.optional(statusValidator),
    examId: v.optional(v.id("exams")),
    editionId: v.optional(v.id("examEditions")),
    subjectId: v.optional(v.id("taxonomyNodes")),
    difficulty: v.optional(difficultyValidator),
    term: v.optional(v.string()),
    paginationOpts: v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
    }),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    // Índice primário: status (ou todos), refina em memória para os demais
    // filtros. Com paginação offset-cursor estável para o painel.
    let rows: Doc<"questions">[];
    if (args.status) {
      rows = await ctx.db
        .query("questions")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else {
      rows = await ctx.db.query("questions").collect();
    }

    if (args.examId) rows = rows.filter((q) => q.examId === args.examId);
    if (args.editionId) rows = rows.filter((q) => q.editionId === args.editionId);
    if (args.subjectId) rows = rows.filter((q) => q.subjectId === args.subjectId);
    if (args.difficulty) {
      rows = rows.filter((q) => q.difficulty === args.difficulty);
    }
    const term = args.term?.trim().toLowerCase();
    if (term && term.length >= 2) {
      rows = rows.filter((q) => q.statement.toLowerCase().includes(term));
    }

    rows.sort((a, b) => b._creationTime - a._creationTime);

    const startIdx = args.paginationOpts.cursor
      ? parseInt(args.paginationOpts.cursor, 10)
      : 0;
    const numItems = args.paginationOpts.numItems;
    const page = rows.slice(startIdx, startIdx + numItems);
    const isDone = startIdx + numItems >= rows.length;

    const enriched = await Promise.all(
      page.map(async (q) => {
        const subject = await ctx.db.get(q.subjectId);
        const topic = q.topicId ? await ctx.db.get(q.topicId) : null;
        const exam = q.examId ? await ctx.db.get(q.examId) : null;
        const edition = q.editionId ? await ctx.db.get(q.editionId) : null;
        return {
          _id: q._id,
          statement:
            q.statement.length > 140 ? `${q.statement.slice(0, 137)}…` : q.statement,
          status: q.status,
          difficulty: q.difficulty,
          subjectName: subject?.name ?? "—",
          topicName: topic?.name,
          examName: exam?.name,
          editionLabel: edition
            ? `${edition.year}${edition.phase ? ` · ${edition.phase}` : ""}`
            : undefined,
          sourceRef: q.sourceRef,
          importBatchId: q.importBatchId,
        };
      }),
    );

    return {
      page: enriched,
      isDone,
      cursor: isDone ? null : String(startIdx + numItems),
      total: rows.length,
    };
  },
});

/** Contagem por status (para as abas do painel). */
export const countByStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const all = await ctx.db.query("questions").collect();
    const counts = { draft: 0, review: 0, published: 0, archived: 0, total: all.length };
    for (const q of all) counts[q.status] += 1;
    return counts;
  },
});

/** Detalhe completo para revisão/edição (com alternativas de questionOptions). */
export const getQuestionForReview = query({
  args: { questionId: v.id("questions") },
  handler: async (ctx, { questionId }) => {
    await requireAdmin(ctx);

    const q = await ctx.db.get(questionId);
    if (!q) return null;

    const options = await ctx.db
      .query("questionOptions")
      .withIndex("by_question_order", (q) => q.eq("questionId", questionId))
      .collect();
    options.sort((a, b) => a.order - b.order);

    const subject = await ctx.db.get(q.subjectId);
    const topic = q.topicId ? await ctx.db.get(q.topicId) : null;
    const subtopic = q.subtopicId ? await ctx.db.get(q.subtopicId) : null;
    const exam = q.examId ? await ctx.db.get(q.examId) : null;
    const edition = q.editionId ? await ctx.db.get(q.editionId) : null;
    const source = q.sourceDbId ? await ctx.db.get(q.sourceDbId) : null;
    const batch = q.importBatchId ? await ctx.db.get(q.importBatchId) : null;

    return {
      ...q,
      options,
      subjectName: subject?.name,
      topicName: topic?.name,
      subtopicName: subtopic?.name,
      examName: exam?.name,
      editionYear: edition?.year,
      editionPhase: edition?.phase,
      sourceName: source?.name,
      sourceVerification: source?.verificationStatus,
      batchFilename: batch?.filename,
    };
  },
});

// ---------------- Mutations ----------------

export const createQuestion = mutation({
  args: {
    statement: v.string(),
    context: v.optional(v.string()),
    alternatives: alternativesValidator,
    correctLetter: v.string(),
    explanation: v.optional(v.string()),
    subjectId: v.id("taxonomyNodes"),
    topicId: v.optional(v.id("taxonomyNodes")),
    subtopicId: v.optional(v.id("taxonomyNodes")),
    examId: v.optional(v.id("exams")),
    editionId: v.optional(v.id("examEditions")),
    difficulty: difficultyValidator,
    status: v.optional(v.union(v.literal("draft"), v.literal("review"))),
    sourceDbId: v.optional(v.id("sources")),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const validation = validateQuestion({
      statement: args.statement,
      alternatives: args.alternatives,
      correctLetter: args.correctLetter,
      subjectId: args.subjectId,
      examId: args.examId,
      editionId: args.editionId,
    });
    if (!validation.valid) {
      throw new Error(`Questão inválida: ${validation.errors.join("; ")}`);
    }

    return await writeQuestionWithOptions(ctx, null, {
      statement: args.statement,
      context: args.context,
      alternatives: args.alternatives,
      correctLetter: args.correctLetter,
      explanation: args.explanation,
      subjectId: args.subjectId,
      topicId: args.topicId,
      subtopicId: args.subtopicId,
      examId: args.examId,
      editionId: args.editionId,
      difficulty: args.difficulty,
      questionType: "multiple_choice",
      status: args.status ?? "draft",
      sourceDbId: args.sourceDbId,
      imageUrl: args.imageUrl,
    });
  },
});

export const updateQuestion = mutation({
  args: {
    questionId: v.id("questions"),
    statement: v.string(),
    context: v.optional(v.string()),
    alternatives: alternativesValidator,
    correctLetter: v.string(),
    explanation: v.optional(v.string()),
    subjectId: v.id("taxonomyNodes"),
    topicId: v.optional(v.id("taxonomyNodes")),
    subtopicId: v.optional(v.id("taxonomyNodes")),
    examId: v.optional(v.id("exams")),
    editionId: v.optional(v.id("examEditions")),
    difficulty: difficultyValidator,
    sourceDbId: v.optional(v.id("sources")),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const existing = await ctx.db.get(args.questionId);
    if (!existing) throw new Error("Questão não encontrada");

    const validation = validateQuestion({
      statement: args.statement,
      alternatives: args.alternatives,
      correctLetter: args.correctLetter,
      subjectId: args.subjectId,
      examId: args.examId,
      editionId: args.editionId,
    });
    if (!validation.valid) {
      throw new Error(`Questão inválida: ${validation.errors.join("; ")}`);
    }

    await writeQuestionWithOptions(ctx, args.questionId, {
      statement: args.statement,
      context: args.context,
      alternatives: args.alternatives,
      correctLetter: args.correctLetter,
      explanation: args.explanation,
      subjectId: args.subjectId,
      topicId: args.topicId,
      subtopicId: args.subtopicId,
      examId: args.examId,
      editionId: args.editionId,
      difficulty: args.difficulty,
      questionType: existing.questionType ?? "multiple_choice",
      status: existing.status,
      sourceDbId: args.sourceDbId,
      imageUrl: args.imageUrl,
      importBatchId: existing.importBatchId,
      contentHash: existing.contentHash,
    });
  },
});

/** Transição de status com fluxo editorial obrigatório. */
export const setStatus = mutation({
  args: {
    questionId: v.id("questions"),
    status: statusValidator,
  },
  handler: async (ctx, { questionId, status }) => {
    await requireAdmin(ctx);

    const q = await ctx.db.get(questionId);
    if (!q) throw new Error("Questão não encontrada");
    if (q.status === status) return;

    const allowed = ALLOWED_TRANSITIONS[q.status] ?? [];
    if (!allowed.includes(status)) {
      throw new Error(
        `Transição inválida: ${q.status} → ${status}. Fluxo: draft → review → published.`,
      );
    }

    // Publicar exige revalidação: nunca publicar questão quebrada.
    if (status === "published") {
      const validation = validateQuestion({
        statement: q.statement,
        alternatives: q.alternatives,
        correctLetter: q.correctLetter,
        subjectId: q.subjectId,
        examId: q.examId,
        editionId: q.editionId,
      });
      if (!validation.valid) {
        throw new Error(
          `Não é possível publicar: ${validation.errors.join("; ")}`,
        );
      }
    }

    await ctx.db.patch(questionId, { status });
  },
});

/** Exclusão em cascata das alternativas (questionOptions). */
export const deleteQuestion = mutation({
  args: { questionId: v.id("questions") },
  handler: async (ctx, { questionId }) => {
    await requireAdmin(ctx);

    const options = await ctx.db
      .query("questionOptions")
      .withIndex("by_question_order", (q) => q.eq("questionId", questionId))
      .collect();
    for (const opt of options) {
      await ctx.db.delete(opt._id);
    }
    await ctx.db.delete(questionId);
  },
});

/** Batch: alterar status de várias questões de uma vez (aprovar lote). */
export const bulkSetStatus = mutation({
  args: {
    questionIds: v.array(v.id("questions")),
    status: statusValidator,
  },
  handler: async (ctx, { questionIds, status }) => {
    await requireAdmin(ctx);

    const results: { id: Id<"questions">; ok: boolean; error?: string }[] = [];
    for (const questionId of questionIds) {
      const q = await ctx.db.get(questionId);
      if (!q) {
        results.push({ id: questionId, ok: false, error: "não encontrada" });
        continue;
      }
      const allowed = ALLOWED_TRANSITIONS[q.status] ?? [];
      if (!allowed.includes(status)) {
        results.push({
          id: questionId,
          ok: false,
          error: `transição ${q.status} → ${status} inválida`,
        });
        continue;
      }
      if (status === "published") {
        const validation = validateQuestion({
          statement: q.statement,
          alternatives: q.alternatives,
          correctLetter: q.correctLetter,
          subjectId: q.subjectId,
          examId: q.examId,
          editionId: q.editionId,
        });
        if (!validation.valid) {
          results.push({
            id: questionId,
            ok: false,
            error: validation.errors.join("; "),
          });
          continue;
        }
      }
      await ctx.db.patch(questionId, { status });
      results.push({ id: questionId, ok: true });
    }
    return results;
  },
});
