import { describe, expect, it } from "vitest";
import { validateQuestion, normalizeLetter, normalizeDifficulty } from "@/convex/lib/questionValidation";

const valid = {
  statement: "Quanto é 2 + 2?",
  alternatives: [
    { letter: "A", text: "3" },
    { letter: "B", text: "4" },
    { letter: "C", text: "5" },
  ],
  correctLetter: "B",
  subjectId: "subject-1",
};

describe("validateQuestion", () => {
  it("aceita uma questão válida", () => {
    expect(validateQuestion(valid)).toEqual({ valid: true, errors: [] });
  });

  it("exige enunciado", () => {
    const r = validateQuestion({ ...valid, statement: "   " });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("enunciado vazio");
  });

  it("exige matéria", () => {
    const r = validateQuestion({ ...valid, subjectId: "" });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("matéria não informada");
  });

  it("exige pelo menos 2 alternativas", () => {
    const r = validateQuestion({
      ...valid,
      alternatives: [{ letter: "A", text: "3" }],
    });
    expect(r.errors.join()).toContain("pelo menos 2 alternativas");
  });

  it("rejeita alternativa vazia", () => {
    const r = validateQuestion({
      ...valid,
      alternatives: [
        { letter: "A", text: "3" },
        { letter: "B", text: "   " },
      ],
      correctLetter: "A",
    });
    expect(r.errors.join()).toContain("alternativa B vazia");
  });

  it("rejeita letras duplicadas", () => {
    const r = validateQuestion({
      ...valid,
      alternatives: [
        { letter: "A", text: "3" },
        { letter: "A", text: "4" },
      ],
      correctLetter: "A",
    });
    expect(r.errors.join()).toContain("duplicada");
  });

  it("rejeita resposta correta inexistente entre as alternativas", () => {
    const r = validateQuestion({ ...valid, correctLetter: "E" });
    expect(r.errors.join()).toContain("não corresponde a nenhuma alternativa");
  });

  it("rejeita nenhuma resposta correta", () => {
    const r = validateQuestion({ ...valid, correctLetter: "" });
    expect(r.errors.join()).toContain("nenhuma resposta correta");
  });

  it("exige prova quando ano é informado", () => {
    const r = validateQuestion({ ...valid, year: 2024 });
    expect(r.errors.join()).toContain("ano informado sem prova");
  });

  it("exige prova quando edição é informada", () => {
    const r = validateQuestion({ ...valid, editionId: "ed-1" });
    expect(r.errors.join()).toContain("edição informada sem prova");
  });

  it("valida exceto quando prova presente com ano", () => {
    const r = validateQuestion({ ...valid, examId: "exam-1", year: 2024 });
    expect(r.valid).toBe(true);
  });
});

describe("normalizeLetter", () => {
  it("normaliza minúsculas e espaços", () => {
    expect(normalizeLetter(" b ")).toBe("B");
  });
});

describe("normalizeDifficulty", () => {
  it("mapeia variantes em português e inglês", () => {
    expect(normalizeDifficulty("Fácil")).toBe("easy");
    expect(normalizeDifficulty("facil")).toBe("easy");
    expect(normalizeDifficulty("Difícil")).toBe("hard");
    expect(normalizeDifficulty("hard")).toBe("hard");
    expect(normalizeDifficulty("Média")).toBe("medium");
    expect(normalizeDifficulty("qualquer coisa")).toBe("medium");
  });
});
