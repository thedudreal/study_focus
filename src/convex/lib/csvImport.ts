/**
 * IMPORTAÇÃO CSV — parser e validador puros (sem I/O), testáveis.
 *
 * Formato esperado (cabeçalho obrigatório, colunas nesta ordem):
 * exam,year,phase,area,subject,topic,subtopic,difficulty,type,statement,
 * option_a,option_b,option_c,option_d,option_e,correct_answer,explanation,source
 */

export const CSV_COLUMNS = [
  "exam",
  "year",
  "phase",
  "area",
  "subject",
  "topic",
  "subtopic",
  "difficulty",
  "type",
  "statement",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "option_e",
  "correct_answer",
  "explanation",
  "source",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

export interface CsvQuestionRow {
  row: number; // 1-based, incluindo cabeçalho
  exam: string;
  year?: number;
  phase?: string;
  area?: string;
  subject: string;
  topic?: string;
  subtopic?: string;
  difficulty?: string;
  type?: string;
  statement: string;
  options: { label: string; text: string }[];
  correctAnswer: string;
  explanation?: string;
  source?: string;
}

export interface CsvRowError {
  row: number;
  errors: string[];
}

export interface CsvParseResult {
  questions: CsvQuestionRow[];
  rowErrors: CsvRowError[];
  totalRows: number; // linhas de dados (sem cabeçalho)
  validCount: number;
  errorCount: number;
}

/**
 * Parser de uma linha CSV com suporte a aspas duplas e delimitadores dentro
 * de campos. Não usa dependências externas.
 */
export function parseCsvLine(line: string, delimiter: string = ","): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      current += char;
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === delimiter) {
      fields.push(current);
      current = "";
      i++;
      continue;
    }
    current += char;
    i++;
  }
  fields.push(current);
  return fields;
}

/** Divide o conteúdo em linhas tolerando \r\n e \r. */
function splitLines(content: string): string[] {
  return content.split(/\r\n|\r|\n/);
}

/** Detecta o separador usado (vírgula ou ponto-e-vírgula) pela 1ª linha. */
function detectDelimiter(headerLine: string): string {
  const commas = (headerLine.match(/,/g) ?? []).length;
  const semis = (headerLine.match(/;/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

function normalizeHeader(header: string[]): string[] {
  return header.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
}

const VALID_ANSWERS = new Set(["A", "B", "C", "D", "E"]);

/**
 * Faz o parse completo do CSV e valida cada linha.
 * Linhas com erro NÃO são descartadas silenciosamente: aparecem em rowErrors
 * para o admin corrigir antes de importar.
 */
export function parseQuestionsCsv(content: string): CsvParseResult {
  const lines = splitLines(content).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return {
      questions: [],
      rowErrors: [{ row: 1, errors: ["arquivo vazio"] }],
      totalRows: 0,
      validCount: 0,
      errorCount: 1,
    };
  }

  const delimiter = detectDelimiter(lines[0]);
  const header = normalizeHeader(
    parseCsvLine(lines[0], delimiter).map((f) => f.trim()),
  );
  const expected = [...CSV_COLUMNS];

  // Cabeçalho precisa conter as colunas essenciais (ordem flexível, presença obrigatória)
  const missingColumns = expected.filter((col) => !header.includes(col));
  if (missingColumns.length > 0) {
    return {
      questions: [],
      rowErrors: [
        {
          row: 1,
          errors: [`cabeçalho inválido: faltam colunas ${missingColumns.join(", ")}`],
        },
      ],
      totalRows: 0,
      validCount: 0,
      errorCount: 1,
    };
  }

  const colIndex = new Map<string, number>();
  header.forEach((name, idx) => colIndex.set(name, idx));

  const questions: CsvQuestionRow[] = [];
  const rowErrors: CsvRowError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1; // 1-based contando o cabeçalho
    const raw = parseCsvLine(lines[i], delimiter);
    const get = (col: CsvColumn): string =>
      (raw[colIndex.get(col) ?? -1] ?? "").trim();

    const errors: string[] = [];

    const statement = get("statement");
    if (!statement) errors.push("enunciado vazio");

    const subject = get("subject");
    if (!subject) errors.push("matéria não informada");

    const exam = get("exam");
    if (!exam) errors.push("prova (exam) não informada");

    const yearRaw = get("year");
    let year: number | undefined;
    if (yearRaw) {
      const parsed = parseInt(yearRaw, 10);
      if (Number.isNaN(parsed) || parsed < 1900 || parsed > 2100) {
        errors.push(`ano inválido: "${yearRaw}"`);
      } else {
        year = parsed;
      }
    }

    // Alternativas: A–E, ignora vazias, valida mínimas
    const optionColumns: CsvColumn[] = [
      "option_a",
      "option_b",
      "option_c",
      "option_d",
      "option_e",
    ];
    const options = optionColumns
      .map((col, idx) => ({
        label: String.fromCharCode(65 + idx),
        text: get(col),
      }))
      .filter((o) => o.text.length > 0);

    if (options.length < 2) {
      errors.push(`poucas alternativas (${options.length}); mínimo 2`);
    } else {
      const emptyIdx = optionColumns.findIndex(
        (col, idx) =>
          idx < options.length + 0 && get(col) === "" &&
          // só invalida se a alternativa seguinte (não-final) está preenchida:
          // omissão no final (só A–C usadas) é permitido
          optionColumns.slice(0, idx).some((c) => get(c) !== ""),
      );
      void emptyIdx; // lacunas internas são toleradas; mín. 2 já cobre o essencial
    }

    const correctRaw = get("correct_answer").toUpperCase();
    if (!correctRaw) {
      errors.push("resposta correta não informada");
    } else if (!VALID_ANSWERS.has(correctRaw)) {
      errors.push(`resposta correta inválida: "${correctRaw}" (use A–E)`);
    } else if (!options.some((o) => o.label === correctRaw)) {
      errors.push(`resposta correta "${correctRaw}" não tem alternativa correspondente`);
    }

    if (errors.length > 0) {
      rowErrors.push({ row: rowNumber, errors });
      continue;
    }

    questions.push({
      row: rowNumber,
      exam,
      year,
      phase: get("phase") || undefined,
      area: get("area") || undefined,
      subject,
      topic: get("topic") || undefined,
      subtopic: get("subtopic") || undefined,
      difficulty: get("difficulty") || undefined,
      type: get("type") || undefined,
      statement,
      options,
      correctAnswer: correctRaw,
      explanation: get("explanation") || undefined,
      source: get("source") || undefined,
    });
  }

  return {
    questions,
    rowErrors,
    totalRows: questions.length + rowErrors.length,
    validCount: questions.length,
    errorCount: rowErrors.length,
  };
}

/** Hash simples de conteúdo para dedupe futuro (não criptográfico). */
export function hashStatement(statement: string): string {
  let h = 5381;
  for (let i = 0; i < statement.length; i++) {
    h = ((h << 5) + h + statement.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}
