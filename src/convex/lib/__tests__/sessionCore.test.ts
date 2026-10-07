import { describe, expect, it } from "vitest";
import {
  SESSION_POLICIES,
  resolveSessionConfig,
  mulberry32,
  shuffleWithSeed,
  applyOrder,
  computeElapsedSeconds,
  computeRemainingSeconds,
  isTimeExpired,
  computeQuestionElapsedSeconds,
  isPerQuestionTimeExpired,
  PER_QUESTION_GRACE_SECONDS,
  buildResultCounts,
  SESSION_TYPE_LABEL,
} from "../sessionCore";
import type { SessionQuestionState } from "../sessionCore";

// ============================================================
// POLÍTICAS / CONFIGURAÇÃO
// ============================================================

describe("resolveSessionConfig", () => {
  it("aplica política padrão do tipo custom", () => {
    const config = resolveSessionConfig({ type: "custom" });
    expect(config.feedbackMode).toBe("immediate");
    expect(config.timerMode).toBe("none");
    expect(config.orderMode).toBe("random");
    expect(config.allowBackNavigation).toBe(true);
    expect(config.allowPause).toBe(true);
    expect(config.questionCount).toBe(SESSION_POLICIES.custom.defaultQuestionCount);
  });

  it("aplica política do simulado: correção no final, tempo total, sem pausa", () => {
    const config = resolveSessionConfig({ type: "simulation", questionCount: 20 });
    expect(config.feedbackMode).toBe("end");
    expect(config.timerMode).toBe("total");
    expect(config.allowBackNavigation).toBe(true);
    expect(config.allowPause).toBe(false);
  });

  it("aplica política da prova: correção no final e ordem original obrigatória", () => {
    const config = resolveSessionConfig({
      type: "exam",
      orderMode: "random", // usuário tentou forçar aleatório
    });
    expect(config.feedbackMode).toBe("end");
    expect(config.orderMode).toBe("original"); // regra da prova vence
    expect(config.allowPause).toBe(false);
  });

  it("permite override explícito do usuário", () => {
    const config = resolveSessionConfig({
      type: "custom",
      feedbackMode: "end",
      timerMode: "total",
      totalTimeSeconds: 600,
    });
    expect(config.feedbackMode).toBe("end");
    expect(config.timerMode).toBe("total");
    expect(config.totalTimeSeconds).toBe(600);
  });

  it("limita quantidade entre 1 e 90", () => {
    expect(resolveSessionConfig({ type: "custom", questionCount: 0 }).questionCount).toBe(1);
    expect(resolveSessionConfig({ type: "custom", questionCount: 500 }).questionCount).toBe(90);
  });

  it("valida limites de tempo (mínimo 60s total, 10s por questão)", () => {
    const total = resolveSessionConfig({
      type: "simulation",
      timerMode: "total",
      totalTimeSeconds: 10,
    });
    expect(total.totalTimeSeconds).toBe(60);

    const per = resolveSessionConfig({
      type: "custom",
      timerMode: "per_question",
      perQuestionSeconds: 5,
    });
    expect(per.perQuestionSeconds).toBe(10);
  });

  it("suporta todos os oito tipos de sessão", () => {
    const types = [
      "custom",
      "daily",
      "exam",
      "single_question",
      "error_review",
      "favorites",
      "review",
      "simulation",
    ] as const;
    for (const type of types) {
      const config = resolveSessionConfig({ type });
      expect(config.type).toBe(type);
      expect(SESSION_POLICIES[type]).toBeDefined();
      expect(SESSION_TYPE_LABEL[type]).toBeTruthy();
    }
  });
});

// ============================================================
// ORDEM (estável, definida na criação)
// ============================================================

describe("ordem determinística", () => {
  const items = ["a", "b", "c", "d", "e", "f", "g", "h"];

  it("ORIGINAL preserva a ordem exata", () => {
    expect(applyOrder(items, "original", 42)).toEqual(items);
  });

  it("RANDOM com mesma seed produz sempre a mesma ordem (estável)", () => {
    const first = applyOrder(items, "random", 42);
    const second = applyOrder(items, "random", 42);
    const third = applyOrder(items, "random", 42);
    expect(first).toEqual(second);
    expect(second).toEqual(third);
  });

  it("RANDOM com seeds diferentes produz ordens diferentes (com alta probabilidade)", () => {
    const big = Array.from({ length: 50 }, (_, i) => i);
    const a = applyOrder(big, "random", 1);
    const b = applyOrder(big, "random", 2);
    expect(a).not.toEqual(b);
  });

  it("RANDOM é uma permutação (mesmos elementos, sem perdas/duplicações)", () => {
    const shuffled = applyOrder(items, "random", 7);
    expect([...shuffled].sort()).toEqual([...items].sort());
  });

  it("mulberry32 é determinístico", () => {
    const r1 = mulberry32(123);
    const r2 = mulberry32(123);
    const seq1 = [r1(), r1(), r1()];
    const seq2 = [r2(), r2(), r2()];
    expect(seq1).toEqual(seq2);
  });

  it("shuffleWithSeed não muta o array original", () => {
    const original = [1, 2, 3];
    const copy = [...original];
    shuffleWithSeed(original, 99);
    expect(original).toEqual(copy);
  });
});

// ============================================================
// TEMPO REAL
// ============================================================

