import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

// ============================================================
// DOMÍNIO: TAXONOMIA (Área → Matéria → Tópico → Subtópico)
// ============================================================

export const taxonomyLevels = ["area", "subject", "topic", "subtopic"] as const;

export const taxonomyNodes = defineTable({
  level: v.union(
    v.literal("area"),
    v.literal("subject"),
    v.literal("topic"),
    v.literal("subtopic"),
  ),
  name: v.string(),
  slug: v.string(),
  parentId: v.optional(v.id("taxonomyNodes")),
  order: v.optional(v.number()),
}).index("by_parent", ["level", "parentId"]);

// ============================================================
// DOMÍNIO: EXAMES (Instituição → Prova → Ano → Fase)
// ============================================================

export const exams = defineTable({
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
  country: v.optional(v.string()),
  status: v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
}).index("by_slug", ["slug"]).index("by_status", ["status"]);

export const examEditions = defineTable({
  examId: v.id("exams"),
  year: v.number(),
  phase: v.optional(v.string()), // "1ª fase", "2ª fase", "Caderno azul"...
  label: v.optional(v.string()),
  questionCount: v.optional(v.number()),
}).index("by_exam_year", ["examId", "year"]);

/** Instituições (USP, INEP, UNICAMP...) — provedor das provas */
export const institutions = defineTable({
  name: v.string(),
  slug: v.string(),
  description: v.optional(v.string()),
}).index("by_slug", ["slug"]);

/** Fontes de conteúdo com rastreio de licença/permissão */
export const sources = defineTable({
  name: v.string(),
  organization: v.optional(v.string()),
  url: v.optional(v.string()),
  licenseOrPermission: v.optional(v.string()),
  verificationStatus: v.union(
    v.literal("unverified"),
    v.literal("pending"),
    v.literal("verified"),
    v.literal("rejected"),
  ),
  verifiedAt: v.optional(v.number()),
  notes: v.optional(v.string()),
}).index("by_verification", ["verificationStatus"]);

// ============================================================
// DOMÍNIO: QUESTÕES
// ============================================================

export const questions = defineTable({
  statement: v.string(),
  alternatives: v.array(
    v.object({
      letter: v.string(),
      text: v.string(),
    }),
  ),
  correctLetter: v.string(),
  explanation: v.optional(v.string()),
  /** Contexto/enunciado base compartilhado por questões de prova */
  context: v.optional(v.string()),
  subjectId: v.id("taxonomyNodes"),
  topicId: v.optional(v.id("taxonomyNodes")),
  subtopicId: v.optional(v.id("taxonomyNodes")),
  examId: v.optional(v.id("exams")),
  editionId: v.optional(v.id("examEditions")),
  /** Identificador da questão dentro da prova original, preserva ordem */
  sourceRef: v.optional(v.string()),
  sourceOrder: v.optional(v.number()),
  difficulty: v.union(
    v.literal("easy"),
    v.literal("medium"),
    v.literal("hard"),
  ),
  /** Tipo de questão (múltipla escolha hoje; futuro: dissertativa etc.) */
  questionType: v.optional(v.union(v.literal("multiple_choice"))),
  /** Identificador externo de origem (dedupe com fontes externas) */
  sourceId: v.optional(v.string()),
  /** Fonte documentada (quando aplicável) */
  sourceDbId: v.optional(v.id("sources")),
  imageUrl: v.optional(v.string()),
  status: v.union(
    v.literal("draft"),
    v.literal("review"),
    v.literal("published"),
    v.literal("archived"),
  ),
  /** Lote de importação que originou a questão (rastreabilidade) */
  importBatchId: v.optional(v.id("importBatches")),
  /** Hash para detecção de duplicatas (índice by_content_hash; import e
   *  criação manual consultam antes de gravar) */
  contentHash: v.optional(v.string()),
  /**
   * Proveniência do gabarito: de onde veio a letra correta.
   * "official" = gabarito oficial aplicado (PDF próprio, busca confirmada);
   * "in_document" = extraído do corpo do PDF, aguarda confirmação;
   * "provisional" = atribuição manual provisória, substituível.
   * Ausente = fluxo antigo/CSV (sem rastreio) — não é um erro.
   */
  keySource: v.optional(
    v.union(
      v.literal("official"),
      v.literal("in_document"),
      v.literal("provisional"),
    ),
  ),
  videoId: v.optional(v.id("videos")),
}).index("by_status", ["status"])
  .index("by_exam", ["examId", "status"])
  .index("by_edition", ["editionId", "sourceOrder"])
  .index("by_subject", ["subjectId", "status"])
  .index("by_batch", ["importBatchId"])
  .index("by_source_id", ["sourceId"])
  .index("by_content_hash", ["contentHash"])
  .searchIndex("search_statement", {
    searchField: "statement",
    filterFields: ["status"],
  });

