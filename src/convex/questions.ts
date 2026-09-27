import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

/**
 * QUESTÕES
 * O catálogo é visível para usuários autenticados; apenas questões publicadas
 * são expostas. Mutations administrativas exigem role "admin".
 */

async function requireAdmin(
  ctx: GenericMutationCtx<DataModel> | GenericQueryCtx<DataModel>,
): Promise<void> {
  const userId = await getAuthUserId(ctx as never);
  if (userId === null) throw new Error("Não autenticado");
  const user = await ctx.db.get(userId);
  if (user?.role !== "admin") {
    throw new Error("Acesso restrito a administradores");
  }
}

/** Resultado enriquecido de questão com nomes de taxonomia e vídeo. */
export const questionViewValidator = v.object({
  _id: v.id("questions"),
  statement: v.string(),
  context: v.optional(v.string()),
  alternatives: v.array(v.object({ letter: v.string(), text: v.string() })),
  correctLetter: v.optional(v.string()),
  explanation: v.optional(v.string()),
  difficulty: v.union(v.literal("easy"), v.literal("medium"), v.literal("hard")),
  subjectName: v.string(),
  topicName: v.optional(v.string()),
  examName: v.optional(v.string()),
  editionLabel: v.optional(v.string()),
  sourceRef: v.optional(v.string()),
  videoUrl: v.optional(v.string()),
  videoTitle: v.optional(v.string()),
});

export const searchQuestions = query({
  args: {
    term: v.optional(v.string()),
    subjectId: v.optional(v.id("taxonomyNodes")),
    examId: v.optional(v.id("exams")),
    difficulty: v.optional(v.union(
      v.literal("easy"),
      v.literal("medium"),
      v.literal("hard"),
    )),
    paginationOpts: v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
    }),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Não autenticado");

    const term = args.term?.trim().toLowerCase() ?? "";
    let rows;
    if (args.subjectId) {
      rows = await ctx.db
        .query("questions")
        .withIndex("by_subject", (q) =>
          q.eq("subjectId", args.subjectId!).eq("status", "published"),
        )
        .collect();
    } else {
      rows = await ctx.db
        .query("questions")
        .withIndex("by_status", (q) => q.eq("status", "published"))
        .collect();
    }

    let filtered = rows;
    if (args.examId) filtered = filtered.filter((q) => q.examId === args.examId);
    if (args.difficulty) {
      filtered = filtered.filter((q) => q.difficulty === args.difficulty);
    }
    if (term.length >= 2) {
      filtered = filtered.filter((q) =>
        q.statement.toLowerCase().includes(term),
      );
    }

    filtered.sort((a, b) => (b._creationTime ?? 0) - (a._creationTime ?? 0));

    const { numItems, cursor } = args.paginationOpts;
    const startIdx = cursor ? parseInt(cursor, 10) : 0;
    const page = filtered.slice(startIdx, startIdx + numItems);
    const isDone = startIdx + numItems >= filtered.length;
    const nextCursor = isDone ? null : String(startIdx + numItems);

    const enriched = await Promise.all(
      page.map(async (q) => {
        const subject = await ctx.db.get(q.subjectId);
        const topic = q.topicId ? await ctx.db.get(q.topicId) : null;
        const exam = q.examId ? await ctx.db.get(q.examId) : null;
        const edition = q.editionId ? await ctx.db.get(q.editionId) : null;
        return {
          _id: q._id,
          statement: q.statement.length > 160 ? `${q.statement.slice(0, 157)}...` : q.statement,
          difficulty: q.difficulty,
          subjectName: subject?.name ?? "—",
          topicName: topic?.name,
          examName: exam?.name,
          editionLabel: edition
            ? `${edition.year}${edition.phase ? ` · ${edition.phase}` : ""}`
            : undefined,
          sourceRef: q.sourceRef,
        };
      }),
    );

    return { page: enriched, isDone, cursor: nextCursor };
  },
});

/** Detalhe completo de uma questão (com ou sem gabarito, conforme contexto). */
export const getQuestion = query({
  args: {
    questionId: v.id("questions"),
    includeAnswer: v.boolean(),
  },
  handler: async (ctx, { questionId, includeAnswer }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Não autenticado");

    const q = await ctx.db.get(questionId);
    if (!q || q.status !== "published") return null;

    const subject = await ctx.db.get(q.subjectId);
    const topic = q.topicId ? await ctx.db.get(q.topicId) : null;
    const exam = q.examId ? await ctx.db.get(q.examId) : null;
    const edition = q.editionId ? await ctx.db.get(q.editionId) : null;
    const video = q.videoId ? await ctx.db.get(q.videoId) : null;

    return {
      _id: q._id,
      statement: q.statement,
      context: q.context,
      alternatives: q.alternatives,
      correctLetter: includeAnswer ? q.correctLetter : undefined,
      explanation: includeAnswer ? q.explanation : undefined,
      difficulty: q.difficulty,
      subjectName: subject?.name,
      topicName: topic?.name,
      examName: exam?.name,
      editionLabel: edition
        ? `${edition.year}${edition.phase ? ` · ${edition.phase}` : ""}`
        : undefined,
      sourceRef: q.sourceRef,
      videoUrl: video?.url,
      videoTitle: video?.title,
    };
  },
});

// ---- Admin mutations (fase futura do painel; API pronta agora) ----

export const createQuestion = mutation({
  args: {
    statement: v.string(),
    alternatives: v.array(v.object({ letter: v.string(), text: v.string() })),
    correctLetter: v.string(),
    explanation: v.optional(v.string()),
    subjectId: v.id("taxonomyNodes"),
    topicId: v.optional(v.id("taxonomyNodes")),
    examId: v.optional(v.id("exams")),
    editionId: v.optional(v.id("examEditions")),
    difficulty: v.union(v.literal("easy"), v.literal("medium"), v.literal("hard")),
    status: v.optional(v.union(
      v.literal("draft"),
      v.literal("review"),
      v.literal("published"),
    )),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx as never);
    const questionId = await ctx.db.insert("questions", {
      statement: args.statement,
      alternatives: args.alternatives,
      correctLetter: args.correctLetter,
      explanation: args.explanation,
      subjectId: args.subjectId,
      topicId: args.topicId,
      examId: args.examId,
      editionId: args.editionId,
      difficulty: args.difficulty,
      status: args.status ?? "published",
    });
    return questionId;
  },
});

export const updateQuestionStatus = mutation({
  args: {
    questionId: v.id("questions"),
    status: v.union(
      v.literal("draft"),
      v.literal("review"),
      v.literal("published"),
      v.literal("archived"),
    ),
  },
  handler: async (ctx, { questionId, status }) => {
    await requireAdmin(ctx as never);
    await ctx.db.patch(questionId, { status });
  },
});

export type QuestionId = Id<"questions">;
