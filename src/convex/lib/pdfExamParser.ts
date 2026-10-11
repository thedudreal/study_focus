/**
 * PARSER DE PROVAS EM PDF — FUNÇÕES PURAS (sem I/O).
 *
 * Recebe o texto extraído por página (unpdf/pdfjs: items com coordenadas)
 * e segmenta questões + alternativas + gabarito com heurísticas conservadoras.
 *
 * PRINCÍPIOS (do pedido do usuário):
 * - NÃO INVENTAR: nada de completar trechos ilegíveis; o que não parseia
 *   é sinalizado com needsReview e o motivo.
 * - Classificação de matéria/assunto: JAMAIS automática em duplicatas —
 *   só sugere reutilizando o nome que já existe na taxonomia informada.
 */

// ============================================================
// TIPOS
// ============================================================

export interface ParsedAlt {
  letter: string;
  text: string;
}

export interface ParsedQuestion {
  number: number;
  statement: string;
  alternatives: ParsedAlt[];
  /** Página (1-based) onde o enunciado começa. */
  startPage: number;
  /** Questão incompleta (alternativas ausentes, enunciado vazio etc.). */
  needsReview: boolean;
  reviewReasons: string[];
  /** Classificação sugerida (sempre opcional, nunca criada sozinha). */
  suggestedSubject?: string;
}

export interface ParsedAnswerKey {
  /** "1" -> "A" */
  answers: Map<number, string>;
  lineNumber: string | null;
  needsReview: boolean;
  reason?: string;
}

export interface ParsedExam {
  questions: ParsedQuestion[];
  pages: number[];
  /** Caracteres úteis extraídos; ~0 indica PDF digitalizado (OCR necessário). */
  totalChars: number;
}

export type AnswerKeyLine = Map<number, string>;

// ============================================================
// LIMPEZA
// ============================================================

