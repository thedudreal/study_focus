import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * FAVORITOS
 * O usuário marca questões para revisar depois e pode iniciar uma sessão
 * apenas com elas (via studySessions com source="favorites").
 */

export const toggleFavorite = mutation({
  args: { questionId: v.id("questions") },
  handler: async (ctx, { questionId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Não autenticado");

    const existing = await ctx.db
      .query("favorites")
      .withIndex("by_user_question", (q) =>
        q.eq("userId", userId).eq("questionId", questionId),
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { favorited: false };
    }
    await ctx.db.insert("favorites", {
      userId,
      questionId,
      createdAt: Date.now(),
    });
    return { favorited: true };
  },
});

/** Lista favoritos com resumo da questão. */
export const listFavorites = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    const favorites = await ctx.db
      .query("favorites")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const sorted = favorites.sort((a, b) => b.createdAt - a.createdAt);
    return Promise.all(
      sorted.map(async (fav) => {
        const q = await ctx.db.get(fav.questionId);
        if (!q) return null;
        const subject = await ctx.db.get(q.subjectId);
        const exam = q.examId ? await ctx.db.get(q.examId) : null;
        return {
          favoriteId: fav._id,
          questionId: q._id,
          statement:
            q.statement.length > 180 ? `${q.statement.slice(0, 177)}...` : q.statement,
          difficulty: q.difficulty,
          subjectName: subject?.name ?? "—",
          examName: exam?.name,
        };
      }),
    ).then((rows) => rows.filter((r) => r !== null));
  },
});

/** Verifica se uma questão está favoritada (usada no player). */
export const isFavorite = query({
  args: { questionId: v.id("questions") },
  handler: async (ctx, { questionId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return false;
    const existing = await ctx.db
      .query("favorites")
      .withIndex("by_user_question", (q) =>
        q.eq("userId", userId).eq("questionId", questionId),
      )
      .unique();
    return existing !== null;
  },
});

export const countFavorites = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return 0;
    const favorites = await ctx.db
      .query("favorites")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return favorites.length;
  },
});
