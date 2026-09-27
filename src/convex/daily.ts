import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";

/**
 * QUESTÕES DO DIA + RANKING
 * O "hoje" é uma study session do tipo daily gerada por seed determinística
 * (mesmas questões para o mesmo usuário no mesmo dia). Ranking semanal por XP.
 */

export const getTodayState = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;

    const today = new Date().toISOString().slice(0, 10);
    const daily = await ctx.db
      .query("dailyAnswers")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", today))
      .unique();

    return {
      date: today,
      answered: daily?.answered ?? 0,
      correct: daily?.correct ?? 0,
      done: (daily?.answered ?? 0) >= 5,
    };
  },
});

/** Ranking semanal: XP acumulado nos últimos 7 dias, top 20. */
export const getWeeklyRanking = query({
  args: {},
  handler: async (ctx) => {
    const weekAgo = Date.now() - 7 * 86_400_000;

    const attempts = await ctx.db.query("questionAttempts").collect();
    const xpByUser = new Map<string, number>();
    const answeredByUser = new Map<string, number>();
    for (const a of attempts) {
      if (a.answeredAt < weekAgo) continue;
      xpByUser.set(a.userId, (xpByUser.get(a.userId) ?? 0) + (a.isCorrect ? 10 : 0));
      answeredByUser.set(a.userId, (answeredByUser.get(a.userId) ?? 0) + 1);
    }

    const users = await ctx.db.query("users").collect();
    const nameById = new Map(users.map((u) => [u._id, u.name ?? u.email ?? "Anônimo"]));

    return [...xpByUser.entries()]
      .map(([userId, xp]) => ({
        userId,
        name: nameById.get(userId) ?? "Anônimo",
        xp,
        answered: answeredByUser.get(userId) ?? 0,
      }))
      .filter((r) => r.xp > 0)
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 20);
  },
});
