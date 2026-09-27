import { describe, expect, it } from "vitest";
import {
  parseQuestionsCsv,
  parseCsvLine,
  hashStatement,
  CSV_COLUMNS,
} from "@/convex/lib/csvImport";

const HEADER = CSV_COLUMNS.join(",");

function row(overrides: Partial<Record<string, string>> = {}): string {
  const base: Record<string, string> = {
    exam: "ENEM",
    year: "2024",
    phase: "1º dia",
    area: "Exatas",
    subject: "Matemática",
    topic: "Álgebra",
    subtopic: "Funções",
    difficulty: "Média",
    type: "multiple_choice",
    statement: "Quanto é 2 + 2?",
    option_a: "3",
    option_b: "4",
    option_c: "5",
    option_d: "6",
    option_e: "7",
    correct_answer: "B",
    explanation: "Soma simples.",
    source: "Material próprio [DEMO]",
  };
  const merged = { ...base, ...overrides };
  return CSV_COLUMNS.map((c) => {
    const value = merged[c] ?? "";
    return value.includes(",") ? `"${value}"` : value;
  }).join(",");
}

describe("parseCsvLine", () => {
  it("separa campos simples", () => {
    expect(parseCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("respeita vírgulas dentro de aspas", () => {
    expect(parseCsvLine('"a,b",c')).toEqual(["a,b", "c"]);
  });

  it("interpreta aspas duplas escapadas", () => {
    expect(parseCsvLine('"ele disse ""oi""",x')).toEqual(['ele disse "oi"', "x"]);
  });
});

describe("parseQuestionsCsv", () => {
  it("faz o parse de um CSV válido", () => {
    const csv = `${HEADER}\n${row()}`;
    const result = parseQuestionsCsv(csv);
    expect(result.totalRows).toBe(1);
    expect(result.validCount).toBe(1);
    expect(result.errorCount).toBe(0);
    expect(result.questions[0]?.subject).toBe("Matemática");
    expect(result.questions[0]?.options).toHaveLength(5);
    expect(result.questions[0]?.correctAnswer).toBe("B");
  });

  it("detecta cabeçalho inválido (colunas faltando)", () => {
    const csv = "exam,statement,option_a\nENEM,pergunta?,A";
    const result = parseQuestionsCsv(csv);
    expect(result.validCount).toBe(0);
    expect(result.errorCount).toBe(1);
    expect(result.rowErrors[0]?.errors[0]).toContain("cabeçalho inválido");
  });

  it("rejeita resposta correta inválida", () => {
    const csv = `${HEADER}\n${row({ correct_answer: "F" })}`;
    const result = parseQuestionsCsv(csv);
    expect(result.validCount).toBe(0);
    expect(result.rowErrors[0]?.errors.join()).toContain("resposta correta inválida");
  });

  it("rejeita quando a resposta correta não tem alternativa", () => {
    const csv = `${HEADER}\n${row({ option_b: "", option_c: "" })}`;
    const result = parseQuestionsCsv(csv);
    expect(result.validCount).toBe(0);
    expect(result.rowErrors[0]?.errors.join()).toContain(
      'não tem alternativa correspondente',
    );
  });

  it("rejeita enunciado vazio", () => {
    const csv = `${HEADER}\n${row({ statement: "" })}`;
    const result = parseQuestionsCsv(csv);
    expect(result.rowErrors[0]?.errors).toContain("enunciado vazio");
  });

  it("rejeita matéria ausente", () => {
    const csv = `${HEADER}\n${row({ subject: "" })}`;
    const result = parseQuestionsCsv(csv);
    expect(result.rowErrors[0]?.errors).toContain("matéria não informada");
  });

  it("rejeita prova ausente", () => {
    const csv = `${HEADER}\n${row({ exam: "" })}`;
    const result = parseQuestionsCsv(csv);
    expect(result.rowErrors[0]?.errors).toContain("prova (exam) não informada");
  });

  it("rejeita poucas alternativas", () => {
    const csv = `${HEADER}\n${row({ option_b: "", option_c: "", option_d: "", option_e: "", correct_answer: "A" })}`;
    const result = parseQuestionsCsv(csv);
    expect(result.rowErrors[0]?.errors.join()).toContain("poucas alternativas");
  });

  it("tolera omissão de alternativas no final (A–C usadas)", () => {
    const csv = `${HEADER}\n${row({ option_d: "", option_e: "", correct_answer: "C" })}`;
    const result = parseQuestionsCsv(csv);
    expect(result.validCount).toBe(1);
    expect(result.questions[0]?.options).toHaveLength(3);
  });

  it("valida ano fora do intervalo", () => {
    const csv = `${HEADER}\n${row({ year: "1800" })}`;
    const result = parseQuestionsCsv(csv);
    expect(result.rowErrors[0]?.errors.join()).toContain("ano inválido");
  });

  it("suporta separador ponto-e-vírgula", () => {
    const header = CSV_COLUMNS.join(";");
    const values = [
      "ENEM", "2024", "1º dia", "Exatas", "Matemática", "Álgebra", "Funções",
      "Média", "multiple_choice", "Pergunta?", "A1", "B1", "C1", "D1", "E1",
      "B", "Exp", "Fonte",
    ].join(";");
    const result = parseQuestionsCsv(`${header}\n${values}`);
    expect(result.validCount).toBe(1);
  });

  it("agrega múltiplos erros de linhas distintas", () => {
    const csv = [
      HEADER,
      row(),
      row({ statement: "", correct_answer: "Z" }),
      row({ subject: "" }),
    ].join("\n");
    const result = parseQuestionsCsv(csv);
    expect(result.totalRows).toBe(3);
    expect(result.validCount).toBe(1);
    expect(result.errorCount).toBe(2);
    expect(result.rowErrors.map((e) => e.row)).toEqual([3, 4]);
  });
});

describe("hashStatement", () => {
  it("é determinístico", () => {
    expect(hashStatement("abc")).toBe(hashStatement("abc"));
  });
  it("diferencia conteúdos", () => {
    expect(hashStatement("abc")).not.toBe(hashStatement("abd"));
  });
});
