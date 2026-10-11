/**
 * STUDY SESSION ENGINE — núcleo puro
 *
 * Um único motor alimenta: questões rápidas (custom), do dia (daily),
 * treinar erros (error_review), favoritos (favorites), revisão (review),
 * simulado (simulation) e prova oficial (exam).
 *
 * A diferença entre os tipos está na CONFIGURAÇÃO da sessão. Este módulo
 * concentra as regras puras (políticas, ordem, tempo, resultado) sem tocar
 * no banco, para ser reaproveitado e testado isoladamente.
 */

// ---- Tipos (espelham os validadores do schema.ts) ----

export type SessionType =
  | "custom"
  | "daily"
  | "exam"
  | "single_question"
  | "error_review"
  | "favorites"
  | "review"
  | "simulation";

export type SessionStatus =
  | "created"
  | "in_progress"
  | "paused"
  | "completed"
  | "abandoned";

export type TimerMode = "none" | "total" | "per_question";
export type FeedbackMode = "immediate" | "end";
export type OrderMode = "original" | "random";
export type SessionQuestionStatus = "pending" | "answered" | "skipped";
export type Difficulty = "easy" | "medium" | "hard";

/** Configuração de criação de sessão (payload do usuário). */
export interface SessionConfigInput {
  type: SessionType;
  questionCount?: number;
  feedbackMode?: FeedbackMode;
  timerMode?: TimerMode;
  totalTimeSeconds?: number;
  perQuestionSeconds?: number;
  orderMode?: OrderMode;
  allowBackNavigation?: boolean;
  allowPause?: boolean;
  // filtros de origem
  examId?: string;
  editionId?: string;
  subjectId?: string;
  topicId?: string;
  difficulty?: Difficulty;
}

/** Configuração normalizada, com defaults aplicados. */
export interface NormalizedSessionConfig {
  type: SessionType;
  questionCount: number;
  feedbackMode: FeedbackMode;
  timerMode: TimerMode;
  totalTimeSeconds?: number;
  perQuestionSeconds?: number;
  orderMode: OrderMode;
  allowBackNavigation: boolean;
  allowPause: boolean;
  examId?: string;
  editionId?: string;
  subjectId?: string;
  topicId?: string;
  difficulty?: Difficulty;
}

/** Estado de uma questão dentro do snapshot da sessão. */
export interface SessionQuestionState {
  questionId: string;
  position: number;
  status: SessionQuestionStatus;
  selectedLetter?: string;
  isCorrect?: boolean;
  timeSpentSeconds?: number;
  markedForReview: boolean;
}

// ---- Política padrão por tipo de sessão ----

export interface SessionPolicy {
  /** Correção mostrada durante a sessão? */
  defaultFeedback: FeedbackMode;
  defaultTimer: TimerMode;
  defaultOrder: OrderMode;
  defaultAllowBackNavigation: boolean;
  defaultAllowPause: boolean;
  /** Quantidade solicitada quando o usuário não escolhe. */
  defaultQuestionCount: number;
}

export const SESSION_POLICIES: Record<SessionType, SessionPolicy> = {
  custom: {
    defaultFeedback: "immediate",
    defaultTimer: "none",
    defaultOrder: "random",
    defaultAllowBackNavigation: true,
    defaultAllowPause: true,
    defaultQuestionCount: 10,
  },
  single_question: {
    defaultFeedback: "immediate",
    defaultTimer: "none",
    defaultOrder: "original",
    defaultAllowBackNavigation: false,
    defaultAllowPause: true,
    defaultQuestionCount: 1,
  },
  daily: {
    defaultFeedback: "immediate",
    defaultTimer: "none",
    defaultOrder: "random",
    defaultAllowBackNavigation: true,
    defaultAllowPause: true,
    defaultQuestionCount: 5,
  },
  error_review: {
    defaultFeedback: "immediate",
    defaultTimer: "none",
    defaultOrder: "random",
    defaultAllowBackNavigation: true,
    defaultAllowPause: true,
    defaultQuestionCount: 10,
  },
  favorites: {
    defaultFeedback: "immediate",
    defaultTimer: "none",
    defaultOrder: "random",
    defaultAllowBackNavigation: true,
    defaultAllowPause: true,
    defaultQuestionCount: 10,
  },
  review: {
    defaultFeedback: "immediate",
    defaultTimer: "none",
    defaultOrder: "original",
    defaultAllowBackNavigation: true,
    defaultAllowPause: true,
    defaultQuestionCount: 10,
  },
  simulation: {
    defaultFeedback: "end",
    defaultTimer: "total",
    defaultOrder: "random",
    defaultAllowBackNavigation: true,
    defaultAllowPause: false,
    defaultQuestionCount: 20,
  },
  exam: {
    defaultFeedback: "end",
    defaultTimer: "none",
    defaultOrder: "original",
    defaultAllowBackNavigation: true,
    defaultAllowPause: false,
    defaultQuestionCount: 45,
  },
};