/**
 * Alternativas normalizadas (tabela própria).
 * A questions.alternatives embutida é mantida para leitura rápida;
 * a tabela autoritativa para validação e edição fina é esta.
 */
export const questionOptions = defineTable({
  questionId: v.id("questions"),
  label: v.string(), // "A".."E"
  text: v.string(),
  isCorrect: v.boolean(),
  order: v.number(),
}).index("by_question_order", ["questionId", "order"]);

/** Lote de importação CSV (rastreabilidade e auditoria) */
export const importBatches = defineTable({
  filename: v.string(),
  totalRows: v.number(),
  validRows: v.number(),
  errorRows: v.number(),
  importedCount: v.number(),
  status: v.union(
    v.literal("validating"),
    v.literal("ready"),
    v.literal("importing"),
    v.literal("imported"),
    v.literal("failed"),
    v.literal("cancelled"),
  ),
  errors: v.optional(v.array(v.object({
    row: v.number(),
    errors: v.array(v.string()),
  }))),
  createdAt: v.number(),
  createdBy: v.id("users"),
}).index("by_status", ["status"]);

// ============================================================
// DOMÍNIO: IMPORTAÇÃO DE PROVAS EM PDF (painel admin)
//
// Fluxo: PDF(s) enviados → extração (action) → questões identificadas →
// revisão manual → aprovação → publicação. Reutiliza questions/importBatches/
// sources (dedupe via contentHash) — NÃO cria banco paralelo de questões.
// ============================================================

/**
 * Documento PDF da prova (caderno e/ou gabarito), acompanhamento de status
 * e metadados de direito de uso. O arquivo binário vive no File Storage do
 * Convex (storageId); esta tabela é o registro/sobre ele.
 */
export const examPdfs = defineTable({
  /** "exam_paper" = caderno de questões; "answer_key" = gabarito oficial. */
  kind: v.union(v.literal("exam_paper"), v.literal("answer_key")),
  /** Lote lógico: caderno + gabarito da MESMA prova compartilham o ID. */
  batchId: v.string(),
  filename: v.string(),
  /** Tamanho em bytes (validação: máx. 20 MB no upload). */
  fileSize: v.number(),
  /** Referência probrivada ao binário no File Storage do Convex. */
  storageId: v.id("_storage"),
  /** Mime type validado no upload (só "application/pdf" aceito). */
  contentType: v.string(),
  /** Metadados da prova informados no upload. */
  institution: v.optional(v.string()),
  examName: v.optional(v.string()),
  year: v.optional(v.number()),
  phase: v.optional(v.string()),

  // DIREITO DE USO — registrado, nunca presumido:
  sourceUrl: v.optional(v.string()),
  licenseStatus: v.union(
    v.literal("pending"),
    v.literal("authorized"),
    v.literal("unauthorized"),
  ),
  licenseNotes: v.optional(v.string()),

  // PIPELINE: uploaded → processing → extracting → awaiting_review →
  // completed | failed
  status: v.union(
    v.literal("uploaded"),
    v.literal("processing"),
    v.literal("extracting"),
    v.literal("awaiting_review"),
    v.literal("completed"),
    v.literal("failed"),
  ),
  /** Mensagem do último erro (para "tentar novamente"). */
  errorMessage: v.optional(v.string()),
  /** Identificação do tipo de PDF: "text" | "needs_ocr" (digitalizado). */
  pdfType: v.optional(v.union(v.literal("text"), v.literal("needs_ocr"))),
  pageCount: v.optional(v.number()),
  /** Total de caracteres extraídos (0 → provável digitalizado). */
  extractedChars: v.optional(v.number()),
  /**
   * Questões extraídas EM ESTÁGIO (pós-parse, PRÉ-banco). A publicação real
   * escreve em `questions` via editor admin — nada entra no banco sem
   * revisão. Cada item guarda hash, página de origem e motivos de revisão.
   */
  parsedQuestions: v.optional(
    v.array(
      v.object({
        number: v.number(),
        statement: v.string(),
        alternatives: v.array(v.object({ letter: v.string(), text: v.string() })),
        correctLetter: v.optional(v.string()),
        startPage: v.number(),
        contentHash: v.string(),
        needsReview: v.boolean(),
        reviewReasons: v.array(v.string()),
        /** true quando hash idêntico já existe no banco de questões. */
        duplicateInDb: v.optional(v.boolean()),
        /** true quando hash repete dentro do próprio arquivo. */
        duplicateInFile: v.optional(v.boolean()),
        /** Preenchido ao aprovar: id da questão real criada em `questions`. */
        createdQuestionId: v.optional(v.id("questions")),
      }),
    ),
  ),
  createdAt: v.number(),
  processedAt: v.optional(v.number()),
  createdBy: v.id("users"),
})
  .index("by_batch", ["batchId"])
  .index("by_status", ["status"])
  .index("by_created", ["createdAt"]);

