import { v } from "convex/values";

/**
 * Regras de gamificação (fase 1, determinísticas):
 * - XP por resposta: correta vale, incorreta não premia (evita farmar pontos).
 * - Dificuldade maior vale mais, para incentivar desafio e não volume fácil.
 */
export const XP_BY_DIFFICULTY = {
  easy: 5,
  medium: 10,
  hard: 15,
} as const;

export type Difficulty = keyof typeof XP_BY_DIFFICULTY;

export function xpForQuestion(difficulty: Difficulty | undefined, isCorrect: boolean): number {
  if (!isCorrect) return 0;
  return XP_BY_DIFFICULTY[difficulty ?? "medium"];
}

/**
 * Streak: dias consecutivos com ao menos 1 resposta correta OU tentativa.
 * Recompensar presença, não volume. Comparação por string de data local.
 */
export const dateValidator = v.string(); // "YYYY-MM-DD"

export function todayLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Diferença em dias entre duas datas "YYYY-MM-DD" (positiva se b > a). */
export function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((db - da) / 86_400_000);
}

/**
 * Calcula o novo streak dado o atual e a data do último estudo.
 * - mesmo dia: streak mantido
 * - dia seguinte: +1
 * - buraco: volta a 1
 */
export function nextStreak(
  current: number,
  lastStudyDate: string | undefined,
  today: string,
): number {
  if (!lastStudyDate) return 1;
  const gap = daysBetween(lastStudyDate, today);
  if (gap === 0) return Math.max(current, 1);
  if (gap === 1) return current + 1;
  return 1;
}