describe("computeElapsedSeconds (tempo real, sobrevive a reload)", () => {
  it("conta tempo decorrido desde startedAt", () => {
    const startedAt = 1_000_000_000;
    const now = startedAt + 65_000; // 65s depois
    expect(computeElapsedSeconds(now, startedAt, 0)).toBe(65);
  });

  it("subtrai pausas acumuladas (pausa real, não cosmética)", () => {
    const startedAt = 1_000_000_000;
    const now = startedAt + 120_000; // 120s de parede
    expect(computeElapsedSeconds(now, startedAt, 60)).toBe(60); // 60s pausados
  });

  it("nunca fica negativo", () => {
    expect(computeElapsedSeconds(1000, 2000, 0)).toBe(0);
    expect(computeElapsedSeconds(1000, 2000, 500)).toBe(0);
  });

  it("recarregar a página não zera o tempo (baseado em timestamps, não contador)", () => {
    const startedAt = Date.now() - 300_000; // sessão aberta há 5 min
    // "reload": novo cálculo chega ao mesmo elapsed sem estado local
    expect(computeElapsedSeconds(Date.now(), startedAt, 0)).toBeGreaterThanOrEqual(299);
  });
});

describe("computeRemainingSeconds / isTimeExpired", () => {
  it("null quando não há limite", () => {
    expect(computeRemainingSeconds(100, undefined)).toBeNull();
    expect(isTimeExpired(100, undefined)).toBe(false);
  });

  it("contagem regressiva correta", () => {
    expect(computeRemainingSeconds(30, 300)).toBe(270);
    expect(computeRemainingSeconds(300, 300)).toBe(0);
  });

  it("nunca fica negativo e detecta expiração", () => {
    expect(computeRemainingSeconds(350, 300)).toBe(0);
    expect(isTimeExpired(299, 300)).toBe(false);
    expect(isTimeExpired(300, 300)).toBe(true);
    expect(isTimeExpired(301, 300)).toBe(true);
  });
});

describe("computeQuestionElapsedSeconds (relógio por questão)", () => {
  it("undefined quando não há âncora (sessões antigas)", () => {
    expect(computeQuestionElapsedSeconds(Date.now(), undefined, false, undefined)).toBeUndefined();
  });

  it("conta desde a âncora da questão", () => {
    const anchor = 1_000_000;
    expect(computeQuestionElapsedSeconds(anchor + 30_000, anchor, false, undefined)).toBe(30);
  });

  it("congela na pausa (usa lastPausedAt como referência)", () => {
    const anchor = 1_000_000;
    // pausada 5 min depois de começar; agora está 1h depois — não conta
    expect(
      computeQuestionElapsedSeconds(anchor + 3_600_000, anchor, true, anchor + 300_000),
    ).toBe(300);
  });

  it("nunca fica negativo", () => {
    expect(computeQuestionElapsedSeconds(500, 1_000, false, undefined)).toBe(0);
  });
});

describe("isPerQuestionTimeExpired", () => {
  it("false sem limite", () => {
    expect(isPerQuestionTimeExpired(9999, undefined)).toBe(false);
  });

  it("dentro do limite: false (inclusive no limite exato)", () => {
    expect(isPerQuestionTimeExpired(60, 60)).toBe(false);
    expect(isPerQuestionTimeExpired(64, 60)).toBe(false);
  });

  it("expira só após a tolerância de rede", () => {
    expect(isPerQuestionTimeExpired(60 + PER_QUESTION_GRACE_SECONDS, 60)).toBe(false);
    expect(isPerQuestionTimeExpired(60 + PER_QUESTION_GRACE_SECONDS + 1, 60)).toBe(true);
  });
});

// ============================================================
// RESULTADO
// ============================================================

function makeState(
  overrides: Partial<SessionQuestionState> & { position: number },
): SessionQuestionState {
  return {
    questionId: `q${overrides.position}`,
    status: "pending",
    markedForReview: false,
    ...overrides,
  };
}

describe("buildResultCounts", () => {
  it("calcula acertos, erros, brancos, marcadas e percentual", () => {
    const questions = [
      makeState({ position: 0, status: "answered", isCorrect: true, markedForReview: true }),
      makeState({ position: 1, status: "answered", isCorrect: false }),
      makeState({ position: 2, status: "answered", isCorrect: true }),
      makeState({ position: 3, status: "answered", isCorrect: false, markedForReview: true }),
      makeState({ position: 4, status: "skipped" }),
      makeState({ position: 5 }),
    ];
    const result = buildResultCounts(questions, 6, 120);

    expect(result.total).toBe(6);
    expect(result.answered).toBe(4);
    expect(result.correct).toBe(2);
    expect(result.incorrect).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.blank).toBe(1);
    expect(result.marked).toBe(2);
    // Percentual sobre o TOTAL (em branco conta contra): 2/6 = 33%
    expect(result.percent).toBe(33);
    expect(result.elapsedSeconds).toBe(120);
  });

  it("sessão incompleta: sem respostas => 0%", () => {
    const questions = [makeState({ position: 0 }), makeState({ position: 1 })];
    const result = buildResultCounts(questions, 2, 10);
    expect(result.answered).toBe(0);
    expect(result.percent).toBe(0);
  });

  it("100% de acertos", () => {
    const questions = [
      makeState({ position: 0, status: "answered", isCorrect: true }),
      makeState({ position: 1, status: "answered", isCorrect: true }),
    ];
    expect(buildResultCounts(questions, 2, 60).percent).toBe(100);
  });

  it("sessão vazia não divide por zero", () => {
    const result = buildResultCounts([], 0, 0);
    expect(result.total).toBe(0);
    expect(result.percent).toBe(0);
  });
});
