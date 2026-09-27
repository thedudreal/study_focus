import { query } from "./_generated/server";
import { v } from "convex/values";

/** Áreas raiz (level=area), ordenadas. */
export const listAreas = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("taxonomyNodes").collect();
    return all
      .filter((n) => n.level === "area")
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },
});

/** Filhos diretos de um nó (matérias de uma área, tópicos de uma matéria). */
export const listChildren = query({
  args: { parentId: v.id("taxonomyNodes") },
  handler: async (ctx, { parentId }) => {
    const all = await ctx.db.query("taxonomyNodes").collect();
    return all
      .filter((n) => n.parentId === parentId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },
});

/** Áreas com contagem de questões publicadas por matéria. */
export const treeWithCounts = query({
  args: {},
  handler: async (ctx) => {
    const nodes = await ctx.db.query("taxonomyNodes").collect();
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();

    const countBySubject = new Map<string, number>();
    for (const q of questions) {
      countBySubject.set(q.subjectId, (countBySubject.get(q.subjectId) ?? 0) + 1);
    }

    const subjectsByArea = new Map<string, typeof nodes>();
    for (const n of nodes) {
      if (n.level === "subject" && n.parentId) {
        const list = subjectsByArea.get(n.parentId) ?? [];
        list.push(n);
        subjectsByArea.set(n.parentId, list);
      }
    }

    return nodes
      .filter((n) => n.level === "area")
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((area) => ({
        ...area,
        subjects: (subjectsByArea.get(area._id) ?? [])
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((s) => ({ ...s, questionCount: countBySubject.get(s._id) ?? 0 })),
        questionCount:
          (subjectsByArea.get(area._id) ?? []).reduce(
            (acc, s) => acc + (countBySubject.get(s._id) ?? 0),
            0,
          ),
      }));
  },
});

/** Busca matérias por nome (usada no criar sessão). */
export const searchSubjects = query({
  args: { term: v.string() },
  handler: async (ctx, { term }) => {
    const normalized = term.trim().toLowerCase();
    if (normalized.length < 2) return [];
    const all = await ctx.db.query("taxonomyNodes").collect();
    return all
      .filter(
        (n) =>
          n.level === "subject" &&
          n.name.toLowerCase().includes(normalized),
      )
      .slice(0, 10);
  },
});
