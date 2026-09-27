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
  /** Hash para detecção de duplicatas (fase futura: similaridade) */
  contentHash: v.optional(v.string()),
  videoId: v.optional(v.id("videos")),
}).index("by_status", ["status"])
  .index("by_exam", ["examId", "status"])
  .index("by_edition", ["editionId", "sourceOrder"])
  .index("by_subject", ["subjectId", "status"])
  .index("by_batch", ["importBatchId"])
  .index("by_source_id", ["sourceId"])
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
// DOMÍNIO: STUDY SESSIONS
// ============================================================

export const sessionTypes = [
  "custom",
  "daily",
  "exam",
] as const;

export const studySessions = defineTable({
  userId: v.id("users"),
  type: v.union(
    v.literal("custom"),
    v.literal("daily"),
    v.literal("exam"),
  ),
  /** Modo de feedback: imediato (estudo) vs. só no final (prova) */
  feedbackMode: v.union(v.literal("immediate"), v.literal("end")),
  examId: v.optional(v.id("exams")),
  editionId: v.optional(v.id("examEditions")),
  subjectId: v.optional(v.id("taxonomyNodes")),
  questionCount: v.number(),
  /** Questões da sessão, na ordem de resposta */
  questionIds: v.array(v.id("questions")),
  /** Rótulo determinístico de origem: aquecimento / revisão / desafio */
  dailyKind: v.optional(v.union(
    v.literal("warmup"),
    v.literal("review"),
    v.literal("challenge"),
  )),
  /** Origem especial da seleção: caderno de erros ou favoritos */
  source: v.optional(v.union(
    v.literal("errors"),
    v.literal("favorites"),
  )),
  timerSeconds: v.optional(v.number()),
  status: v.union(
    v.literal("active"),
    v.literal("completed"),
    v.literal("abandoned"),
  ),
  currentIndex: v.optional(v.number()),
  answers: v.optional(v.array(v.object({
    questionId: v.id("questions"),
    selectedLetter: v.optional(v.string()),
    isCorrect: v.optional(v.boolean()),
    timeSpentSeconds: v.optional(v.number()),
    flagged: v.boolean(),
  }))),
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
}).index("by_user_status", ["userId", "status"]);

// ============================================================
// DOMÍNIO: ATTEMPTS / FAVORITOS / ERROS
// ============================================================

export const questionAttempts = defineTable({
  userId: v.id("users"),
  questionId: v.id("questions"),
  sessionId: v.optional(v.id("studySessions")),
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
    videos,
    studySessions,
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
