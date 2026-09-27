import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * CADERNO DE ERROS
 * Registra questões erradas, mantém histórico de erros e permite refazer.
 * Ao acertar de novo (em qualquer sessão), a questão é marcada como resolvida.
 */

export const listErrors = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    const errors = await ctx.db
      .query("errorBook")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", userId).eq("resolved", false),
      )
      .collect();

    const sorted = errors.sort((a, b) => b.lastErrorAt - a.lastErrorAt);
    return Promise.all(
      sorted.map(async (err) => {
        const q = await ctx.db.get(err.questionId);
        if (!q) return null;
        const subject = await ctx.db.get(q.subjectId);
        const exam = q.examId ? await ctx.db.get(q.examId) : null;
        return {
          errorId: err._id,
          questionId: q._id,
          statement:
            q.statement.length > 180 ? `${q.statement.slice(0, 177)}...` : q.statement,
          difficulty: q.difficulty,
          errorCount: err.errorCount,
          lastErrorAt: err.lastErrorAt,
          subjectName: subject?.name ?? "—",
          examName: exam?.name,
        };
      }),
    ).then((rows) => rows.filter((r) => r !== null));
  },
});

export const countErrors = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return 0;
    const errors = await ctx.db
      .query("errorBook")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", userId).eq("resolved", false),
      )
      .collect();
    return errors.length;
  },
});

/** Marca manualmente como resolvida (revisada pelo usuário). */
export const markResolved = mutation({
  args: { errorId: v.id("errorBook") },
  handler: async (ctx, { errorId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Não autenticado");
    const err = await ctx.db.get(errorId);
    if (!err || err.userId !== userId) throw new Error("Registro não encontrado");
    await ctx.db.patch(errorId, { resolved: true });
  },
});
