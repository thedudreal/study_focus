import { getAuthUserId } from "@convex-dev/auth/server";
import { action, mutation, query } from "./_generated/server";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { buildKeySearchQuery, keyLetterFromSnippet } from "./lib/examProfile";

/**
 * BUSCA POR GABARITO OFICIAL — fila + busca + aplicação.
 *
 * Toda questão que entra no site SEM gabarito oficial gera um registro
 * `answerKeySearches` (status "queued"). `runSearch` consulta a API Exa
 * (env EXA_API_KEY), extrai CANDIDATOS de snippets (nunca aplica sozinho)
 * e o admin aprova via `applyCandidate` — aí a letra vira oficial e
 * substitui a provisória na questão publicada ou no estágio.
 */

/** Cria (idempotente) a fila de busca de gabarito de uma questão por hash. */
export async function ensureSearchForHash(
  ctx: GenericMutationCtx<DataModel>,
  params: {
    contentHash: string;
    questionNumber: number;
    examName?: string;
    institution?: string;
    year?: number;
    phase?: string;
    contributionId?: Id<"examContributions">;
    appliedQuestionId?: Id<"questions">;
  },
): Promise<Id<"answerKeySearches"> | undefined> {
  const existing = await ctx.db
    .query("answerKeySearches")
    .withIndex("by_hash", (q) => q.eq("contentHash", params.contentHash))
    .first();
  if (existing && existing.status !== "applied") return existing._id;
  if (existing && existing.status === "applied") return undefined;

  return ctx.db.insert("answerKeySearches", {
    contentHash: params.contentHash,
    contributionId: params.contributionId,
    questionNumber: params.questionNumber,
    examName: params.examName,
    institution: params.institution,
    year: params.year,
    phase: params.phase,
    searchQuery: buildKeySearchQuery({
      examName: params.examName,
      institution: params.institution,
      year: params.year,
      phase: params.phase,
      questionNumber: params.questionNumber,
    }),
    status: "queued",
    candidates: [],
    createdAt: Date.now(),
  });
}

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

// ============================================================
// FILA (admin)
// ============================================================

export const listSearches = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const docs = await ctx.db.query("answerKeySearches").collect();
    return docs.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Cria manualmente uma busca (admin — ex.: questão publicada antiga). */