/** Normaliza espaços e remove artefatos de quebra de linha. */
export function cleanPdfText(raw: string): string {
  return raw
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    // Pontuação solta por renderização de fórmulas/ligaduras.
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ============================================================
// GABARITO
// ============================================================

/**
 * Extrai pares "1 A  2 C  3 B…" (colunas/tabular são tolerados porque
 * processamos NÚMERO + LETRA adjacentes independentemente do separador).
 * Nunca inventa: números fora de 1..N: ignorados e avisados via reason.
 */
export function parseAnswerKey(raw: string): ParsedAnswerKey {
  const answers = new Map<number, string>();
  const lineRegex = /(\d{1,3})\s*[-–.]?\s*([A-Ea-e])\b/g;
  let m: RegExpExecArray | null;
  while ((m = lineRegex.exec(raw)) !== null) {
    const num = parseInt(m[1], 10);
    if (num >= 1 && num <= 200) answers.set(num, m[2].toUpperCase());
  }
  const ok = answers.size > 0;
  return {
    answers,
    lineNumber: null,
    needsReview: !ok,
    reason: ok ? undefined : "Nenhum par número+letra reconhecível no gabarito.",
  };
}

// ============================================================
// QUESTÕES
// ============================================================

const Q_START_RE = /^QUEST(?:ÃO|AO|AO)?\s*(\d{1,3})/i;
const ALT_RE = /^\(?([A-Ea-e])\)?\s*(.+)$/;

function looksLikeQuestionHeader(line: string): number | null {
  const m = line.match(Q_START_RE);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 200 ? n : null;
}

/**
 * Segmenta questões das páginas, pela heurística "QUESTÃO N" no topo.
 * Um enunciado termina quando encontra "QUESTÃO N+1" ou fim das páginas.
 * Alternativas: linhas iniciando em (A)/(a)/A. — dentro do bloco da questão.
 */
export function parseExamQuestions(
  pages: string[],
): ParsedExam {
  const questions: ParsedQuestion[] = [];
  const pagesSeen: number[] = [];
  let total = 0;

  //Concatenar com marcadores de página (mantém a Página de origem).
  const joined: Array<{ page: number; line: string }> = [];
  for (const [idx, pageText] of pages.entries()) {
    total += pageText.length;
    const rawLines = pageText.split("\n");
    let buf = "";
    for (const rawLine of rawLines) {
      const line = cleanPdfText(rawLine);
      if (!line) continue;
      // Merge de linhas de enunciado quebradas pela renderização.
      buf = buf ? `${buf} ${line}` : line;
      joined.push({ page: idx + 1, line: buf });
      buf = "";
    }
  }

  const headers: { index: number; number: number; page: number }[] = [];
  for (const [i, item] of joined.entries()) {
    const qn = looksLikeQuestionHeader(item.line);
    if (qn !== null) {
      headers.push({ index: i, number: qn, page: item.page });
    }
  }

  for (const [hi, h] of headers.entries()) {
    const nextHeader = headers[hi + 1];
    const end = nextHeader ? nextHeader.index : joined.length;
    const body = joined.slice(h.index + 1, end);

    // Última linha da questão: separa numeração do texto depois do header.
    const headerText = joined[h.index].line.replace(Q_START_RE, "").trim();
    
    const statementLines: string[] = [];
    const alternatives: ParsedAlt[] = [];

    let statementStarted = false;
    for (const item of body) {
        const altMatch = item.line.match(ALT_RE);
      const localAltLetter = altMatch?.[1].toUpperCase();
      const isAlt = localAltLetter && alternatives.every((a) => a.letter !== localAltLetter);
      if (isAlt && alternatives.length < 5) {
        alternatives.push({
          letter: localAltLetter!,
          text: altMatch![2].trim(),
        });
        continue;
      }
      // Linha de texto comum: se começa com o enunciado, use o header.
      if (!statementStarted && headerText.length > 0) {
        statementLines.push(headerText);
        statementStarted = true;
        continue;
      }
      statementLines.push(item.line);
    }

    const statement = statementLines.join(" ").trim();
    const reviewReasons: string[] = [];
    if (!statement) reviewReasons.push("enunciado vazio");
    if (alternatives.length < 2) reviewReasons.push("menos de 2 alternativas");
    // Gabarito aplicado depois (needsReview por falta de gabarito é indicado
    // na fase de associação, não aqui).

    questions.push({
      number: h.number,
      statement,
      alternatives,
      startPage: h.page,
      needsReview: reviewReasons.length > 0,
      reviewReasons,
    });
    pagesSeen.push(h.page);
  }

  return { questions, pages: pagesSeen, totalChars: total };
}

// ============================================================
// ASSOCIAÇÃO GABARITO ↔ QUESTÕES
// ============================================================

/**
 * Aplica o gabarito às questões parseadas. NUNCA inventa letra: questão
 * sem correspondência fica pendente (needsReview=true).
 */
export function applyAnswerKey(
  questions: ParsedQuestion[],
  key: ParsedAnswerKey,
): ParsedQuestion[] {
  return questions.map((q) => {
    const letter = key.answers.get(q.number);
    if (letter === undefined) {
      return {
        ...q,
        needsReview: true,
        reviewReasons: [
          ...q.reviewReasons,
          "gabarito não encontrado para esta questão",
        ],
      };
    }
    const letters = q.alternatives.map((a) => a.letter);
    if (letters.length > 0 && !letters.includes(letter)) {
      return {
        ...q,
        needsReview: true,
        reviewReasons: [
          ...q.reviewReasons,
          `gabarito ${letter} não existe entre as alternativas parseadas`,
        ],
      };
    }
    return q;
  });
}

// ============================================================
// CLASSIFICAÇÃO (só sugestão, reutilizando taxonomia existente)
// ============================================================

/**
 * Encontra a matéria cujo nome é literalmente citado no contexto da questão
 * (cabeçalho de seção do PDF: "LINGUAGENS", "MATEMÁTICA"…). NUNCA cria
 * matéria nova: só casa com nomes na taxonomia informada pelo admin.
 */
export function suggestSubject(
  questionContextLines: string[],
  existingSubjects: string[],
): string | undefined {
  const haystack = questionContextLines.join(" ").toUpperCase();
  for (const subj of existingSubjects) {
    if (haystack.includes(subj.toUpperCase())) return subj;
  }
  return undefined;
}

// ============================================================
// RESUMO PRÉ-VISUALIZAÇÃO ( Parte F do pedido )
// ============================================================

export interface ExamImportSummary {
  found: number;
  ready: number;
  incomplete: number;
  /** Questões com enunciado idêntico (hash) dentro do próprio PDF. */
  duplicateInFile: number;
}

export function summarizeImport(questions: ParsedQuestion[]): ExamImportSummary {
  const seen = new Set<string>();
  let duplicateInFile = 0;
  for (const q of questions) {
    const sig = q.statement.trim().toLowerCase();
    if (sig !== "" && seen.has(sig)) {
      duplicateInFile += 1;
      continue;
    }
    if (sig !== "") seen.add(sig);
  }
  const ready = questions.filter((q) => !q.needsReview).length;
  return {
    found: questions.length,
    ready,
    incomplete: questions.length - ready,
    duplicateInFile,
  };
}

/** Dedupe contra o banco é feito com contentHash (mesma função do CSV). */
export function hashStatement(statement: string): string {
  // FNV-1a 32-bit em hex — mesma ideia do csvImport (reuso simples).
  let h = 0x811c9dc5;
  const normalized = statement.replace(/\s+/g, " ").trim().toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
