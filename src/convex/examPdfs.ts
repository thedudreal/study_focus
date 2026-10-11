import { getAuthUserId } from "@convex-dev/auth/server";
import { action, mutation, query } from "./_generated/server";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { writeQuestionWithOptions } from "./adminQuestions";
import {
  parseExamQuestions,
  parseAnswerKey,
  applyAnswerKey,
  hashStatement,
} from "./lib/pdfExamParser";

/**
 * IMPORTAÇÃO DE PROVAS EM PDF (painel admin)
 * Fluxo: upload (mutation + File Storage) → extractPdf (action, unpdf) →
 * questões identificadas em revisão → contentHash dedupe → publicação.
 * Nada é publicado automaticamente; questões incompletas ficam sinalizadas.
 */

const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB

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

// ============================================================
// 1. UPLOAD (mutation; o binário vai para o File Storage via client)
// ============================================================

/** URL de upload direto ao File Storage (o cliente faz POST com o PDF). */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdminId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Registrar o arquivo já enviado ao File Storage. O cliente faz o upload
 * direto via generatedUrl (progresso nativo do fetch) e chama aqui com o
 * storageId — validamos tipo, tamanho e evitamos duplicado por nome+batch.
 */
export const registerUpload = mutation({
  args: {
    batchId: v.string(),
    kind: v.union(v.literal("exam_paper"), v.literal("answer_key")),
    storageId: v.id("_storage"),
    filename: v.string(),
    contentType: v.string(),
    fileSize: v.number(),
    institution: v.optional(v.string()),
    examName: v.optional(v.string()),
    year: v.optional(v.number()),
    phase: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    licenseStatus: v.union(
      v.literal("pending"),
      v.literal("authorized"),
      v.literal("unauthorized"),
    ),
    licenseNotes: v.optional(v.string()),
    /** Hash do conteúdo do arquivo (sha-1 hex do client) p/ dedupe. */
    fileFingerprint: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminId(ctx);

    if (args.contentType !== "application/pdf") {
      throw new Error("Apenas arquivos PDF são aceitos.");
    }
    if (args.fileSize > MAX_PDF_BYTES) {
      throw new Error("PDF maior que 20 MB — reduza o arquivo.");
    }

    // Dedupe: mesmo arquivo (mesma batch + kind + filename) Não duplica
    const batchDocs = await ctx.db
      .query("examPdfs")
      .withIndex("by_batch", (q) => q.eq("batchId", args.batchId))
      .collect();
    const dup = batchDocs.find(
      (b) => b.kind === args.kind && b.filename === args.filename,
    );
    if (dup && dup.status !== "failed") {
      // Idempotência: mesmo arquivo reenviado devolve o registro existente.
      return { duplicate: true as const, examPdfId: dup._id };
    }

    // Re-upload após falha: substitui o registro e evita storage órfão.
    if (dup) {
      await ctx.storage.delete(dup.storageId);
      await ctx.db.delete(dup._id);
    }

    const creatorId = await requireAdminId(ctx);
    const id = await ctx.db.insert("examPdfs", {
      kind: args.kind,
      batchId: args.batchId,
      filename: args.filename,
      fileSize: args.fileSize,
      storageId: args.storageId,
      contentType: args.contentType,
      institution: args.institution,
      examName: args.examName,
      year: args.year,
      phase: args.phase,
      sourceUrl: args.sourceUrl,
      licenseStatus: args.licenseStatus,
      licenseNotes: args.licenseNotes,
      status: "uploaded",
      createdAt: Date.now(),
      createdBy: creatorId,
    });
    return { duplicate: false as const, examPdfId: id };
  },
});

// ============================================================
// 2. EXTRAÇÃO (action: unpdf, roda em Node)
// ============================================================



/**
 * Extrai texto do PDF (texto selecionável), segmenta questões e associa o
 * gabarito quando enviado. GRÁVA as questões como "review" NUNCA published.
 */
