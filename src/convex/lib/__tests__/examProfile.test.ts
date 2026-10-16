import { describe, it, expect } from "vitest";
import {
  detectExamType,
  detectPhase,
  estimateDifficulty,
  buildKeySearchQuery,
  keyLetterFromSnippet,
} from "../examProfile";

describe("detectExamType", () => {
  it("detecta ENEM por nome e mantenedora", () => {
    expect(detectExamType("Exame Nacional do Ensino Médio")).toBe("enem");
    expect(detectExamType("INEP n. 123")).toBe("enem");
  });
  it("detecta OAB como certification", () => {
    expect(detectExamType("XXXVIII Exame da Ordem dos Advogados")).toBe(
      "certification",
    );
  });
  it("detecta concurso e vestibular", () => {
    expect(detectExamType("edital 2024 do concurso")).toBe("concurso");
    expect(detectExamType("Vestibular FUVEST 2025")).toBe("vestibular");
  });
  it("regras específicas têm prioridade sobre genéricas", () => {
    expect(detectExamType("concurso ENEM")).toBe("enem");
  });
  it("retorna undefined sem evidência", () => {
    expect(detectExamType("prova avulsa")).toBeUndefined();
  });
});

describe("detectPhase", () => {
  it("extrai fase, dia e caderno nomeados", () => {
    expect(detectPhase("Questões da 1ª fase")).toBe("1ª fase");
    expect(detectPhase("Caderno azul - página 1")).toBe("Caderno azul");
    expect(detectPhase("segunda fase")).toBe("segunda fase");
  });
  it("não inventa fase sem evidência", () => {
    expect(detectPhase("Fim do arquivo")).toBeUndefined();
  });
});

describe("estimateDifficulty", () => {
  const shape = (statement: string, letters = 5) => ({
    statement,
    alternatives: Array.from({ length: letters }, (_v, i) => ({
      letter: String.fromCharCode(65 + i),
      text: `opção ${i}`,
    })),
  });

  it("denso/técnico → hard", () => {
    expect(estimateDifficulty(shape("Calcular a integral de f(x) = x²"))).toBe(
      "hard",
    );
  });

  it("curto com números → easy", () => {
    expect(estimateDifficulty(shape("Resolva 2 + 2"))).toBe("easy");
  });

  it("texto longo sem sinais → medium", () => {
    const long =
      "Ao longo do texto discute-se o fenômeno social da produtividade, " +
      "várias considerações sobre comportamento e economia contemporânea " +
      "são mencionadas em detalhes, sem sinais numéricos densos e sem " +
      "terminação técnica incomum.";
    expect(estimateDifficulty(shape(long))).toBe("medium");
  });
});

describe("buildKeySearchQuery", () => {
  it("query precisa com exame+ano+fase+questão", () => {
    expect(
      buildKeySearchQuery({
        examName: "FUVEST",
        year: 2025,
        phase: "1ª fase",
        questionNumber: 34,
      }),
    ).toBe("gabarito FUVEST 2025 1ª fase questão 34");
  });

  it("degrades gracefully without metadata", () => {
    expect(buildKeySearchQuery({ questionNumber: 7 })).toBe(
      "gabarito questão 7",
    );
  });
});

describe("keyLetterFromSnippet", () => {
  it("extrai letra coerente de trechos de gabarito", () => {
    expect(keyLetterFromSnippet("... 34 C 35 A", 34)).toBe("C");
    expect(keyLetterFromSnippet("34) A", 34)).toBe("A");
    expect(keyLetterFromSnippet("34-A", 34)).toBe("A");
  });

  it("rejeita letras conflitantes ou número sem letra", () => {
    expect(keyLetterFromSnippet("34 C e 34 A no mesmo trecho", 34)).toBeUndefined();
    expect(keyLetterFromSnippet("questão sobre 34 itens", 34)).toBeUndefined();
  });
});
