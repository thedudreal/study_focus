import { getAuthUserId } from "@convex-dev/auth/server";
import { action, mutation, query } from "./_generated/server";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { writeQuestionWithOptions } from "./adminQuestions";
import { parseExamQuestions, hashStatement } from "./lib/pdfExamParser";
import { checkYear, assessFit } from "./lib/examFit";

/**
 * CONTRIBUIÇÕES DE PROVA POR USUÁRIO (comunidade → revisão admin)
 *
 * Fluxo: o usuário envia UM PDF (caderno) com metadados + declaração de
 * direito de uso → a action `analyze` faz a TRIAGEM FRIA (questões
 * parseáveis, ano, originalidade — lib/examFit.ts):
 *   - aceita → questões ficam registradas em estágio (`parsedQuestions`),
 *     prontas para o admin categorizar e publicar; nada vai ao banco
 *     público sem aprovação e sem licença autorizada;
 *   - rejeita → motivo explícito visível para o usuário reenviar corrigido.
 */

const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB

async function requireUserId(
  ctx: GenericMutationCtx<DataModel> | GenericQueryCtx<DataModel>,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx as never);
  if (userId === null) throw new Error("Não autenticado");
  return userId;
}

async function requireAdmin(
  ctx: GenericMutationCtx<DataModel> | GenericQueryCtx<DataModel>,
): Promise<void> {
  const userId = await requireUserId(ctx);
  const user = await ctx.db.get(userId);
  if (user?.role !== "admin") {
    throw new Error("Acesso restrito a administradores");
  }
}

// ============================================================
// 1. SUBMISSÃO (usuário autenticado)
// ============================================================

/** URL de upload direto ao File Storage — qualquer usuário autenticado. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Registra a contribuição após o upload do binário.
 * Declaração de direito de uso OBRIGATÓRIA: sem ela a submissão é recusada.
 */
export const register = mutation({
  args: {
    storageId: v.id("_storage"),
    filename: v.string(),
    contentType: v.string(),
    fileSize: v.number(),
    institution: v.optional(v.string()),
    examName: v.optional(v.string()),
    year: v.optional(v.number()),
    phase: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    /** “Declaro que sou o autor ou tenho permissão de uso do material.” */
    attestedUse: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    if (args.contentType !== "application/pdf") {
      throw new Error("Apenas arquivos PDF são aceitos.");
    }
    if (args.fileSize > MAX_PDF_BYTES) {
      throw new Error("PDF maior que 20 MB — reduza o arquivo.");
    }
    if (!args.attestedUse) {
      throw new Error(
        "É necessário declarar que você tem direito de uso do material.",
      );
    }

    // Dedupe por usuário: mesmo arquivo do MESMO usuário não submissa duas vezes.
    const existing = await ctx.db
      .query("examContributions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const dup = existing.find(
      (c) => c.filename === args.filename && c.fileSize === args.fileSize,
    );
    if (dup) {
      return { duplicate: true as const, contributionId: dup._id };
    }

    const id = await ctx.db.insert("examContributions", {
      userId,
      filename: args.filename,
      fileSize: args.fileSize,
      storageId: args.storageId,
      contentType: args.contentType,
      institution: args.institution,
      examName: args.examName,
      year: args.year,
      phase: args.phase,
      sourceUrl: args.sourceUrl,
      attestedUse: true,
      licenseStatus: "pending",
      status: "uploaded",
      createdAt: Date.now(),
    });
    return { duplicate: false as const, contributionId: id };
  },
});

// ============================================================
// 2. TRIAGEM FRIA (action; unpdf + parser + examFit)
// ============================================================

/** Contexto lido pela action (ownership: dono OU admin). */
export const getAnalysisContext = query({
  args: { contributionId: v.id("examContributions") },
  handler: async (ctx, { contributionId }) => {
    const userId = await requireUserId(ctx);
    const doc = await ctx.db.get(contributionId);
    if (!doc) throw new Error("Contribuição não encontrada.");
    const user = await ctx.db.get(userId);
    if (doc.userId !== userId && user?.role !== "admin") {
      throw new Error("Você só pode analisar suas próprias contribuições.");
    }
    return {
      storageId: doc.storageId,
      year: doc.year,
      status: doc.status,
    };
  },
});