// ============================================================
// DOMÍNIO: CONTRIBUIÇÃO DE PROVA POR USUÁRIO (comunidade → revisão)
//
// Qualquer usuário autenticado envia UM PDF (caderno); o sistema faz a
// triagem fria (questões parseáveis + ano + originalidade. ver
// lib/examFit.ts). Aceitos ficam registrados como estágio para o admin
// revisar e categorizar; nada vira questões do site sem aprovação admin.
// ============================================================

/**
 * Contribuição de um usuário: 1 PDF de caderno + metadados + resultado
 * da triagem. O binário vive no File Storage (storageId).
 */
export const examContributions = defineTable({
  userId: v.id("users"),
  filename: v.string(),
  fileSize: v.number(),
  storageId: v.id("_storage"),
  contentType: v.string(),

  /** Metadados informados pelo usuário (todos opcionais). */
  institution: v.optional(v.string()),
  examName: v.optional(v.string()),
  year: v.optional(v.number()),
  phase: v.optional(v.string()),

  /** IDENTIFICAÇÃO AUTOMÁTICA (lib/examProfile.ts, a partir do texto). */
  detectedExamType: v.optional(
    v.union(
      v.literal("vestibular"),
      v.literal("enem"),
      v.literal("concurso"),
      v.literal("certification"),
    ),
  ),
  detectedPhase: v.optional(v.string()),
  /** URL oficial da fonte (rastreio do direito de uso). */
  sourceUrl: v.optional(v.string()),
  /** Declaração do usuário: “sou o autor ou tenho direito de uso”. */
  attestedUse: v.boolean(),

  /** Avaliação do direito de uso — só o admin muda de “pending”. */
  licenseStatus: v.union(
    v.literal("pending"),
    v.literal("authorized"),
    v.literal("unauthorized"),
  ),
  licenseNotes: v.optional(v.string()),

  // PIPELINE: uploaded → analyzing → analyzed | rejected | failed
  status: v.union(
    v.literal("uploaded"),
    v.literal("analyzing"),
    v.literal("analyzed"),
    v.literal("rejected"),
    v.literal("failed"),
  ),
  errorMessage: v.optional(v.string()),
  pdfType: v.optional(v.union(v.literal("text"), v.literal("needs_ocr"))),
  pageCount: v.optional(v.number()),
  extractedChars: v.optional(v.number()),

  /** Resumo da triagem fria (motivos legíveis, o que o usuário vê). */
  analysis: v.optional(
    v.object({
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
      found: v.number(),
      ready: v.number(),
      duplicateInDb: v.number(),
      duplicateInFile: v.number(),
    }),
  ),

  /**
   * Questões registradas EM ESTÁGIO (só quando a triagem aceita o conjunto).
   * O admin categoriza e publica (nunca automático).
   */
  parsedQuestions: v.optional(
    v.array(
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
        createdQuestionId: v.optional(v.id("questions")),
        /** Dificuldade ESTIMADA automaticamente (admin pode mudar). */
        difficulty: v.optional(
          v.union(v.literal("easy"), v.literal("medium"), v.literal("hard")),
        ),
        /** Proveniência da letra correta deste estágio. */
        keySource: v.optional(
          v.union(
            v.literal("in_document"),
            v.literal("provisional"),
            v.literal("official"),
          ),
        ),
      }),
    ),
  ),

  createdAt: v.number(),
  processedAt: v.optional(v.number()),
})
  .index("by_user", ["userId"])
  .index("by_status", ["status"])
  .index("by_created", ["createdAt"]);

/**
 * FILA DE BUSCA POR GABARITO OFICIAL.
 * Cada registro = uma questão (identificada por contentHash + contexto)
 * cuja letra correta ainda não é oficial. O search action usa a API Exa
 * (env EXA_API_KEY), extrai candidatos de snippets e o admin aprova.
 */
