import { describe, it, expect } from "vitest";
import { checkYear, assessFit, isPlausibleYear } from "../examFit";

describe("isPlausibleYear", () => {
  it("aceita anos 1990..atual+1 e rejeita o resto", () => {
    expect(isPlausibleYear(2024)).toBe(true);
    expect(isPlausibleYear(1989)).toBe(false);
    expect(isPlausibleYear(new Date().getFullYear() + 2)).toBe(false);
    expect(isPlausibleYear(Number.NaN)).toBe(false);
  });
});

describe("checkYear", () => {
  it("confirma o ano informado quando aparece no texto", () => {
    const r = checkYear("ENEM 2023 — caderno azul", 2023);
    expect(r).toEqual({
      year: 2023,
      source: "informed_confirmed",
      mismatched: undefined,
      ambiguous: undefined,
    });
  });

  it("marca mismatch quando o ano informado NÃO está no texto", () => {
    const r = checkYear("prova sem data explícita", 2019);
    expect(r.source).toBe("informed_confirmed");
    expect(r.mismatched).toBe(true);
  });

  it("infere o ano quando há exatamente UM candidato plausível", () => {
    const r = checkYear("Vestibular 2021 — questão 1 … 2021 foi", undefined);
    expect(r).toEqual({
      year: 2021,
      source: "inferred",
      mismatched: undefined,
      ambiguous: undefined,
    });
  });

  it("não infere quando há VÁRIOS candidatos (ambíguo)", () => {
    const r = checkYear("resultados de 2020 e lista de 2022", undefined);
    expect(r.source).toBe("missing");
    expect(r.ambiguous).toBe(true);
    expect(r.year).toBeUndefined();
  });

  it("ignora anos fora da janela plausível (1988 e 2999)", () => {
    const r = checkYear("história de 1988 e referência 2999", undefined);
    expect(r.source).toBe("missing");
  });
});

describe("assessFit", () => {
  it("rejeita quando nenhuma questão é identificada", () => {
    const r = assessFit(
      { found: 0, ready: 0, duplicateInDb: 0, duplicateInFile: 0 },
      { source: "missing" },
    );
    expect(r.outcome).toBe("rejected");
    expect(r.rejectionReasons[0]).toContain("Nenhuma questão");
  });

  it("rejeita quando o ano informado não aparece no PDF", () => {
    const r = assessFit(
      { found: 5, ready: 5, duplicateInDb: 0, duplicateInFile: 0 },
      { year: 2019, source: "informed_confirmed", mismatched: true },
    );
    expect(r.outcome).toBe("rejected");
    expect(r.rejectionReasons[0]).toContain("Ano informado (2019)");
  });

  it("aceita triagem saudável sem avisos relevantes", () => {
    const r = assessFit(
      { found: 45, ready: 43, duplicateInDb: 0, duplicateInFile: 2 },
      { year: 2023, source: "informed_confirmed" },
    );
    expect(r.outcome).toBe("accepted");
    expect(r.rejectionReasons).toEqual([]);
    expect(r.warnings.some((w) => w.includes("incompleta"))).toBe(true);
  });

  it("aceita com aviso forte quando NENHUMA questão está completa", () => {
    const r = assessFit(
      { found: 10, ready: 0, duplicateInDb: 4, duplicateInFile: 1 },
      { source: "missing", ambiguous: true },
    );
    expect(r.outcome).toBe("accepted");
    expect(r.warnings[0]).toContain("Nenhuma questão completa");
  });

  it("avisa quando TODAS as questões são duplicatas", () => {
    const r = assessFit(
      { found: 3, ready: 3, duplicateInDb: 3, duplicateInFile: 0 },
      { year: 2025, source: "inferred" },
    );
    expect(r.outcome).toBe("accepted");
    expect(r.warnings.some((w) => w.includes("duplicatas"))).toBe(true);
  });

  it("não marca aviso de incompletas quando todas estão prontas", () => {
    const r = assessFit(
      { found: 5, ready: 5, duplicateInDb: 0, duplicateInFile: 0 },
      { year: 2024, source: "informed_confirmed" },
    );
    expect(r.outcome).toBe("accepted");
    expect(r.warnings.some((w) => w.includes("incompleta"))).toBe(false);
  });
});