/** Grava o resultado da triagem (chamada pela action, que não tem db). */
export const saveAnalysis = mutation({
  args: {
    contributionId: v.id("examContributions"),
    outcome: v.union(v.literal("accepted"), v.literal("rejected")),
    rejectionReasons: v.array(v.string()),
    warnings: v.array(v.string()),
    year: v.optional(v.number()),
    yearSource: v.optional(
      v.union(
        v.literal("informed_confirmed"),
        v.literal("inferred"),
        v.literal("missing"),
      ),
    ),
    pdfType: v.union(v.literal("text"), v.literal("needs_ocr")),
    pageCount: v.number(),
    extractedChars: v.number(),
    found: v.number(),
    ready: v.number(),
    duplicateInDb: v.number(),
    duplicateInFile: v.number(),
    questions: v.optional(
      v.array(
        v.object({
          number: v.number(),
          statement: v.string(),
          alternatives: v.array(
            v.object({ letter: v.string(), text: v.string() }),
          ),
          correctLetter: v.optional(v.string()),
          startPage: v.number(),
          contentHash: v.string(),
          needsReview: v.boolean(),
          reviewReasons: v.array(v.string()),
          duplicateInDb: v.optional(v.boolean()),
          duplicateInFile: v.optional(v.boolean()),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.contributionId, {
      status: args.outcome === "accepted" ? "analyzed" : "rejected",
      analysis: {
        outcome: args.outcome,
        rejectionReasons: args.rejectionReasons,
        warnings: args.warnings,
        year: args.year,
        yearSource: args.yearSource,
        found: args.found,
        ready: args.ready,
        duplicateInDb: args.duplicateInDb,
        duplicateInFile: args.duplicateInFile,
      },
      pdfType: args.pdfType,
      pageCount: args.pageCount,
      extractedChars: args.extractedChars,
      // Rejeição NÃO registra questões (o usuário corrige e reenvia).
      parsedQuestions:
        args.outcome === "accepted" ? (args.questions ?? undefined) : undefined,
      processedAt: Date.now(),
    });
  },
});

export const markAnalyzing = mutation({
  args: { contributionId: v.id("examContributions") },
  handler: async (ctx, { contributionId }) => {
    const doc = await ctx.db.get(contributionId);
    if (!doc) throw new Error("Contribuição não encontrada.");
    if (doc.status !== "uploaded" && doc.status !== "failed") {
      throw new Error("Esta contribuição já foi analisada.");
    }
    await ctx.db.patch(contributionId, { status: "analyzing" });
    return true;
  },
});

export const markFailed = mutation({
  args: { contributionId: v.id("examContributions"), error: v.string() },
  handler: async (ctx, { contributionId, error }) => {
    await ctx.db.patch(contributionId, {
      status: "failed",
      errorMessage: error,
      processedAt: Date.now(),
    });
  },
});

/**
 * TRIAGEM FRIA: extrai o texto (unpdf), segmenta questões, confere o ano
 * no texto e a originalidade contra o banco, e decide aceitar/rejeitar.
 * Aceito: questões registradas em estágio para revisão admin.
 * Rejeitado: motivo claro; o usuário corrige e reenvia.
 */
export const analyze = action({
  args: { contributionId: v.id("examContributions") },
  handler: async (ctx, { contributionId }) => {
    const docCtx = await ctx.runQuery(api.examContributions.getAnalysisContext, {
      contributionId,
    });

    await ctx.runMutation(api.examContributions.markAnalyzing, {
      contributionId,
    });

    let blob: Blob | null = null;
    try {
      blob = await ctx.storage.get(docCtx.storageId);
    } catch {
      blob = null;
    }
    if (!blob) {
      await ctx.runMutation(api.examContributions.markFailed, {
        contributionId,
        error: "Arquivo não encontrado no storage.",
      });
      throw new Error("Arquivo não encontrado no storage.");
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const { getDocumentProxy, extractText } = await import("unpdf");
    let pages: string[] = [];
    try {
      const pdf = await getDocumentProxy(bytes);
      const result = await extractText(pdf, { mergePages: false });
      pages = result.text as string[];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(api.examContributions.markFailed, {
        contributionId,
        error: `Falha ao ler o PDF: ${msg}`,
      });
      throw new Error("Falha ao ler o PDF.");
    }

    const totalChars = pages.reduce((acc, p) => acc + p.trim().length, 0);
    if (totalChars < 100) {
      await ctx.runMutation(api.examContributions.markFailed, {
        contributionId,
        error:
          "PDF sem texto selecionável (digitalizado). Envie uma versão com texto selecionável ou procure a versão digital oficial.",
      });
      throw new Error(
        "PDF digitalizado (sem texto selecionável) — não é possível analisar. Envie a versão com texto.",
      );
    }

    const parsed = parseExamQuestions(pages);
    if (parsed.questions.length === 0) {
      await ctx.runMutation(api.examContributions.markFailed, {
        contributionId,
        error:
          "Nenhuma questão identificada — o texto existe mas o padrão “QUESTÃO N” com alternativas não foi encontrado.",
      });
      throw new Error(
        "Nenhuma questão identificada (“QUESTÃO N” + alternativas).",
      );
    }

    // ----- Originalidade: hash contra o banco e dentro do próprio arquivo.
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
    let duplicateInDb = 0;
    let duplicateInFile = 0;
    for (const q of parsed.questions) {
      if (q.statement.trim() === "") continue;
      const fingerprint = hashStatement(q.statement);
      const inFile = seen.has(fingerprint);
      if (inFile) duplicateInFile += 1;
      seen.add(fingerprint);
      const inDb = !inFile
        ? await ctx.runQuery(api.examPdfs.checkContentHash, {
            hash: fingerprint,
          })
        : false;
      if (inDb) duplicateInDb += 1;
      staged.push({
        number: q.number,
        statement: q.statement,
        alternatives: q.alternatives,
        startPage: q.startPage,
        contentHash: fingerprint,
        needsReview: q.needsReview || inDb || inFile,
        reviewReasons: [
          ...q.reviewReasons,
          ...(inFile ? ["duplicada dentro do arquivo"] : []),
          ...(inDb ? ["duplicada — já existe no banco"] : []),
        ],
        duplicateInDb: inDb || undefined,
        duplicateInFile: inFile || undefined,
      });
    }

    // ----- Ano: frio — informado precisa constar no texto; senão infere
    // apenas quando há UM único candidato plausível (não inventa).
    const yearCheck = checkYear(pages.join("\n"), docCtx.year);

    const ready = staged.filter((q) => !q.needsReview).length;
    const fit = assessFit(
      {
        found: staged.length,
        ready,
        duplicateInDb,
        duplicateInFile,
      },
      yearCheck,
    );

    await ctx.runMutation(api.examContributions.saveAnalysis, {
      contributionId,
      outcome: fit.outcome,
      rejectionReasons: fit.rejectionReasons,
      warnings: fit.warnings,
      year: yearCheck.year,
      yearSource: yearCheck.source,
      pdfType: "text",
      pageCount: pages.length,
      extractedChars: parsed.totalChars,
      found: staged.length,
      ready,
      duplicateInDb,
      duplicateInFile,
      questions: fit.outcome === "accepted" ? staged : undefined,
    });

    if (fit.outcome === "rejected") {
      throw new Error(`Não se enquadrou no site: ${fit.rejectionReasons[0]}`);
    }

    return {
      status: "analyzed" as const,
      found: staged.length,
      ready,
      warnings: fit.warnings,
    };
  },
});

// ============================================================
// 3. LEITURA PARA O USUÁRIO (minhas submissões)
// ============================================================

/** Lista resumida das contribuições do usuário (o binário fica no storage). */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const docs = await ctx.db
      .query("examContributions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return docs
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((d) => ({
        _id: d._id,
        filename: d.filename,
        status: d.status,
        createdAt: d.createdAt,
        institution: d.institution,
        examName: d.examName,
        year: d.year,
        phase: d.phase,
        licenseStatus: d.licenseStatus,
        errorMessage: d.errorMessage,
        analysis: d.analysis ?? null,
      }));
  },
});

// ============================================================
// 4. ADMIN: revisão, licença e publicação categorizada
// ============================================================

/** Todas as contribuições (painel admin), com estágio completo. */
export const listForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const docs = await ctx.db.query("examContributions").collect();
    return docs.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Admin confirma (ou nega) o direito de uso — trava a publicação. */
export const setLicense = mutation({
  args: {
    contributionId: v.id("examContributions"),
    licenseStatus: v.union(
      v.literal("authorized"),
      v.literal("unauthorized"),
      v.literal("pending"),
    ),
    licenseNotes: v.optional(v.string()),
  },
  handler: async (ctx, { contributionId, licenseStatus, licenseNotes }) => {
    await requireAdmin(ctx);
    const doc = await ctx.db.get(contributionId);
    if (!doc) throw new Error("Contribuição não encontrada.");
    await ctx.db.patch(contributionId, { licenseStatus, licenseNotes });
  },
});

/**
 * Publica UMA questão do estágio da contribuição → `questions` com status
 * "review" (nunca published; a fila de revisão existente aprova).
 * Travas: licença autorizada + não-duplicada + análise aceita.
 */
export const publishQuestion = mutation({
  args: {
    contributionId: v.id("examContributions"),
    questionIndex: v.number(),
    subjectId: v.id("taxonomyNodes"),
    topicId: v.optional(v.id("taxonomyNodes")),
    examId: v.optional(v.id("exams")),
    editionId: v.optional(v.id("examEditions")),
    difficulty: v.union(
      v.literal("easy"),
      v.literal("medium"),
      v.literal("hard"),
    ),
  },
  handler: async (
    ctx,
    { contributionId, questionIndex, subjectId, topicId, examId, editionId, difficulty },
  ) => {
    await requireAdmin(ctx);

    const doc = await ctx.db.get(contributionId);
    if (!doc) throw new Error("Contribuição não encontrada.");
    if (doc.status !== "analyzed") {
      throw new Error("Só contribuições aceitas na triagem podem ser publicadas.");
    }
    const parsed = doc.parsedQuestions ?? [];
    const item = parsed[questionIndex];
    if (!item) throw new Error("Questão do estágio não encontrada.");
    if (item.createdQuestionId) {
      return { alreadyPublished: true as const, questionId: item.createdQuestionId };
    }
    if (item.duplicateInDb || (item.duplicateInFile ?? false)) {
      throw new Error(
        "Questão duplicada — resolva o conflito antes de publicar.",
      );
    }
    if (doc.licenseStatus !== "authorized") {
      throw new Error(
        "Direito de uso pendente — autorize a licença antes de publicar.",
      );
    }
    if (item.alternatives.length < 2) {
      throw new Error("Questão sem alternativas suficientes — publique pelo editor.");
    }
    if (!item.correctLetter) {
      throw new Error(
        "Gabarito ausente — informe a resposta correta no editor antes de publicar.",
      );
    }

    const year = doc.analysis?.year ?? doc.year;
    // Casar edição: já existente com o mesmo ano nessa prova.
    let edition: Id<"examEditions"> | undefined = editionId;
    if (!edition && examId && year !== undefined) {
      const ed = await ctx.db
        .query("examEditions")
        .withIndex("by_exam_year", (q) =>
          q.eq("examId", examId).eq("year", year),
        )
        .first();
      if (ed) edition = ed._id;
    }
    if (!edition && examId && year !== undefined) {
      // NÃO cria edição automaticamente — deixa para o admin no editor.
      edition = undefined;
    }

    const questionId = await writeQuestionWithOptions(ctx, null, {
      statement: item.statement,
      alternatives: item.alternatives,
      correctLetter: item.correctLetter,
      explanation: undefined,
      subjectId,
      topicId,
      examId,
      editionId: edition,
      sourceRef: `Q${item.number}`,
      sourceOrder: item.number,
      difficulty,
      questionType: "multiple_choice",
      sourceId: `pdfcontrib:${contributionId}:q${item.number}`,
      status: "review",
      contentHash: item.contentHash,
    });

    await ctx.db.patch(contributionId, {
      parsedQuestions: parsed.map((q, i) =>
        i === questionIndex ? { ...q, createdQuestionId: questionId } : q,
      ),
    });

    return { alreadyPublished: false as const, questionId };
  },
});
