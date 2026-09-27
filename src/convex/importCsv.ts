import { getAuthUserId } from "@convex-dev/auth/server";
import { action, mutation, query } from "./_generated/server";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel, Id, Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { api } from "./_generated/api";
import {
  parseQuestionsCsv,
  hashStatement,
} from "./lib/csvImport";
import { normalizeDifficulty } from "./lib/questionValidation";

/**
 * IMPORTAÇÃO CSV
 * Fluxo: (1) preview = parse + validação sem gravar; (2) admin confirma;
 * (3) lote é registrado e as questões entram como "review" — NUNCA publicadas
 * automaticamente. Toda operação exige role "admin".
 */

async function requireAdminId(
  ctx: GenericMutationCtx<DataModel> | GenericQueryCtx<DataModel>,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx as never);
  if (userId === null) throw new Error("Não autenticado");
  const user = await ctx.db.get(userId);
  if (user?.role !== "admin") {
    throw new Error("Acesso restrito a administradores");
  }
  return userId;
}

// ---------------- 1. Preview (sem gravação) ----------------

export const previewImport = action({
  args: { csvContent: v.string(), filename: v.string() },
  handler: async (ctx, { csvContent, filename }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Não autenticado");
    const role = await ctx.runQuery(api.adminQuestions.getCurrentUserRole);
    if (role !== "admin") {
      throw new Error("Acesso restrito a administradores");
    }

    const result = parseQuestionsCsv(csvContent);

    return {
      filename,
      totalRows: result.totalRows,
      validCount: result.validCount,
      errorCount: result.errorCount,
      rowErrors: result.rowErrors,
      preview: result.questions.slice(0, 5).map((q) => ({
        row: q.row,
        exam: q.exam,
        year: q.year,
        phase: q.phase,
        subject: q.subject,
        topic: q.topic,
        statement:
          q.statement.length > 120 ? `${q.statement.slice(0, 117)}…` : q.statement,
        options: q.options.length,
        correctAnswer: q.correctAnswer,
      })),
      // Conteúdo completo das válidas é devolvido para a confirmação
      validQuestions: result.questions,
    };
  },
});

// ---------------- 2. Helpers de resolução de taxonomia/exame ----------------

async function resolveTaxonomy(
  ctx: GenericMutationCtx<DataModel>,
  area?: string,
  subject?: string,
  topic?: string,
  subtopic?: string,
): Promise<{ subjectId?: Id<"taxonomyNodes">; topicId?: Id<"taxonomyNodes">; subtopicId?: Id<"taxonomyNodes">; missing: string[] }> {
  const missing: string[] = [];
  let areaId: Id<"taxonomyNodes"> | undefined;
  let subjectId: Id<"taxonomyNodes"> | undefined;
  let topicId: Id<"taxonomyNodes"> | undefined;
  let subtopicId: Id<"taxonomyNodes"> | undefined;

  const nodes = await ctx.db.query("taxonomyNodes").collect();

  if (area) {
    const found = nodes.find(
      (n) => n.level === "area" && n.name.toLowerCase() === area.toLowerCase(),
    );
    if (found) areaId = found._id;
    else missing.push(`área "${area}"`);
  }
  if (subject) {
    // Match por nome em qualquer nível subject (com ou sem área informada)
    const candidates = nodes.filter(
      (n) => n.level === "subject" && n.name.toLowerCase() === subject.toLowerCase(),
    );
    const found =
      (areaId && candidates.find((c) => c.parentId === areaId)) ??
      candidates[0];
    if (found) subjectId = found._id;
    else missing.push(`matéria "${subject}"`);
  }
  if (topic) {
    const found = nodes.find(
      (n) =>
        n.level === "topic" &&
        n.name.toLowerCase() === topic.toLowerCase() &&
        (!subjectId || n.parentId === subjectId),
    );
    if (found) topicId = found._id;
    else missing.push(`assunto "${topic}"`);
  }
  if (subtopic) {
    const found = nodes.find(
      (n) =>
        n.level === "subtopic" &&
        n.name.toLowerCase() === subtopic.toLowerCase() &&
        (!topicId || n.parentId === topicId),
    );
    if (found) subtopicId = found._id;
    else missing.push(`subassunto "${subtopic}"`);
  }

  return { subjectId, topicId, subtopicId, missing };
}

