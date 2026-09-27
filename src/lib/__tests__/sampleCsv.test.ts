import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseQuestionsCsv } from "@/convex/lib/csvImport";

const CSV_PATH = join(process.cwd(), "data", "exemplo-questoes-demo.csv");

describe("CSV de exemplo do repositório", () => {
  const content = readFileSync(CSV_PATH, "utf-8");
  const result = parseQuestionsCsv(content);

  it("parseia todas as linhas sem erro", () => {
    expect(result.errorCount).toBe(0);
  });

  it("contém 10 questões válidas", () => {
    expect(result.validCount).toBe(10);
  });

  it("distribui entre duas provas (ENEM e FUVEST)", () => {
    const exams = new Set(result.questions.map((q) => q.exam));
    expect(exams).toEqual(new Set(["ENEM", "FUVEST"]));
  });

  it("todas as questões têm 5 alternativas e gabarito válido", () => {
    for (const q of result.questions) {
      expect(q.options).toHaveLength(5);
      expect(q.options.some((o) => o.label === q.correctAnswer)).toBe(true);
    }
  });

  it("cobre cinco matérias distintas", () => {
    const subjects = new Set(result.questions.map((q) => q.subject));
    expect(subjects.size).toBeGreaterThanOrEqual(5);
  });

  it("toda questão demo está rotulada na fonte", () => {
    for (const q of result.questions) {
      expect(q.source).toContain("[DEMO]");
    }
  });
});
