import { describe, expect, it } from "vitest";
import {
  isUsableQuestion,
  selectFromIds,
  dailySeed,
  MAX_QUESTIONS_PER_SESSION,
} from "../sessionBuilder";
import type { Doc } from "../../_generated/dataModel";

// ============================================================
// HELPERS
// ============================================================

function makeQuestion(
  overrides: Omit<Partial<Doc<"questions">>, "_id"> & { _id: string },
): Doc<"questions"> {
  const { _id, ...rest } = overrides;
  return {
    statement: "Questão de teste",
    alternatives: [
      { letter: "A", text: "alt A" },
      { letter: "B", text: "alt B" },
      { letter: "C", text: "alt C" },
    ],
    correctLetter: "A",
    subjectId: "subject1" as never,
    difficulty: "medium",
    status: "published",
    ...rest,
    _id: _id as never,
  } as Doc<"questions">;
}

/** selectFromIds usa ctx.db.get(id); simulamos um banco mínimo em memória. */
function makeCtx(questions: Doc<"questions">[]) {
  const byId = new Map<string, Doc<"questions">>(questions.map((q) => [q._id as string, q]));
  return {
    db: {
      get: async (id: string) => byId.get(id) ?? null,
    },
  } as never;
}

// ============================================================
// FILTRO DE QUESTÕES UTILIZÁVEIS (somente PUBLISHED e válidas)
// ============================================================

describe("isUsableQuestion — questões publicadas e válidas", () => {
  it("aceita questão publicada completa", () => {
    expect(isUsableQuestion(makeQuestion({ _id: "q1" }))).toBe(true);
  });

  it("rejeita draft, review e archived — nunca entram em sessão", () => {
    expect(isUsableQuestion(makeQuestion({ _id: "q1", status: "draft" }))).toBe(false);
    expect(isUsableQuestion(makeQuestion({ _id: "q2", status: "review" }))).toBe(false);
    expect(isUsableQuestion(makeQuestion({ _id: "q3", status: "archived" }))).toBe(false);
  });

  it("rejeita questão sem gabarito ou com menos de 2 alternativas", () => {
    expect(isUsableQuestion(makeQuestion({ _id: "q1", correctLetter: "" }))).toBe(false);
    expect(
      isUsableQuestion(
        makeQuestion({ _id: "q2", alternatives: [{ letter: "A", text: "única" }] }),
      ),
    ).toBe(false);
  });
});

// ============================================================
// SELEÇÃO POR IDS (erros/favoritos/retry): garantia de quantidade
// ============================================================

describe("selectFromIds — garantia de quantidade e filtros", () => {
  const questions = [
    makeQuestion({ _id: "q1" }),
    makeQuestion({ _id: "q2" }),
    makeQuestion({ _id: "q3", status: "draft" }), // não publicada
    makeQuestion({ _id: "q4" }),
    makeQuestion({ _id: "q5", status: "archived" }), // não publicada
  ];

  it("pede 4, só 3 publicadas existem => devolve 3 e reporta disponível=3", async () => {
    const ctx = makeCtx(questions);
    const report = await selectFromIds(
      ctx,
      ["q1", "q2", "q3", "q4"] as never[],
      4,
      "random",
      42,
    );
    expect(report.picked.length).toBe(3);
    expect(report.available).toBe(3);
    expect(report.requested).toBe(4);
    expect(report.picked.sort()).toEqual(["q1", "q2", "q4"].sort());
  });

  it("remove duplicadas do pedido (dedupe)", async () => {
    const ctx = makeCtx(questions);
    const report = await selectFromIds(
      ctx,
      ["q1", "q1", "q2", "q2"] as never[],
      10,
      "original",
      42,
    );
    expect(report.picked).toEqual(["q1", "q2"]);
  });

  it("ORDER ORIGINAL preserva a ordem da lista de origem (ex.: erros recentes)", async () => {
    const ctx = makeCtx(questions);
    const report = await selectFromIds(
      ctx,
      ["q4", "q1", "q2"] as never[],
      10,
      "original",
      42,
    );
    expect(report.picked).toEqual(["q4", "q1", "q2"]);
  });

  it("ORDER RANDOM é estável com a mesma seed (ordem definida na criação)", async () => {
    const ctx = makeCtx(questions);
    const a = await selectFromIds(ctx, ["q1", "q2", "q4"] as never[], 3, "random", 7);
    const b = await selectFromIds(ctx, ["q1", "q2", "q4"] as never[], 3, "random", 7);
    expect(a.picked).toEqual(b.picked);
  });

  it("limita ao máximo de 90 questões por sessão", async () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      makeQuestion({ _id: `q${i}` }),
    );
    const ctx = makeCtx(many);
    const report = await selectFromIds(
      ctx,
      many.map((q) => q._id) as never[],
      120,
      "original",
      1,
    );
    expect(report.picked.length).toBe(MAX_QUESTIONS_PER_SESSION);
  });

  it("ignora IDs que não existem mais no banco", async () => {
    const ctx = makeCtx(questions);
    const report = await selectFromIds(ctx, ["q1", "fantasma"] as never[], 10, "original", 1);
    expect(report.picked).toEqual(["q1"]);
  });
});

// ============================================================
// SEED DIÁRIO (questões do dia iguais o dia todo)
// ============================================================

describe("dailySeed", () => {
  it("é estável para o mesmo usuário+dia", () => {
    expect(dailySeed("user1", "2026-10-03")).toBe(dailySeed("user1", "2026-10-03"));
  });

  it("muda entre usuários e dias", () => {
    expect(dailySeed("user1", "2026-10-03")).not.toBe(dailySeed("user2", "2026-10-03"));
    expect(dailySeed("user1", "2026-10-03")).not.toBe(dailySeed("user1", "2026-10-04"));
  });
});
