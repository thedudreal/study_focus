import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/** Mutations internas usadas apenas pelo seed de demonstração. */

export const getExamBySlug = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("exams")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
  },
});

export const createExam = internalMutation({
  args: {
    name: v.string(),
    slug: v.string(),
    type: v.union(
      v.literal("vestibular"),
      v.literal("enem"),
      v.literal("concurso"),
      v.literal("certification"),
    ),
    institution: v.string(),
    description: v.optional(v.string()),
    status: v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("exams", args);
  },
});

export const createEdition = internalMutation({
  args: {
    examId: v.id("exams"),
    year: v.number(),
    phase: v.string(),
    questionCount: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("examEditions", args);
  },
});

export const createTaxonomyNode = internalMutation({
  args: {
    level: v.union(
      v.literal("area"),
      v.literal("subject"),
      v.literal("topic"),
      v.literal("subtopic"),
    ),
    name: v.string(),
    slug: v.string(),
    parentId: v.optional(v.id("taxonomyNodes")),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("taxonomyNodes", args);
  },
});

export const createQuestion = internalMutation({
  args: {
    statement: v.string(),
    alternatives: v.array(v.object({ letter: v.string(), text: v.string() })),
    correctLetter: v.string(),
    explanation: v.string(),
    subjectId: v.id("taxonomyNodes"),
    examId: v.id("exams"),
    editionId: v.id("examEditions"),
    difficulty: v.union(v.literal("easy"), v.literal("medium"), v.literal("hard")),
    sourceRef: v.string(),
    sourceOrder: v.number(),
    status: v.union(
      v.literal("draft"),
      v.literal("review"),
      v.literal("published"),
      v.literal("archived"),
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("questions", args);
  },
});