async function resolveExamEdition(
  ctx: GenericMutationCtx<DataModel>,
  examName?: string,
  year?: number,
  phase?: string,
): Promise<{ examId?: Id<"exams">; editionId?: Id<"examEditions">; missing: string[] }> {
  const missing: string[] = [];
  if (!examName) return { examId: undefined, editionId: undefined, missing };

  const exams = await ctx.db.query("exams").collect();
  const exam = exams.find(
    (e) =>
      e.name.toLowerCase() === examName.toLowerCase() ||
      e.slug.toLowerCase() === examName.toLowerCase().replace(/\s+/g, "-"),
  );
  if (!exam) {
    missing.push(`prova "${examName}"`);
    return { examId: undefined, editionId: undefined, missing };
  }

  if (year === undefined) {
    return { examId: exam._id, editionId: undefined, missing };
  }

  const editions = await ctx.db
    .query("examEditions")
    .withIndex("by_exam_year", (q) => q.eq("examId", exam._id).eq("year", year))
    .collect();

  const found = editions.find(
    (ed) =>
      (phase ?? "").toLowerCase() === (ed.phase ?? "").toLowerCase() ||
      (ed.phase === undefined && !phase),
  );
  let edition: Doc<"examEditions"> | undefined = found;
  if (!edition) {
    // Cria a edição automaticamente — estrutura (Instituição→Prova→Ano→Fase)
    // é preenchida conforme novos CSVs chegam.
    const newEditionId = await ctx.db.insert("examEditions", {
      examId: exam._id,
      year,
      phase: phase || "Prova única",
    });
    edition = (await ctx.db.get(newEditionId)) ?? undefined;
  }

  return { examId: exam._id, editionId: edition?._id, missing };
}

// ---------------- 3. Importação confirmada ----------------

export const confirmImport = mutation({
  args: {
    filename: v.string(),
    questions: v.array(
      v.object({
        row: v.number(),
        exam: v.string(),
        year: v.optional(v.number()),
        phase: v.optional(v.string()),
        area: v.optional(v.string()),
        subject: v.string(),
        topic: v.optional(v.string()),
        subtopic: v.optional(v.string()),
        difficulty: v.optional(v.string()),
        type: v.optional(v.string()),
        statement: v.string(),
        options: v.array(v.object({ label: v.string(), text: v.string() })),
        correctAnswer: v.string(),
        explanation: v.optional(v.string()),
        source: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { filename, questions }) => {
    const userId = await requireAdminId(ctx);

    if (questions.length === 0) {
      throw new Error("Nenhuma questão válida para importar.");
    }

    // 3.1 Cria o lote
    const batchId = await ctx.db.insert("importBatches", {
      filename,
      totalRows: questions.length,
      validRows: questions.length,
      errorRows: 0,
      importedCount: 0,
      status: "importing" as const,
      createdAt: Date.now(),
      createdBy: userId,
    });

    const perRow: { row: number; ok: boolean; errors?: string[] }[] = [];
    let imported = 0;

    for (const q of questions) {
      const errors: string[] = [];

      // 3.2 Resolve taxonomia e exame/edição
      const taxonomy = await resolveTaxonomy(
        ctx,
        q.area,
        q.subject,
        q.topic,
        q.subtopic,
      );
      if (taxonomy.missing.length > 0) errors.push(...taxonomy.missing);
      if (!taxonomy.subjectId) errors.push("matéria obrigatória não resolvida");

      const exam = await resolveExamEdition(ctx, q.exam, q.year, q.phase);
      if (exam.missing.length > 0) errors.push(...exam.missing);

      // 3.3 Fonte: registra/acha por nome (com status unverified por padrão)
      let sourceDbId: Id<"sources"> | undefined;
      if (q.source) {
        const existing = await ctx.db
          .query("sources")
          .withIndex("by_verification", (s) => s.eq("verificationStatus", "unverified"))
          .collect();
        const match = existing.find((s) => s.name === q.source);
        sourceDbId =
          match?._id ??
          (await ctx.db.insert("sources", {
            name: q.source,
            verificationStatus: "unverified" as const,
          }));
      }

      if (errors.length === 0 && taxonomy.subjectId) {
        // 3.4 Grava como REVIEW (nunca published)
        await ctx.db.insert("questions", {
          statement: q.statement,
          alternatives: q.options.map((o) => ({
            letter: o.label,
            text: o.text,
          })),
          correctLetter: q.correctAnswer,
          explanation: q.explanation,
          subjectId: taxonomy.subjectId,
          topicId: taxonomy.topicId,
          subtopicId: taxonomy.subtopicId,
          examId: exam.examId,
          editionId: exam.editionId,
          difficulty: normalizeDifficulty(q.difficulty),
          questionType: "multiple_choice" as const,
          sourceId: q.source ? `csv:${filename}:${q.row}` : undefined,
          sourceDbId,
          status: "review" as const,
          importBatchId: batchId,
          contentHash: hashStatement(q.statement),
        });
        imported += 1;
        perRow.push({ row: q.row, ok: true });
      } else {
        perRow.push({ row: q.row, ok: false, errors });
      }
    }

    // 3.5 Finaliza o lote
    await ctx.db.patch(batchId, {
      importedCount: imported,
      status: imported === questions.length ? ("imported" as const) : ("failed" as const),
    });

    return {
      batchId,
      imported,
      failed: questions.length - imported,
      perRow,
    };
  },
});

/** Cancelamento explícito do lote em preview (nada foi gravado ainda). */
export const cancelImport = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdminId(ctx);
    return { cancelled: true };
  },
});

// ---------------- 4. Histórico de lotes ----------------

export const listBatches = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminId(ctx);
    const batches = await ctx.db.query("importBatches").collect();
    return batches.sort((a, b) => b.createdAt - a.createdAt);
  },
});
