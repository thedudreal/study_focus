import { Infer, v } from "convex/values";
import type { Id, Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * STUDY SESSION ENGINE
 *
 * Um único mecanismo alimenta treino personalizado, questões do dia e provas.
 * A diferença entre eles é só: (1) como as questões são escolhidas e
 * (2) o modo de feedback (imediato ou no final).
 */

export const sessionConfigValidator = v.object({
  type: v.union(v.literal("custom"), v.literal("daily"), v.literal("exam")),
  examId: v.optional(v.id("exams")),
  editionId: v.optional(v.id("examEditions")),
  subjectId: v.optional(v.id("taxonomyNodes")),
  topicId: v.optional(v.id("taxonomyNodes")),
  difficulty: v.optional(v.union(
    v.literal("easy"),
    v.literal("medium"),
    v.literal("hard"),
  )),
  questionCount: v.number(),
  feedbackMode: v.union(v.literal("immediate"), v.literal("end")),
  shuffle: v.boolean(),
});
export type SessionConfig = Infer<typeof sessionConfigValidator>;

/** PRNG determinístico (mulberry32) — sessões reproduzíveis por seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleWithSeed<T>(arr: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Seed estável por usuário+dia: as questões do dia são iguais o dia todo. */
export function dailySeed(userId: string, date: string): number {
  let h = 2166136261;
  const key = `${userId}:${date}`;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const MAX_QUESTIONS_PER_SESSION = 90;

/**
 * Seleciona questões publicadas conforme os filtros.
 * Modo prova (editionId): preserva a ordem original da prova.
 * Modo estudo: pode embaralhar (com seed determinístico).
 */
export async function pickQuestions(
  ctx: QueryCtx | MutationCtx,
  config: SessionConfig,
  seed: number,
): Promise<Id<"questions">[]> {
  const want = Math.min(config.questionCount, MAX_QUESTIONS_PER_SESSION);

  // Modo prova: todas as questões da edição, ordem original preservada.
  if (config.editionId) {
    return await ctx.db
      .query("questions")
      .withIndex("by_edition", (q) => q.eq("editionId", config.editionId!))
      .order("asc")
      .filter((q) => q.eq(q.field("status"), "published"))
      .take(want)
      .then((rows) => rows.map((r) => r._id));
  }

  // Modo estudo: filtra por matéria/tópico/dificuldade quando informado.
  let rows: Doc<"questions">[];

  if (config.subjectId) {
    rows = await ctx.db
      .query("questions")
      .withIndex("by_subject", (q) => q.eq("subjectId", config.subjectId!))
      .filter((q) => q.eq(q.field("status"), "published"))
      .collect();
  } else {
    rows = await ctx.db
      .query("questions")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();
  }

  rows = rows.filter((q) => {
    if (config.topicId && q.topicId !== config.topicId) return false;
    if (config.examId && q.examId !== config.examId) return false;
    if (config.difficulty && q.difficulty !== config.difficulty) return false;
    return true;
  });

  if (rows.length <= want) {
    return rows.map((r) => r._id);
  }
  return shuffleWithSeed(rows, seed).slice(0, want).map((r) => r._id);
}

/**
 * QUESTÕES DO DIA — "Aquecimento" (fase 1, determinístico):
 * questões fáceis/médias já respondidas com erro (reforço) ou novas fáceis.
 * Regra simples, sem ML: prioriza erros recentes, depois novas fáceis.
 */
export async function pickDailyWarmup(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  date: string,
  count: number,
): Promise<Id<"questions">[]> {
  const seed = dailySeed(userId, date);

  const errors = await ctx.db
    .query("errorBook")
    .withIndex("by_user_active", (q) => q.eq("userId", userId).eq("resolved", false))
    .collect();

  const errorQuestionIds = errors.map((e) => e.questionId);
  const errorQuestions: Doc<"questions">[] = [];
  for (const id of errorQuestionIds) {
    const q = await ctx.db.get(id);
    if (q && q.status === "published" && q.difficulty !== "hard") {
      errorQuestions.push(q);
    }
  }

  const picked: Id<"questions">[] = [];
  if (errorQuestions.length > 0) {
    picked.push(
      ...shuffleWithSeed(errorQuestions, seed).slice(0, count).map((q) => q._id),
    );
  }

  if (picked.length < count) {
    const remaining = count - picked.length;
    const easyNew = await ctx.db
      .query("questions")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .filter((q) => q.eq(q.field("difficulty"), "easy"))
      .collect();
    const pool = easyNew.filter((q) => !picked.includes(q._id));
    picked.push(...shuffleWithSeed(pool, seed ^ 0x9e3779b9).slice(0, remaining).map((q) => q._id));
  }

  return picked.slice(0, count);
}

/** Helper interno para contagem de tentativas (usado no painel). */
export async function countUserAttempts(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<{ total: number; correct: number }> {
  const stats = await ctx.db
    .query("userStats")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (stats) {
    return { total: stats.totalAttempts, correct: stats.totalCorrect };
  }
  return { total: 0, correct: 0 };
}
