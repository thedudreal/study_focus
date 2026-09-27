import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * DESEMPENHO
 * Histórico (tudo) vs recente (últimos 30 dias). Conclusões sobre fraqueza
 * exigem dados mínimos (>= 5 tentativas) — nada de estatística com 1 questão.
 */

const MIN_SAMPLE = 5;
const RECENT_DAYS_MS = 30 * 86_400_000;

export const getOverview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;

    const stats = await ctx.db
      .query("userStats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const cutoff = Date.now() - RECENT_DAYS_MS;
    const attempts = await ctx.db
      .query("questionAttempts")
      .withIndex("by_user_time", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    const recent = attempts.filter((a) => a.answeredAt >= cutoff);
    const allTime = {
      total: stats?.totalAttempts ?? 0,
      correct: stats?.totalCorrect ?? 0,
      percent:
        stats && stats.totalAttempts > 0
          ? Math.round((stats.totalCorrect / stats.totalAttempts) * 100)
          : null,
    };
    const recentStats = {
      total: recent.length,
      correct: recent.filter((a) => a.isCorrect).length,
      percent:
        recent.length >= MIN_SAMPLE
          ? Math.round(
              (recent.filter((a) => a.isCorrect).length / recent.length) * 100,
            )
          : null,
    };

    // Série dos últimos 14 dias para o gráfico de atividade
    const daily = await ctx.db
      .query("dailyAnswers")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .collect();
    const dailyByDate = new Map(daily.map((d) => [d.date, d]));
    const series: { date: string; answered: number; correct: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      const entry = dailyByDate.get(date);
      series.push({
        date,
        answered: entry?.answered ?? 0,
        correct: entry?.correct ?? 0,
      });
    }

    return {
      allTime,
      recent: recentStats,
      streak: stats?.currentStreak ?? 0,
      bestStreak: stats?.bestStreak ?? 0,
      xp: stats?.xp ?? 0,
      hasEnoughData: allTime.total >= MIN_SAMPLE,
      series,
    };
  },
});

/** Desempenho por matéria — só produz "ponto de atenção" com amostra mínima. */
export const getSubjectBreakdown = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    const attempts = await ctx.db
      .query("questionAttempts")
      .withIndex("by_user_time", (q) => q.eq("userId", userId))
      .collect();

    const bySubject = new Map<string, { name: string; total: number; correct: number }>();
    for (const a of attempts) {
      const subject = await ctx.db.get(a.subjectId);
      const entry = bySubject.get(a.subjectId) ?? {
        name: subject?.name ?? "—",
        total: 0,
        correct: 0,
      };
      entry.total += 1;
      if (a.isCorrect) entry.correct += 1;
      bySubject.set(a.subjectId, entry);
    }

    return [...bySubject.values()]
      .map((s) => ({
        ...s,
        percent: Math.round((s.correct / s.total) * 100),
        enoughData: s.total >= MIN_SAMPLE,
        attention: s.total >= MIN_SAMPLE && s.correct / s.total < 0.6,
      }))
      .sort((a, b) => b.total - a.total);
  },
});

export const MIN_SAMPLE_FOR_CONCLUSION = MIN_SAMPLE;
export const overviewArgSpec = v.object({});