/** Aplica a política do tipo + overrides explícitos do usuário. */
export function resolveSessionConfig(input: SessionConfigInput): NormalizedSessionConfig {
  const policy = SESSION_POLICIES[input.type];
  const questionCount = Math.max(
    1,
    Math.min(input.questionCount ?? policy.defaultQuestionCount, 90),
  );

  const config: NormalizedSessionConfig = {
    type: input.type,
    questionCount,
    feedbackMode: input.feedbackMode ?? policy.defaultFeedback,
    timerMode: input.timerMode ?? policy.defaultTimer,
    orderMode: input.orderMode ?? policy.defaultOrder,
    allowBackNavigation:
      input.allowBackNavigation ?? policy.defaultAllowBackNavigation,
    allowPause: input.allowPause ?? policy.defaultAllowPause,
  };

  if (input.timerMode === "total" && input.totalTimeSeconds !== undefined) {
    config.totalTimeSeconds = Math.max(60, Math.round(input.totalTimeSeconds));
  }
  if (input.timerMode === "per_question" && input.perQuestionSeconds !== undefined) {
    config.perQuestionSeconds = Math.max(10, Math.round(input.perQuestionSeconds));
  }

  if (input.examId !== undefined) config.examId = input.examId;
  if (input.editionId !== undefined) config.editionId = input.editionId;
  if (input.subjectId !== undefined) config.subjectId = input.subjectId;
  if (input.topicId !== undefined) config.topicId = input.topicId;
  if (input.difficulty !== undefined) config.difficulty = input.difficulty;

  // Prova oficial: ordem original é uma regra, não preferência.
  if (input.type === "exam") config.orderMode = "original";

  return config;
}

// ---- Ordem ----

/**
 * RANDOM: embaralha com seed determinístico (mulberry32). A ordem é definida
 * UMA VEZ, na criação da sessão, e congelada no snapshot — nunca re-sortear
 * ao carregar.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function applyOrder<T>(
  items: T[],
  mode: OrderMode,
  seed: number,
): T[] {
  if (mode === "original") return items;
  return shuffleWithSeed(items, seed);
}

// ---- Feedback / gabarito (regras de correção — puras e testadas) ----

/**
 * Pergunta central: o gabarito/acerto-erro pode ser revelado AQUI?
 * - Modo estudo (immediate): só após o final; e para uma questão específica,
 *   só depois dela estar respondida NESTA sessão (não confunde com tentativa
 *   anterior em outra sessão — a prova disso é o estado na tabela da sessão).
 * - Modo prova (end): NUNCA antes do status final (completed|abandoned).
 */
export function isFeedbackRevealed(
  feedbackMode: "immediate" | "end",
  sessionStatus: "created" | "in_progress" | "paused" | "completed" | "abandoned",
): boolean {
  if (feedbackMode === "end") {
    return sessionStatus === "completed" || sessionStatus === "abandoned";
  }
  return true;
}

/**
 * Para uma QUestão específica: resposta/acerto só existem se ela foi
 * respondida NESTA sessão (status answered na tabela da sessão). Questões
 * respondidas em outra sessão ficam "pendentes" aqui.
 */
export function isAnsweredInSession(
  rowStatus: "pending" | "answered" | "skipped",
): boolean {
  return rowStatus === "answered";
}