export const createSearch = mutation({
  args: {
    contentHash: v.string(),
    questionNumber: v.number(),
    examName: v.optional(v.string()),
    institution: v.optional(v.string()),
    year: v.optional(v.number()),
    phase: v.optional(v.string()),
    contributionId: v.optional(v.id("examContributions")),
    appliedQuestionId: v.optional(v.id("questions")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const id = await ensureSearchForHash(ctx, args);
    return { searchId: id ?? null };
  },
});

/** Reabrir a busca: limpa erro e volta à fila. */
export const retrySearch = mutation({
  args: { searchId: v.id("answerKeySearches") },
  handler: async (ctx, { searchId }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(searchId, {
      status: "queued",
      errorMessage: undefined,
      searchedAt: undefined,
    });
  },
});

// ============================================================
// BUSCA (action; API Exa — requires EXA_API_KEY no ambiente)
// ============================================================

export const runSearch = action({
  args: { searchId: v.id("answerKeySearches") },
  handler: async (ctx, { searchId }) => {
    const doc = await ctx.runQuery(api.answerKeys.requireSearchForAction, {
      searchId,
    });
    if (doc.status === "applied") {
      throw new Error("Busca já aplicada.");
    }

    const apiKey = process.env.EXA_API_KEY;
    await ctx.runMutation(api.answerKeys.markSearchMeta, {
      searchId,
      searchedAt: Date.now(),
      errorMessage: undefined,
    });

    if (!apiKey) {
      await ctx.runMutation(api.answerKeys.markSearchFailed, {
        searchId,
        error:
          "Configure EXA_API_KEY na guia de chaves/API keys para ativar a busca por gabaritos oficiais.",
      });
      throw new Error(
        "Busca indisponível: configure EXA_API_KEY nas chaves do projeto.",
      );
    }

    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query: doc.searchQuery,
        numResults: 6,
        type: "auto",
        contents: { text: { maxCharacters: 600 } },
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      await ctx.runMutation(api.answerKeys.markSearchFailed, {
        searchId,
        error: `Exa ${res.status}: ${detail.slice(0, 180)}`,
      });
      throw new Error("Falha na busca (Exa).");
    }

    type ExaItem = { title?: string; url?: string; text?: string };
    const data = (await res.json()) as { results?: ExaItem[] };
    const candidates: Array<{
      letter: string;
      title?: string;
      sourceUrl: string;
      snippet: string;
      foundAt: number;
    }> = [];
    const seen = new Set<string>();
    for (const r of data.results ?? []) {
      if (!r.url || !r.text) continue;
      const letter = keyLetterFromSnippet(r.text, doc.questionNumber);
      if (!letter) continue;
      const sig = `${r.url}:${letter}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      candidates.push({
        letter,
        title: r.title,
        sourceUrl: r.url,
        snippet: r.text.slice(0, 220),
        foundAt: Date.now(),
      });
      if (candidates.length >= 4) break;
    }

    if (candidates.length === 0) {
      await ctx.runMutation(api.answerKeys.markSearchOutcome, {
        searchId,
        status: "not_found",
      });
      return { status: "not_found" as const, candidates: 0 };
    }
    await ctx.runMutation(api.answerKeys.saveCandidates, {
      searchId,
      candidates: candidates.map((c) => ({
        letter: c.letter,
        title: c.title,
        sourceUrl: c.sourceUrl,
        snippet: c.snippet,
        foundAt: c.foundAt,
      })),
      status: "searched",
    });
    return {
      status: "searched" as const,
      candidates: candidates.length,
    };
  },
});

// ---- helpers chamados via runQuery/runMutation pela action ----

export const requireSearchForAction = query({
  args: { searchId: v.id("answerKeySearches") },
  handler: async (ctx, { searchId }) => {
    const doc = await ctx.db.get(searchId);
    if (!doc) throw new Error("Busca não encontrada.");
    return {
      status: doc.status,
      searchQuery: doc.searchQuery,
      questionNumber: doc.questionNumber,
    };
  },
});

export const markSearchMeta = mutation({
  args: {
    searchId: v.id("answerKeySearches"),
    searchedAt: v.number(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, { searchId, searchedAt, errorMessage }) => {
    await ctx.db.patch(searchId, { searchedAt, errorMessage });
  },
});

export const markSearchFailed = mutation({
  args: { searchId: v.id("answerKeySearches"), error: v.string() },
  handler: async (ctx, { searchId, error }) => {
    await ctx.db.patch(searchId, { status: "failed", errorMessage: error });
  },
});

export const markSearchOutcome = mutation({
  args: { searchId: v.id("answerKeySearches"), status: v.string() },
  handler: async (ctx, { searchId, status }) => {
    const validatorOk = status === "not_found" || status === "searched";
    if (!validatorOk) throw new Error("Status inválido.");
    await ctx.db.patch(searchId, { status: status as "not_found" | "searched" });
  },
});

export const saveCandidates = mutation({
  args: {
    searchId: v.id("answerKeySearches"),
    status: v.union(v.literal("searched"), v.literal("not_found")),
    candidates: v.array(
      v.object({
        letter: v.string(),
        title: v.optional(v.string()),
        sourceUrl: v.string(),
        snippet: v.string(),
        foundAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, { searchId, status, candidates }) => {
    await ctx.db.patch(searchId, {
      status: candidates.length > 0 ? "searched" : status,
      candidates,
    });
  },
});

// ============================================================
// APLICAÇÃO (admin aprova candidado → letra vira oficial)
// ============================================================

/** Atualiza questão publicada: correctLetter + options + keySource oficial. */
export async function applyOfficialToQuestion(
  ctx: GenericMutationCtx<DataModel>,
  questionId: Id<"questions">,
  letter: string,
): Promise<void> {
  const q = await ctx.db.get(questionId);
  if (!q) throw new Error("Questão publicada não encontrada.");
  const letters = q.alternatives.map((a) => a.letter.toUpperCase());
  if (!letters.includes(letter.toUpperCase())) {
    throw new Error(`Letra ${letter} não existe entre as alternativas.`);
  }
  await ctx.db.patch(questionId, {
    correctLetter: letter.toUpperCase(),
    keySource: "official",
  });
  const options = await ctx.db
    .query("questionOptions")
    .withIndex("by_question_order", (o) => o.eq("questionId", questionId))
    .collect();
  for (const opt of options) {
    const isNow = opt.label.toUpperCase() === letter.toUpperCase();
    if (opt.isCorrect !== isNow) {
      await ctx.db.patch(opt._id, { isCorrect: isNow });
    }
  }
}

export const applyCandidate = mutation({
  args: {
    searchId: v.id("answerKeySearches"),
    letter: v.string(),
    /** Registrado para auditoria de fonte futura. */
    sourceUrl: v.optional(v.string()),
  },
  handler: async (ctx, { searchId, letter }) => {
    await requireAdmin(ctx);
    const search = await ctx.db.get(searchId);
    if (!search) throw new Error("Busca não encontrada.");
    if (!search.candidates.some((c) => c.letter === letter.toUpperCase())) {
      throw new Error("Candidato não consta na busca.");
    }

    // 1) Questão publicada (prioridade); 2) estágio da contribuição.
    if (search.appliedQuestionId) {
      await applyOfficialToQuestion(ctx, search.appliedQuestionId, letter);
      await ctx.db.patch(searchId, {
        status: "applied",
        appliedQuestionId: search.appliedQuestionId,
      });
      return { applied: "question" as const };
    }
    if (search.contributionId) {
      const contrib = await ctx.db.get(search.contributionId);
      if (!contrib) throw new Error("Contribuição não encontrada.");
      const parsed = contrib.parsedQuestions ?? [];
      const idx = parsed.findIndex(
        (p) => p.contentHash === search.contentHash,
      );
      if (idx === -1) throw new Error("Questão do estágio não encontrada.");
      await ctx.db.patch(contrib._id, {
        parsedQuestions: parsed.map((p, i) =>
          i === idx
            ? {
                ...p,
                correctLetter: letter.toUpperCase(),
                keySource: "official" as const,
              }
            : p,
        ),
      });
      await ctx.db.patch(searchId, { status: "applied" });
      return { applied: "staged" as const };
    }
    throw new Error("Busca sem questões vinculadas.");
  },
});

// ============================================================
// CHAVE PROVISÓRIA (admin; substituível quando a oficial chegar)
// ============================================================

/**
 * Atribui letra provisória num estágio: permite publicar a questão
 * funcionando enquanto não há gabarito oficial (que substituirá).
 */
export const setProvisionalKey = mutation({
  args: {
    contributionId: v.id("examContributions"),
    questionIndex: v.number(),
    letter: v.string(),
  },
  handler: async (ctx, { contributionId, questionIndex, letter }) => {
    await requireAdmin(ctx);
    const doc = await ctx.db.get(contributionId);
    if (!doc) throw new Error("Contribuição não encontrada.");
    const parsed = doc.parsedQuestions ?? [];
    const item = parsed[questionIndex];
    if (!item) throw new Error("Questão do estágio não encontrada.");
    if (item.keySource === "official") {
      throw new Error("Esta questão já tem gabarito oficial — não sobrescreva.");
    }
    const upper = letter.toUpperCase();
    if (!item.alternatives.some((a) => a.letter.toUpperCase() === upper)) {
      throw new Error(`Letra ${upper} não existe entre as alternativas.`);
    }
    await ctx.db.patch(contributionId, {
      parsedQuestions: parsed.map((p, i) =>
        i === questionIndex
          ? { ...p, correctLetter: upper, keySource: "provisional" as const }
          : p,
      ),
    });
  },
});