export const extractPdf = action({
  args: { examPdfId: v.id("examPdfs") },
  handler: async (ctx, { examPdfId }) => {
    const userId = await ctx.runQuery(api.adminQuestions.getCurrentUserRole, {});
    if (userId !== "admin") {
      throw new Error("Acesso restrito a administradores");
    }

    const pdfDoc = await ctx.runMutation(api.examPdfs.markProcessing, {
      examPdfId,
    });
    const pdfRec = pdfDoc;

    // Pega binário do File Storage.
    const blob = await ctx.storage.get(pdfRec.storageId);
    if (!blob) {
      await ctx.runMutation(api.examPdfs.markFailed, {
        examPdfId,
        error: "Arquivo PDF não encontrado no storage.",
      });
      throw new Error("Arquivo PDF não encontrado no storage.");
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());

    // unpdf: build serverless do pdf.js — sem canvas para extração de texto.
    const { getDocumentProxy, extractText } = await import("unpdf");
    let pages: string[] = [];
    let pdfType: "text" | "needs_ocr" = "text";
    try {
      const pdf = await getDocumentProxy(bytes);
      const result = await extractText(pdf, { mergePages: false });
      pages = result.text as string[];
      const total = pages.reduce((acc, p) => acc + p.trim().length, 0);
      pdfType = total < 100 ? "needs_ocr" : "text";
    } catch (err) {
      await ctx.runMutation(api.examPdfs.markFailed, {
        examPdfId,
        error: `Falha ao ler o PDF: ${err instanceof Error ? err.message : String(err)}`,
      });
      throw new Error("Falha ao ler o PDF.");
    }

    if (pdfType === "needs_ocr") {
      await ctx.runMutation(api.examPdfs.markNeedsOcr, { examPdfId });
      throw new Error(
        "PDF sem texto selecionável (digitalizado). OCR manual necessário — o arquivo ficou marcado como needs_ocr.",
      );
    }

    // ---- Parse do caderno ----
    const parsed = parseExamQuestions(pages);
    if (parsed.questions.length === 0) {
      await ctx.runMutation(api.examPdfs.markFailed, {
        examPdfId,
        error:
          "Nenhuma questão identificada. O PDF tem texto, mas o formato não é reconhecível (padrão 'QUESTÃO N'). Edite manualmente ou envie CSV.",
      });
      throw new Error("Nenhuma questão identificada no PDF.");
    }

    // ---- Gabarito (opcional, outra tabela examPdfs no mesmo batch) ----
    const batchSiblings = await ctx.runQuery(api.examPdfs.listByBatch, {
      batchId: pdfRec.batchId,
    });
    const keyPdf = batchSiblings.find(
      (b) =>
        b.kind === "answer_key" &&
        ((b as { storageIdInternal?: Id<"_storage"> }).storageIdInternal !== undefined),
    ) as { _id: Id<"examPdfs">; storageIdInternal: Id<"_storage"> } | undefined;
    let parsedQuestions = parsed.questions;
    if (keyPdf && keyPdf.storageIdInternal) {
      const keyBlob = await ctx.storage.get(keyPdf.storageIdInternal);
      if (keyBlob) {
        const keyBytes = new Uint8Array(await keyBlob.arrayBuffer());
        try {
          const keyPdfDoc = await getDocumentProxy(keyBytes);
          const keyResult = await extractText(keyPdfDoc, { mergePages: true });
          const keyText = keyResult.text as string;
          const key = parseAnswerKey(keyText);
          if (!key.needsReview) {
            parsedQuestions = applyAnswerKey(parsedQuestions, key);
          }
          // gabarito parseado: grava no próprio doc do gabarito
          await ctx.runMutation(api.examPdfs.patchAnswerKeyStatus, {
            answerKeyPdfId: keyPdf._id,
            extractedChars: keyText.length,
          });
        } catch {
          // gabarito ilegível: questões ficam pendentes de validação manual
        }
      }
    }

    // ---- Dedupe intra-arquivo + associação de gabarito por número ----
    const staged: {
      number: number;
      statement: string;
      alternatives: { letter: string; text: string }[];
      correctLetter?: string;
      startPage: number;
      contentHash: string;
      needsReview: boolean;
      reviewReasons: string[];
      duplicateInDb?: boolean;
      duplicateInFile?: boolean;
    }[] = [];
    const seen = new Set<string>();
    let countInFile = 0;
    let countInDb = 0;
    for (const q of parsedQuestions) {
      if (q.statement.trim() === "") continue;
      const fingerprint = hashStatement(q.statement);
      const inFile = seen.has(fingerprint);
      if (inFile) {
        countInFile += 1;
      }
      seen.add(fingerprint);
      const inDb = !inFile
        ? await ctx.runQuery(api.examPdfs.checkContentHash, { hash: fingerprint })
        : false;
      if (inDb) countInDb += 1;
      staged.push({
        number: q.number,
        statement: q.statement,
        alternatives: q.alternatives,
        // gabarito associado na etapa applyAnswerKey →vem em needsReview/
        // reviewReasons; a letra correta chega via revisão manual quando ausente
        startPage: q.startPage,
        contentHash: fingerprint,
        needsReview: q.needsReview || inDb || inFile,
        reviewReasons: [
          ...q.reviewReasons,
          ...(inFile ? ["duplicada dentro do arquivo"] : []),
          ...(inDb ? ["duplicada — enunciado idêntico já existe no banco"] : []),
        ],
        duplicateInDb: inDb || undefined,
        duplicateInFile: inFile || undefined,
      });
    }

    await ctx.runMutation(api.examPdfs.saveExtracted, {
      examPdfId,
      pdfType,
      pageCount: pages.length,
      extractedChars: parsed.totalChars,
      questions: staged,
    });

    const ready = staged.filter(
      (q) => !q.needsReview && q.correctLetter === undefined
        ? false
        : !q.needsReview,
    ).length;

    return {
      found: staged.length,
      ready,
      incomplete: staged.length - ready,
      duplicateInFile: countInFile,
      duplicateInDb: countInDb,
    };
  },
});