export const answerKeySearches = defineTable({
  /** Dedupe e associação ao estágio/questão publicada. */
  contentHash: v.string(),
  contributionId: v.optional(v.id("examContributions")),
  questionNumber: v.number(),
  examName: v.optional(v.string()),
  institution: v.optional(v.string()),
  year: v.optional(v.number()),
  phase: v.optional(v.string()),

  /** Consulta congelada (determinística, lib/examProfile.ts). */
  searchQuery: v.string(),
  status: v.union(
    v.literal("queued"),
    v.literal("searched"),
    v.literal("not_found"),
    v.literal("applied"),
    v.literal("failed"),
  ),
  /** Candidatos extraídos de snippets; NUNCA aplicados sem aprovação. */
  candidates: v.array(
    v.object({
      letter: v.string(),
      title: v.optional(v.string()),
      sourceUrl: v.string(),
      snippet: v.string(),
      foundAt: v.number(),
    }),
  ),
  errorMessage: v.optional(v.string()),
  appliedQuestionId: v.optional(v.id("questions")),
  createdAt: v.number(),
  searchedAt: v.optional(v.number()),
})
  .index("by_hash", ["contentHash"])
  .index("by_status", ["status"])
  .index("by_created", ["createdAt"]);

export const videos = defineTable({
  title: v.string(),
  url: v.string(),
  platform: v.union(
    v.literal("youtube"),
    v.literal("vimeo"),
    v.literal("other"),
  ),
  description: v.optional(v.string()),
  durationSeconds: v.optional(v.number()),
});

// ============================================================
// DOMÍNIO: STUDY SESSION ENGINE
//
// Um único motor alimenta: questões rápidas (custom), do dia (daily),
// treinar erros (error_review), favoritos (favorites), revisão (review),
// simulado (simulation) e prova oficial (exam). A diferença entre eles
// está principalmente na CONFIGURAÇÃO da sessão (ver lib/sessionCore.ts).
// ============================================================

export const sessionTypes = [
  "custom",
  "daily",
  "exam",
  "single_question",
  "error_review",
  "favorites",
  "review",
  "simulation",
] as const;

export const sessionStatuses = [
  "created",
  "in_progress",
  "paused",
  "completed",
  "abandoned",
] as const;

export const sessionTimerModes = ["none", "total", "per_question"] as const;
export const sessionFeedbackModes = ["immediate", "end"] as const;
export const sessionOrderModes = ["original", "random"] as const;

export const sessionQuestionStatuses = [
  "pending",
  "answered",
  "skipped",
] as const;

export const studySessions = defineTable({
  userId: v.id("users"),
  type: v.union(...sessionTypes.map((t) => v.literal(t))),
  status: v.union(...sessionStatuses.map((s) => v.literal(s))),
  /** Título amigável (ex.: "Treino de Matemática", "ENEM 2024 · 1º dia") */
  title: v.optional(v.string()),

  /** COMO responder: feedback imediato (estudo) vs. só no final (prova) */
  feedbackMode: v.union(...sessionFeedbackModes.map((f) => v.literal(f))),
  /** Cronômetro: none | total (contagem regressiva) | per_question */
  timerMode: v.union(...sessionTimerModes.map((t) => v.literal(t))),
  /** Limite total em segundos (timerMode=total). 0/exhausted => finaliza */
  totalTimeSeconds: v.optional(v.number()),
  /** Limite por questão em segundos (timerMode=per_question) */
  perQuestionSeconds: v.optional(v.number()),
  /** Ordem definida na criação e congelada no snapshot */
  orderMode: v.union(...sessionOrderModes.map((o) => v.literal(o))),
  allowBackNavigation: v.boolean(),
  allowPause: v.boolean(),

  // Filtros de origem (o QUE responder)
  examId: v.optional(v.id("exams")),
  editionId: v.optional(v.id("examEditions")),
  subjectId: v.optional(v.id("taxonomyNodes")),
  topicId: v.optional(v.id("taxonomyNodes")),
  difficulty: v.optional(v.union(
    v.literal("easy"),
    v.literal("medium"),
    v.literal("hard"),
  )),
  questionCount: v.number(),
  /** Rótulo determinístico de origem: aquecimento / revisão / desafio */
  dailyKind: v.optional(v.union(
    v.literal("warmup"),
    v.literal("review"),
    v.literal("challenge"),
  )),

  // Contadores desnormalizados (atualizados a cada resposta)
  answeredCount: v.number(),
  correctCount: v.number(),
  incorrectCount: v.number(),
  /** Posição corrente (0-based); usada para retomar a sessão */
  currentIndex: v.optional(v.number()),

  // Cronômetro real, sobrevive a reload/pausa:
  // elapsed = (now - startedAt) - pausedAccumSeconds
  startedAt: v.number(),
  pausedAccumSeconds: v.number(),
  /** Momento em que a pausa atual começou (null quando não pausada) */
  lastPausedAt: v.optional(v.number()),
  /** Âncora do relógio por questão: início da questão corrente (server-side,
   *  sobrevive a reload; deslocada ao retomar de uma pausa) */
  currentQuestionStartedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  timerSeconds: v.optional(v.number()),
}).index("by_user_status", ["userId", "status"])
  .index("by_user_time", ["userId", "startedAt"]);

