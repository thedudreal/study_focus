import type { GenericMutationCtx } from "convex/server";
import type { Id, Doc, DataModel } from "../_generated/dataModel";
import { xpForQuestion, nextStreak, todayLocal } from "./stats";
import type { SessionQuestionStatus } from "./sessionCore";

/**
 * Transações compartilhadas do Study Session Engine.
 * Mantidas fora do studySessions.ts para manter o arquivo principal enfocado
 * nos endpoints públicos.
 */

/** Linha de snapshot persistível em studySessionQuestions. */
export interface SnapshotRow {
  questionId: Id<"questions">;
  position: number;
  status: SessionQuestionStatus;
  selectedLetter?: string;
  isCorrect?: boolean;
  timeSpentSeconds?: number;
  markedForReview: boolean;
  answeredAt?: number;
}

/**
 * Monta as linhas do snapshot a partir da ordem definitiva de questões.
 * Preserva respostas existentes quando a sessão é retomada após alteração
 * do banco (defensivo; o normal é criar com rows vazios).
 */
export function buildSnapshotRows(
  questionIds: Id<"questions">[],
  existing?: SnapshotRow[],
): SnapshotRow[] {
  const prior = new Map<string, SnapshotRow>(
    (existing ?? []).map((r) => [r.questionId, r]),
  );
  return questionIds.map((questionId, index) => {
    const prev = prior.get(questionId);
    return {
      questionId,
      position: index,
      status: prev?.status ?? ("pending" as const),
      selectedLetter: prev?.selectedLetter,
      isCorrect: prev?.isCorrect,
      timeSpentSeconds: prev?.timeSpentSeconds,
      markedForReview: prev?.markedForReview ?? false,
      answeredAt: prev?.answeredAt,
    };
  });
}

/**
 * Persiste a tentativa e propaga efeitos: caderno de erros, contagem diária,
 * XP e streak. Usado pelo answer (modos imediato) e pelo finish (modo end).
 */
export async function persistAttempt(
  ctx: GenericMutationCtx<DataModel>,
  userId: Id<"users">,
  sessionId: Id<"studySessions">,
  question: Doc<"questions">,
  sessionPosition: number,
  selectedLetter: string | undefined,
  isCorrect: boolean,
  timeSpentSeconds: number | undefined,
): Promise<void> {
  await ctx.db.insert("questionAttempts", {
    userId,
    questionId: question._id,
    sessionId,
    sessionPosition,
    selectedLetter,
    isCorrect,
    timeSpentSeconds,
    subjectId: question.subjectId,
    topicId: question.topicId,
    difficulty: question.difficulty,
    answeredAt: Date.now(),
  });

  // Caderno de erros: entra/reabre ao errar; resolve ao acertar depois de errar.
  const errorEntry = await ctx.db
    .query("errorBook")
    .withIndex("by_user_question", (q) =>
      q.eq("userId", userId).eq("questionId", question._id),
    )
    .unique();

  if (!isCorrect) {
    if (errorEntry) {
      await ctx.db.patch(errorEntry._id, {
        errorCount: errorEntry.errorCount + 1,
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
  } else if (errorEntry && !errorEntry.resolved) {
    await ctx.db.patch(errorEntry._id, { resolved: true });
  }

  // Contagem diária + XP + streak (gamificação básica, reutilizada da v1).
  const stats = await ctx.db
    .query("userStats")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();

  const today = todayLocal();
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

  const currentStreak = nextStreak(stats?.currentStreak ?? 0, stats?.lastStudyDate, today);

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