// ============================================================
// 3. MUTAÇÕES DE STATUS (chamadas pela action)
// ============================================================

export const markProcessing = mutation({
  args: { examPdfId: v.id("examPdfs") },
  handler: async (ctx, { examPdfId }) => {
    await ctx.db.patch(examPdfId, { status: "processing" });
    const doc = await ctx.db.get(examPdfId);
    if (!doc) throw new Error("Registro não encontrado");
    return doc;
  },
});

/** Status do doc de gabarito após parse na action (action não tem db). */
export const patchAnswerKeyStatus = mutation({
  args: {
    answerKeyPdfId: v.id("examPdfs"),
    extractedChars: v.number(),
  },
  handler: async (ctx, { answerKeyPdfId, extractedChars }) => {
    await ctx.db.patch(answerKeyPdfId, {
      pdfType: "text",
      extractedChars,
      processedAt: Date.now(),
    });
  },
});

export const markNeedsOcr = mutation({
  args: { examPdfId: v.id("examPdfs") },
  handler: async (ctx, { examPdfId }) => {
    await ctx.db.patch(examPdfId, {
      status: "awaiting_review",
      pdfType: "needs_ocr",
      processedAt: Date.now(),
    });
  },
});

export const markFailed = mutation({
  args: { examPdfId: v.id("examPdfs"), error: v.string() },
  handler: async (ctx, { examPdfId, error }) => {
    await ctx.db.patch(examPdfId, {
      status: "failed",
      errorMessage: error,
      processedAt: Date.now(),
    });
  },
});

/** Retry: volta para uploaded e permite nova tentativa de extração. */
export const resetForRetry = mutation({
  args: { examPdfId: v.id("examPdfs") },
  handler: async (ctx, { examPdfId }) => {
    await ctx.db.patch(examPdfId, {
      status: "uploaded",
      errorMessage: undefined,
    });
  },
});

// ============================================================
// PUBLICAÇÃO (etapa H): stage → questions, com fluxo editorial.
// ============================================================

/**
 * Publica UMA questão do stage no banco real (questions), em "review" —
 * NUNCA "published": a aprovação acontece na fila de revisão existente
 * (AdminQuestionForm → setStatus, que revalida antes de publicar).
 * A matéria é escolhida EXPLICITAMENTE pelo admin (taxonomia existente).
 */
