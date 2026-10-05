import type { Id, Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { applyOrder, mulberry32, shuffleWithSeed } from "./sessionCore";
import type { Difficulty } from "./sessionCore";

/**
 * SELEÇÃO DE QUESTÕES (camada de serviço do Study Session Engine)
 *
 * Responsável por:
 * - buscar questões; aplicar filtros;
 * - excluir questões inválidas e NÃO PUBLICADAS (draft/review/archived);
 * - aplicar quantidade; aplicar ordem (definida UMA vez, na criação);
 * - evitar duplicações.
 *
 * Nenhum componente de interface sorteia questões: tudo passa por aqui.
 */

export const MAX_QUESTIONS_PER_SESSION = 90;

export interface QuestionFilters {
  examId?: Id<"exams">;
  editionId?: Id<"examEditions">;
  subjectId?: Id<"taxonomyNodes">;
  topicId?: Id<"taxonomyNodes">;
  difficulty?: Difficulty;
}

export interface SelectionReport {
  /** IDs na ordem final da sessão (definida na criação). */
  picked: Id<"questions">[];
  /** Quantas questões publicadas existem para o filtro pedido. */
  available: number;
  /** Quantidade solicitada pelo usuário. */
  requested: number;
}

/** Filtra questões válidas para sessão: publicadas, com ≥2 alternativas e gabarito. */
export function isUsableQuestion(q: Doc<"questions">): boolean {
  return (
    q.status === "published" &&
    q.alternatives.length >= 2 &&
    typeof q.correctLetter === "string" &&
    q.correctLetter.length > 0
  );
}

/** Busca questões publicadas aplicando os filtros (usa índices quando possível). */
export async function queryPublishedQuestions(
  ctx: QueryCtx | MutationCtx,
  filters: QuestionFilters,
): Promise<Doc<"questions">[]> {
  if (filters.editionId) {
    return await ctx.db
      .query("questions")
      .withIndex("by_edition", (q) => q.eq("editionId", filters.editionId!))
      .order("asc")
      .filter((q) => q.eq(q.field("status"), "published"))
      .collect();
  }

  let rows: Doc<"questions">[];
  if (filters.subjectId) {
    rows = await ctx.db
      .query("questions")
      .withIndex("by_subject", (q) =>
        q.eq("subjectId", filters.subjectId!).eq("status", "published"),
      )
      .collect();
  } else {
    rows = await ctx.db
      .query("questions")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();
  }

  return rows.filter((q) => {
    if (filters.topicId && q.topicId !== filters.topicId) return false;
    if (filters.examId && q.examId !== filters.examId) return false;
    if (filters.difficulty && q.difficulty !== filters.difficulty) return false;
    return true;
  });
}

/** Conta quantas questões publicadas existem para o filtro (sem trazer tudo ao cliente). */
export async function countAvailableQuestions(
  ctx: QueryCtx | MutationCtx,
  filters: QuestionFilters,
): Promise<number> {
  const rows = await queryPublishedQuestions(ctx, filters);
  return rows.filter(isUsableQuestion).length;
}

/**
 * Seleção principal: aplica filtros, remove duplicadas/inválidas, aplica
 * quantidade e ordem (original preserva prova; random embaralha com seed
 * fixado na criação).
 */
export async function selectQuestions(
  ctx: QueryCtx | MutationCtx,
  filters: QuestionFilters,
  requested: number,
  orderMode: "original" | "random",
  seed: number,
): Promise<SelectionReport> {
  const want = Math.min(Math.max(1, requested), MAX_QUESTIONS_PER_SESSION);

  const rows = await queryPublishedQuestions(ctx, filters);
  const usable = rows.filter(isUsableQuestion);

  // Dedupe defensivo (não deve acontecer, mas não pode quebrar a sessão).
  const seen = new Set<string>();
  const unique = usable.filter((q) => {
    if (seen.has(q._id)) return false;
    seen.add(q._id);
    return true;
  });

  // Prova oficial (editionId) já vem ordenada por sourceOrder — preservar.
  const ordered =
    orderMode === "original" || filters.editionId
      ? unique.map((q) => q._id)
      : applyOrder(unique, "random", seed).map((q) => q._id);

  return {
    picked: ordered.slice(0, want),
    available: unique.length,
    requested: want,
  };
}

/**
 * Seleção a partir de uma lista de IDs (caderno de erros, favoritos).
 * Mantém somente questões publicadas/utilizáveis, dedup e aplica ordem.
 */
export async function selectFromIds(
  ctx: QueryCtx | MutationCtx,
  ids: Id<"questions">[],
  requested: number,
  orderMode: "original" | "random",
  seed: number,
): Promise<SelectionReport> {
  const seen = new Set<string>();
  const uniqueIds = ids.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const usable: Id<"questions">[] = [];
  for (const id of uniqueIds) {
    const q = await ctx.db.get(id);
    if (q && isUsableQuestion(q)) usable.push(id);
  }

  const want = Math.min(Math.max(1, requested), MAX_QUESTIONS_PER_SESSION);
  const ordered =
    orderMode === "original"
      ? usable
      : applyOrder(usable, "random", seed);

  return { picked: ordered.slice(0, want), available: usable.length, requested: want };
}

/** Seed estável por usuário+dia: questões do dia iguais o dia todo. */
export function dailySeed(userId: string, date: string): number {
  let h = 2166136261;
  const key = `${userId}:${date}`;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** PRNG determinístico para seeds derivados (reexportado do núcleo). */
export { mulberry32, shuffleWithSeed } from "./sessionCore";

/**
 * QUESTÕES DO DIA — "Aquecimento" (fase 1, determinístico, sem IA):
 * 1) erros recentes fáceis/médios (reforço); 2) novas fáceis; 3) médias.
 * A arquitetura permite trocar esta função por um algoritmo adaptativo
 * futuramente sem alterar o motor.
 */
export async function pickDailyWarmup(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  date: string,
  count: number,
): Promise<SelectionReport> {
  const seed = dailySeed(userId, date);
  const rand = mulberry32(seed);
  const want = Math.min(Math.max(1, count), 10);

  const errors = await ctx.db
    .query("errorBook")
    .withIndex("by_user_active", (q) => q.eq("userId", userId).eq("resolved", false))
    .collect();

  const errorQuestions: Doc<"questions">[] = [];
  for (const e of errors.sort((a, b) => b.lastErrorAt - a.lastErrorAt)) {
    const q = await ctx.db.get(e.questionId);
    if (q && isUsableQuestion(q) && q.difficulty !== "hard") {
      errorQuestions.push(q);
    }
  }

  const picked: Id<"questions">[] = [];
  const pickedSet = new Set<string>();
  for (const q of shuffleWithSeed(errorQuestions, seed)) {
    if (picked.length >= want) break;
    if (!pickedSet.has(q._id)) {
      picked.push(q._id);
      pickedSet.add(q._id);
    }
  }

  // Complementa com fáceis e depois médias não escolhidas.
  const difficulties: Difficulty[] = ["easy", "medium"];
  for (const diff of difficulties) {
    if (picked.length >= want) break;
    const pool = await ctx.db
      .query("questions")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();
    const candidates = shuffleWithSeed(
      pool.filter((q) => q.difficulty === diff && !pickedSet.has(q._id) && isUsableQuestion(q)),
      seed ^ Math.floor(rand() * 0xffffffff),
    );
    for (const q of candidates) {
      if (picked.length >= want) break;
      picked.push(q._id);
      pickedSet.add(q._id);
    }
  }

  return { picked, available: picked.length, requested: want };
}