/**
 * SNAPSHOT sessão ↔ questões.
 * Definido uma única vez na criação (ordem estável, sobrevive a reload);
 * é a única fonte de verdade sobre quais questões pertencem à sessão.
 */
export const studySessionQuestions = defineTable({
  sessionId: v.id("studySessions"),
  questionId: v.id("questions"),
  position: v.number(), // 0-based, ordem de resposta da sessão
  status: v.union(...sessionQuestionStatuses.map((s) => v.literal(s))),
  selectedLetter: v.optional(v.string()),
  isCorrect: v.optional(v.boolean()),
  timeSpentSeconds: v.optional(v.number()),
  markedForReview: v.boolean(),
  answeredAt: v.optional(v.number()),
})
  .index("by_session_position", ["sessionId", "position"])
  .index("by_session_status", ["sessionId", "status"])
  .index("by_question", ["questionId"]);

// ============================================================
// DOMÍNIO: ATTEMPTS / FAVORITOS / ERROS
// ============================================================

export const questionAttempts = defineTable({
  userId: v.id("users"),
  questionId: v.id("questions"),
  sessionId: v.optional(v.id("studySessions")),
  /** Posição da questão dentro da sessão (rastreabilidade do snapshot) */
  sessionPosition: v.optional(v.number()),
  selectedLetter: v.optional(v.string()),
  isCorrect: v.boolean(),
  timeSpentSeconds: v.optional(v.number()),
  subjectId: v.id("taxonomyNodes"),
  topicId: v.optional(v.id("taxonomyNodes")),
  difficulty: v.optional(v.union(
    v.literal("easy"),
    v.literal("medium"),
    v.literal("hard"),
  )),
  answeredAt: v.number(),
}).index("by_user_time", ["userId", "answeredAt"])
  .index("by_user_question", ["userId", "questionId"])
  .index("by_session", ["sessionId"]);

export const favorites = defineTable({
  userId: v.id("users"),
  questionId: v.id("questions"),
  createdAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_user_question", ["userId", "questionId"]);

export const errorBook = defineTable({
  userId: v.id("users"),
  questionId: v.id("questions"),
  errorCount: v.number(),
  lastErrorAt: v.number(),
  resolved: v.boolean(),
}).index("by_user_active", ["userId", "resolved"])
  .index("by_user_question", ["userId", "questionId"]);

// ============================================================
// DOMÍNIO: DESEMPENHO / GAMIFICAÇÃO
// ============================================================

export const dailyAnswers = defineTable({
  userId: v.id("users"),
  date: v.string(), // "YYYY-MM-DD" (fuso local do servidor)
  answered: v.number(),
  correct: v.number(),
}).index("by_user_date", ["userId", "date"]);

export const userStats = defineTable({
  userId: v.id("users"),
  totalAttempts: v.number(),
  totalCorrect: v.number(),
  xp: v.number(),
  currentStreak: v.number(),
  bestStreak: v.number(),
  lastStudyDate: v.optional(v.string()),
  updatedAt: v.number(),
}).index("by_user", ["userId"])
  .index("by_xp", ["xp"]);

// ============================================================
// AUTH (template, preservado)
// ============================================================

const schema = defineSchema(
  {
    ...authTables, // do not remove or modify

    users: defineTable({
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      email: v.optional(v.string()),
      emailVerificationTime: v.optional(v.number()),
      isAnonymous: v.optional(v.boolean()),
      role: v.optional(roleValidator),
    }).index("email", ["email"]), // do not remove or modify

    taxonomyNodes,
    exams,
    examEditions,
    institutions,
    sources,
    questions,
    questionOptions,
    importBatches,
    examPdfs,
    examContributions,
    answerKeySearches,
    videos,
    studySessions,
    studySessionQuestions,
    questionAttempts,
    favorites,
    errorBook,
    dailyAnswers,
    userStats,
  },
  {
    schemaValidation: false,
  },
);

export default schema;