export const publishParsedQuestion = mutation({
  args: {
    examPdfId: v.id("examPdfs"),
    questionIndex: v.number(),
    subjectId: v.id("taxonomyNodes"),
    topicId: v.optional(v.id("taxonomyNodes")),
    examId: v.optional(v.id("exams")),
    editionId: v.optional(v.id("examEditions")),
    difficulty: v.union(v.literal("easy"), v.literal("medium"), v.literal("hard")),
  },
  handler: async (
    ctx,
    { examPdfId, questionIndex, subjectId, topicId, examId, editionId, difficulty },
  ) => {
    await requireAdminId(ctx);

    const doc = await ctx.db.get(examPdfId);
    if (!doc) throw new Error("Registro de PDF não encontrado");
    const parsed = doc.parsedQuestions ?? [];
    const item = parsed[questionIndex];
    if (!item) throw new Error("Questão do stage não encontrada");
    if (item.createdQuestionId) {
      return { alreadyPublished: true as const, questionId: item.createdQuestionId };
    }
    if (item.duplicateInDb || (item.duplicateInFile ?? false)) {
      throw new Error(
        "Questão duplicada — resolva o conflito no editor antes de publicar.",
      );
    }

    // Direito de uso: pendência de licença não publica nada.
    if (doc.licenseStatus !== "authorized") {
      throw new Error(
        "Direito de uso pendente. Registre a autorização da fonte antes de publicar questões desta prova.",
      );
    }

    // Number → sourceRef (rastreio); contentHash → dedupe já implementado.
    const questionId = await writeQuestionWithOptions(ctx, null, {
      statement: item.statement,
      alternatives: item.alternatives,
      correctLetter: item.correctLetter ?? "?",
      explanation: undefined,
      subjectId,
      topicId,
      examId,
      editionId,
      sourceRef: `Q${item.number}`,
      sourceOrder: item.number,
      difficulty,
      questionType: "multiple_choice",
      sourceId: `pdf:${examPdfId}:q${item.number}`,
      // src: se qualquer alternativa existe, sourceDbId é desconhecido aqui
      imageUrl: undefined,
      status: "review",
      contentHash: item.contentHash,
    });

    await ctx.db.patch(examPdfId, {
      parsedQuestions: parsed.map((q, i) =>
        i === questionIndex ? { ...q, createdQuestionId: questionId } : q,
      ),
    });

    // Lote todo publicado? marca como_completed
    const anyPending = parsed.some(
      (q, i) => i !== questionIndex && !q.createdQuestionId,
    );
    if (!anyPending && doc.status === "awaiting_review") {
      await ctx.db.patch(examPdfId, { status: "completed" });
    }

    return { alreadyPublished: false as const, questionId };
  },
});

// ============================================================
// 4. PERSISTÊNCIA DAS QUESTÕES EXTRAÍDAS
// ============================================================

/** Grava o resultado da extração no doc examPdfs (stage PRÉ-banco). */
export const saveExtracted = mutation({
  args: {
    examPdfId: v.id("examPdfs"),
    pdfType: v.union(v.literal("text"), v.literal("needs_ocr")),
    pageCount: v.number(),
    extractedChars: v.number(),
    questions: v.array(
      v.object({
        number: v.number(),
        statement: v.string(),
        alternatives: v.array(v.object({ letter: v.string(), text: v.string() })),
        correctLetter: v.optional(v.string()),
        startPage: v.number(),
        contentHash: v.string(),
        needsReview: v.boolean(),
        reviewReasons: v.array(v.string()),
        duplicateInDb: v.optional(v.boolean()),
        duplicateInFile: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, { examPdfId, pdfType, pageCount, extractedChars, questions }) => {
    await ctx.db.patch(examPdfId, {
      status: "awaiting_review",
      pdfType,
      pageCount,
      extractedChars,
      parsedQuestions: questions,
      processedAt: Date.now(),
    });
  },
});

// ============================================================
// 5. QUERIES PARA A UI
// ============================================================

export const listByBatch = query({
  args: { batchId: v.string() },
  handler: async (ctx, { batchId }) => {
    await requireAdminId(ctx);
    const docs = await ctx.db
      .query("examPdfs")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .collect();
    return docs.map((d) => ({
      _id: d._id,
      kind: d.kind,
      filename: d.filename,
      status: d.status,
      pdfType: d.pdfType,
      errorMessage: d.errorMessage,
      fileSize: d.fileSize,
      year: d.year,
      phase: d.phase,
      /** Internal: usado pela action extractPdf (gabarito). */
      storageIdInternal: d.storageId,
    }));
  },
});

export const checkContentHash = query({
  args: { hash: v.string() },
  handler: async (ctx, { hash }) => {
    const found = await ctx.db
      .query("questions")
      .withIndex("by_content_hash", (q) => q.eq("contentHash", hash))
      .first();
    return found !== null;
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminId(ctx);
    const docs = await ctx.db.query("examPdfs").collect();
    return docs.sort((a, b) => b.createdAt - a.createdAt);
  },
});
