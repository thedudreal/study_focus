/**
 * IDENTIFICAÇÃO DE METADADOS DA PROVA — FUNÇÕES PURAS (sem I/O).
 *
 * Detecta, com heurísticas conservadoras, o que está EXPLICITO no texto:
 * tipo de prova, fase/edição e uma ESTIMATIVA de dificuldade por questão.
 * Nada é inventado: detecção sem evidência devolve undefined e a revisão
 * admin decide. O ano é detectado por examFit.checkYear (módulo irmão).
 */

export type DetectedExamType =
  | "vestibular"
  | "enem"
  | "concurso"
  | "certification";

export interface QuestionShape {
  statement: string;
  alternatives: { letter: string; text: string }[];
}

// ============================================================
// TIPO DE PROVA
// ============================================================

const EXAM_TYPE_RULES: { type: DetectedExamType; patterns: RegExp[] }[] = [
  {
    type: "enem",
    patterns: [
      /\bENEM\b/i,
      /\bExame Nacional do Ensino Médio\b/i,
      /\bINEP\b/i,
    ],
  },
  {
    type: "certification",
    patterns: [
      /\bOAB\b/i,
      /\bOrdem dos Advogados\b/i,
      /\bECOAD\b/i,
      /\bcertificaç[aã]o\b/i,
    ],
  },
  {
    type: "concurso",
    patterns: [
      /\bconcurso\b/i,
      /\bedital\b/i,
      /\b(Cebraspe|CESPE|FGV|VUNESP|Consultores|Polícia Militar)\b/i,
    ],
  },
  {
    type: "vestibular",
    patterns: [
      /\bvestibular\b/i,
      /\b(FUVEST|UNICAMP|UNESP|UNIFESP|UFRJ)\b/i,
    ],
  },
];

/** Primeiro tipo cujo padrão casa no texto (ordem = especificidade). */
export function detectExamType(text: string): DetectedExamType | undefined {
  for (const rule of EXAM_TYPE_RULES) {
    if (rule.patterns.some((p) => p.test(text))) return rule.type;
  }
  return undefined;
}

// ============================================================
// FASE / EDIÇÃO
// ============================================================

const PHASE_PATTERNS: RegExp[] = [
  /\b\d+\S*\s*dia[s]?\b/i, // "1º dia", "segundo dia" (numérico só)
  /\b\d+\S*\s*fase[s]?\b/i, // "1ª fase"
  /\b(primeira|segunda|terceira)\s+fase\b/i,
  /\b(primeiro|segundo|terceiro)\s+dia\b/i,
  /\bcaderno\s+\S+\b/i, // "caderno azul"
  /\betapa\s+\d\S*/i,
];

/** Primeira fase/edição explicitamente nomeada no texto (ou undefined). */
export function detectPhase(text: string): string | undefined {
  for (const re of PHASE_PATTERNS) {
    const m = text.match(re);
    if (m) return m[0].trim();
  }
  return undefined;
}

// ============================================================
// DIFICULDADE (estimativa — revisão admin pode mudar)
// ============================================================

/** Sinais de conteúdo técnico denso (puxa para "hard"). */
const HARD_KEYS: RegExp[] = [
  /integral/i,
  /derivada/i,
  /\blimite\b/i,
  /equacionar/i,
  /estequiometr/i,
  /pH\s*=/i,
  /\bmol\b/i,
  /demonstrar|deduzir|provar/i,
  /matriz\b/i,
  /função\s+horária/i,
];

/** Sinais de reconhecimento direto (puxa para "easy"). */
const EASY_KEYS: RegExp[] = [
  /assinale a (frase|alternativa|opção)/i,
  /\bdefinição\b/i,
];

/**
 * Estimativa fria de dificuldade:
 * - sinais técnicos ou enunciado longo + números → "hard";
 * - reconhecimento curto e direto → "easy";
 * - caso geral → "medium".
 */
export function estimateDifficulty(
  q: QuestionShape,
): "easy" | "medium" | "hard" {
  const words = q.statement.split(/\s+/).filter(Boolean).length;
  const optCount = q.alternatives.length;
  const hasNumbers = /\d+\s*[/+,-]*\s*\d+/i.test(q.statement);
  const hasDense = HARD_KEYS.some((re) => re.test(q.statement));
  const hasBasic = EASY_KEYS.some((re) => re.test(q.statement));

  if (hasDense || (words > 50 && hasNumbers)) return "hard";
  if (hasBasic && words < 25 && optCount <= 4) return "easy";
  if (hasNumbers && words < 25) return "easy";
  if (words > 90) return "medium";
  return "medium";
}

// ============================================================
// BUSCA POR GABARITO OFICIAL
// ============================================================

/**
 * Consulta precisa para achar o gabarito oficial de UMA questão:
 * "gabarito FUVEST 2025 1ª fase questão 34". Serve para qualquer
 * buscador (Exa incluído) por ser de alta especificidade.
 */
export function buildKeySearchQuery(meta: {
  examName?: string;
  institution?: string;
  year?: number;
  phase?: string;
  questionNumber: number;
}): string {
  const parts = ["gabarito"];
  if (meta.examName && meta.examName.trim().length > 0) {
    parts.push(meta.examName.trim());
  } else if (meta.institution && meta.institution.trim().length > 0) {
    parts.push(`${meta.institution.trim()} prova`);
  }
  if (meta.year !== undefined) parts.push(String(meta.year));
  if (meta.phase && meta.phase.trim().length > 0) parts.push(meta.phase.trim());
  parts.push(`questão ${meta.questionNumber}`);
  return parts.join(" ").replace(/\s+/g, " ");
}

/**
 * Letra de gabarito extraída de UM snippet, com sanidade: exige o número
 * da questão adjacente a uma letra A–E; SE aparecerem letras divergentes,
 * não retorna nada (nunca escolhe entre candidatos conflitantes).
 */
export function keyLetterFromSnippet(
  snippet: string,
  questionNumber: number,
): string | undefined {
  const normalized = snippet.replace(/\s+/g, " ");
  const re = new RegExp(
    `\\b${questionNumber}\\s*[-–.|)\\s]+\\s*([A-Ea-e])\\b`,
    "g",
  );
  const letters = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    letters.add(m[1].toUpperCase());
    if (letters.size > 1) return undefined; // inconsistente → não confia
  }
  if (letters.size !== 1) return undefined;
  return [...letters][0];
}
