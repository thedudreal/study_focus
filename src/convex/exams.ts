import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Catálogo de exames ativos com contagem de questões publicadas.
 * A contagem considera editionId quando presente, senão examId direto.
 */
export const listExams = query({
  args: {},
  handler: async (ctx) => {
    const exams = await ctx.db
      .query("exams")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const editions = await ctx.db.query("examEditions").collect();
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();

    const countByEdition = new Map<string, number>();
    const countByExam = new Map<string, number>();
    for (const q of questions) {
      if (q.editionId) {
        countByEdition.set(q.editionId, (countByEdition.get(q.editionId) ?? 0) + 1);
      } else if (q.examId) {
        countByExam.set(q.examId, (countByExam.get(q.examId) ?? 0) + 1);
      }
    }

    return exams
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((exam) => {
        const examEditions = editions
          .filter((e) => e.examId === exam._id)
          .sort((a, b) => b.year - a.year);
        const total =
          examEditions.reduce(
            (acc, ed) => acc + (countByEdition.get(ed._id) ?? 0),
            0,
          ) + (countByExam.get(exam._id) ?? 0);
        return {
          ...exam,
          totalQuestions: total,
          editions: examEditions.map((ed) => ({
            ...ed,
            questionCount: countByEdition.get(ed._id) ?? 0,
          })),
        };
      });
  },
});

/** Detalhe de um exame: edições agrupadas por ano com contagem. */
export const getExam = query({
  args: { examId: v.id("exams") },
  handler: async (ctx, { examId }) => {
    const exam = await ctx.db.get(examId);
    if (!exam) return null;

    const editions = await ctx.db
      .query("examEditions")
      .withIndex("by_exam_year", (q) => q.eq("examId", examId))
      .collect();

    const allPublished = await ctx.db
      .query("questions")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();

    const countByEdition = new Map<string, number>();
    for (const q of allPublished) {
      if (q.editionId) {
        countByEdition.set(q.editionId, (countByEdition.get(q.editionId) ?? 0) + 1);
      }
    }

    return {
      ...exam,
      editions: editions
        .sort((a, b) => b.year - a.year)
        .map((ed) => ({ ...ed, questionCount: countByEdition.get(ed._id) ?? 0 })),
    };
  },
});

/** Todas as edições (usada na busca/filtros). */
export const listEditions = query({
  args: {},
  handler: async (ctx) => {
    const editions = await ctx.db.query("examEditions").collect();
    const exams = await ctx.db.query("exams").collect();
    const examById = new Map(exams.map((e) => [e._id, e]));
    return editions
      .sort((a, b) => b.year - a.year)
      .map((ed) => ({
        ...ed,
        exam: examById.get(ed.examId) ?? null,
      }));
  },
});