// ---- Tempo real (sobrevive a reload; sem estado no cliente) ----

/**
 * Tempo decorrido da sessão em segundos:
 *   elapsed = (now - startedAt) - pausas acumuladas
 * O cronômetro é calculado a partir do relógio, nunca de um contador visual.
 */
export function computeElapsedSeconds(
  now: number,
  startedAt: number,
  pausedAccumSeconds: number,
): number {
  return Math.max(0, Math.round((now - startedAt) / 1000) - Math.round(pausedAccumSeconds));
}

/** Restante do tempo total; null = sem limite. Nunca negativo. */
export function computeRemainingSeconds(
  elapsedSeconds: number,
  totalTimeSeconds: number | undefined,
): number | null {
  if (totalTimeSeconds === undefined) return null;
  return Math.max(0, totalTimeSeconds - elapsedSeconds);
}

export function isTimeExpired(
  elapsedSeconds: number,
  totalTimeSeconds: number | undefined,
): boolean {
  if (totalTimeSeconds === undefined) return false;
  return elapsedSeconds >= totalTimeSeconds;
}

// ---- Relógio POR QUESTÃO ----

/**
 * Tempo decorrido na questão corrente, derivado do servidor (nunca do
 * cliente): anchor = studySessions.currentQuestionStartedAt. Em pausa, congela
 * no lastPausedAt; ao retomar, a âncora é deslocada pelos segundos pausados.
 */
export function computeQuestionElapsedSeconds(
  now: number,
  anchorMs: number | undefined,
  paused: boolean,
  lastPausedAt: number | undefined,
): number | undefined {
  if (anchorMs === undefined) return undefined;
  const ref = paused ? Math.min(lastPausedAt ?? now, now) : now;
  return Math.max(0, Math.round((ref - anchorMs) / 1000));
}

/**
 * Tolerância (s) para aceitar a resposta no limite: rede/latência não devem
 * punir quem respondeu a tempo no relógio local.
 */
export const PER_QUESTION_GRACE_SECONDS = 5;

/** Expirou o tempo da questão corrente? (pendente e acima do limite + tolerância) */
export function isPerQuestionTimeExpired(
  elapsedSeconds: number,
  perQuestionSeconds: number | undefined,
  graceSeconds: number = PER_QUESTION_GRACE_SECONDS,
): boolean {
  if (perQuestionSeconds === undefined) return false;
  return elapsedSeconds > perQuestionSeconds + graceSeconds;
}

// ---- Resultado ----

export interface ResultCounts {
  total: number;
  answered: number;
  correct: number;
  incorrect: number;
  blank: number;
  skipped: number;
  marked: number;
  /** Aproveitamento sobre o TOTAL da sessão (em branco conta contra). */
  percent: number;
  elapsedSeconds: number;
}

/**
 * Calcula o resultado a partir do snapshot. Chamado só após finalização
 * (modo prova) ou em tempo real (modo estudo).
 */
export function buildResultCounts(
  questions: SessionQuestionState[],
  totalQuestions: number,
  elapsedSeconds: number,
): ResultCounts {
  const answeredRows = questions.filter((q) => q.status === "answered");
  const correct = answeredRows.filter((q) => q.isCorrect === true).length;
  const incorrect = answeredRows.filter((q) => q.isCorrect === false).length;
  const skipped = questions.filter((q) => q.status === "skipped").length;
  const marked = questions.filter((q) => q.markedForReview).length;
  const total = Math.max(totalQuestions, questions.length);

  return {
    total,
    answered: answeredRows.length,
    correct,
    incorrect,
    blank: total - answeredRows.length - skipped,
    skipped,
    marked,
    percent: total > 0 ? Math.round((correct / total) * 100) : 0,
    elapsedSeconds,
  };
}

// ---- Rótulo amigável ----

export const SESSION_TYPE_LABEL: Record<SessionType, string> = {
  custom: "Treino",
  daily: "Questões do dia",
  exam: "Prova",
  single_question: "Questão única",
  error_review: "Treino de erros",
  favorites: "Favoritos",
  review: "Revisão",
  simulation: "Simulado",
};
