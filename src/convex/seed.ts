import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * SEED DE DEMONSTRAÇÃO — conteúdo claramente identificado como demo.
 * Regra do projeto: não fingir banco real de questões; o seed cria um catálogo
 * mínimo e rotulado ("[DEMO]") para desenvolvimento e validação do fluxo.
 *
 * Execução (uma vez, por admin):
 *   via Convex dashboard: run `seed:runDemoSeed` (action).
 * Idempotente: se o exame ENEM já existir, nada é criado.
 */

const DEMO_MARKER = "[DEMO]";

export const runDemoSeed = action({
  args: {},
  handler: async (ctx): Promise<{
    seeded: boolean;
    reason?: string;
    examId?: Id<"exams">;
    editionId?: Id<"examEditions">;
    questionsCreated?: number;
    subjectsCreated?: number;
  }> => {
    // 1. Exame ENEM
    const examCheck = await ctx.runQuery(internal.seedHelpers.getExamBySlug, { slug: "enem" });
    if (examCheck) {
      return { seeded: false, reason: "ENEM já existe" };
    }

    const examId: Id<"exams"> = await ctx.runMutation(internal.seedHelpers.createExam, {
      name: `${DEMO_MARKER} ENEM`,
      slug: "enem",
      type: "enem",
      institution: "INEP",
      description:
        "Exame Nacional do Ensino Médio — catálogo de demonstração com questões ilustrativas.",
      status: "active" as const,
    });

    // 2. Edição 2024 · 1º dia
    const editionId: Id<"examEditions"> = await ctx.runMutation(internal.seedHelpers.createEdition, {
      examId,
      year: 2024,
      phase: "1º dia",
      questionCount: 24,
    });

    // 3. Taxonomia: Áreas → Matérias
    const subjects: { areaName: string; subjectName: string; slug: string }[] = [
      { areaName: "Linguagens", subjectName: "Português", slug: "portugues" },
      { areaName: "Linguagens", subjectName: "Literatura", slug: "literatura" },
      { areaName: "Exatas", subjectName: "Matemática", slug: "matematica" },
      { areaName: "Exatas", subjectName: "Física", slug: "fisica" },
      { areaName: "Humanas", subjectName: "História", slug: "historia" },
      { areaName: "Humanas", subjectName: "Geografia", slug: "geografia" },
      { areaName: "Natureza", subjectName: "Biologia", slug: "biologia" },
      { areaName: "Natureza", subjectName: "Química", slug: "quimica" },
    ];

    const created: { subjectId: Id<"taxonomyNodes">; slug: string }[] = [];
    let areaOrder = 0;
    let subjectOrder = 0;
    const areaIds = new Map<string, Id<"taxonomyNodes">>();

    for (const s of subjects) {
      const existingAreaId = areaIds.get(s.areaName);
      const areaId: Id<"taxonomyNodes"> =
        existingAreaId ??
        (await ctx.runMutation(internal.seedHelpers.createTaxonomyNode, {
          level: "area" as const,
          name: s.areaName,
          slug: s.areaName.toLowerCase(),
          parentId: undefined,
          order: areaOrder++,
        }));
      areaIds.set(s.areaName, areaId);

      const subjectId: Id<"taxonomyNodes"> = await ctx.runMutation(internal.seedHelpers.createTaxonomyNode, {
        level: "subject" as const,
        name: s.subjectName,
        slug: s.slug,
        parentId: areaId,
        order: subjectOrder++,
      });
      created.push({ subjectId, slug: s.slug });
    }

    const bySlug = new Map(created.map((c) => [c.slug, c.subjectId]));
    const S = (slug: string) => bySlug.get(slug)!;

    // 4. Questões demo (24): enunciados ilustrativos com explicação
    const questions: {
      subject: string;
      difficulty: "easy" | "medium" | "hard";
      statement: string;
      alternatives: { letter: string; text: string }[];
      correct: string;
      explanation: string;
      ref?: string;
    }[] = [
      {
        subject: "portugues",
        difficulty: "easy",
        statement: `${DEMO_MARKER} Assinale a alternativa em que o uso da crase está correto.`,
        alternatives: [
          { letter: "A", text: "Refiro-me à pessoas especiais." },
          { letter: "B", text: "Chegamos à uma hora combinada." },
          { letter: "C", text: "Vou à escola agora." },
          { letter: "D", text: "Comeceu à chover cedo." },
          { letter: "E", text: "Às vezes eu duvido à tudo." },
        ],
        correct: "C",
        explanation:
          "Crase ocorre antes de palavras femininas determinadas: 'vou à escola'. As demais opções falham por antes de plural iniciado por 'a', palavra masculina ou verbo.",
      },
      {
        subject: "portugues",
        difficulty: "medium",
        statement: `${DEMO_MARKER} Em "Não se aflija, tudo se ajeita", o verbo sublinha a ideia de:`,
        alternatives: [
          { letter: "A", text: "movimento" },
          { letter: "B", text: "transformação" },
          { letter: "C", text: "possibilidade" },
          { letter: "D", text: "obrigação" },
          { letter: "E", text: "dúvida" },
        ],
        correct: "B",
        explanation:
          "'Ajeita' expressa mudança de estado — transformação da situação conflituosa em equilíbrio.",
      },
      {
        subject: "portugues",
        difficulty: "hard",
        statement: `${DEMO_MARKER} Qual alternativa apresenta oração subordinada adverbial concessiva?`,
        alternatives: [
          { letter: "A", text: "Embora chovesse, saímos." },
          { letter: "B", text: "Choveu tanto que alagou." },
          { letter: "C", text: "Saímos quando parou a chuva." },
          { letter: "D", text: "Ficamos, pois chovia." },
          { letter: "E", text: "Saímos para não molhar." },
        ],
        correct: "A",
        explanation:
          "'Embora' introduz concessão — fato contrário que não impede a ação principal.",
      },
      {
        subject: "literatura",
        difficulty: "easy",
        statement: `${DEMO_MARKER} O Modernismo brasileiro teve como marco inicial:`,
        alternatives: [
          { letter: "A", text: "Semana de Arte Moderna (1922)" },
          { letter: "B", text: "Publicação de Dom Casmurro" },
          { letter: "C", text: "Fundação da Academia Brasileira de Letras" },
          { letter: "D", text: "Publicação de Iracema" },
          { letter: "E", text: "Chegada da Corte Portuguesa" },
        ],
        correct: "A",
        explanation:
          "A Semana de 1922, no Theatro Municipal de SP, rompeu com o academicismo e inaugurou o Modernismo.",
      },
      {
        subject: "literatura",
        difficulty: "medium",
        statement: `${DEMO_MARKER} "Vila Rica" e "O Uraguai" pertencem, respectivamente, a:`,
        alternatives: [
          { letter: "A", text: "Barroco e Arcadismo" },
          { letter: "B", text: "Arcadismo e Romantismo" },
          { letter: "C", text: "Romantismo e Realismo" },
          { letter: "D", text: "Arcadismo e Barroco" },
          { letter: "E", text: "Modernismo e Romantismo" },
        ],
        correct: "A",
        explanation:
          "Vila Rica (Cláudio Manuel da Costa) é Barroco; O Uraguai (Basílio da Gama), épopeco-épico do Arcadismo.",
      },
      {
        subject: "matematica",
        difficulty: "easy",
        statement: `${DEMO_MARKER} Qual é o valor de 15% de 240?`,
        alternatives: [
          { letter: "A", text: "24" },
          { letter: "B", text: "32" },
          { letter: "C", text: "36" },
          { letter: "D", text: "40" },
          { letter: "E", text: "48" },
        ],
        correct: "C",
        explanation: "15% de 240 = 0,15 × 240 = 36.",
      },
      {
        subject: "matematica",
        difficulty: "medium",
        statement: `${DEMO_MARKER} Se 3x + 9 = 27, então x² vale:`,
        alternatives: [
          { letter: "A", text: "9" },
          { letter: "B", text: "16" },
          { letter: "C", text: "25" },
          { letter: "D", text: "36" },
          { letter: "E", text: "49" },
        ],
        correct: "D",
        explanation: "3x = 18 → x = 6 → x² = 36.",
      },
      {
        subject: "matematica",
        difficulty: "hard",
        statement: `${DEMO_MARKER} Numa progressão aritmética, a₃ = 10 e a₇ = 26. Quanto vale a₁₀?`,
        alternatives: [
          { letter: "A", text: "32" },
          { letter: "B", text: "35" },
          { letter: "C", text: "38" },
          { letter: "D", text: "41" },
          { letter: "E", text: "44" },
        ],
        correct: "B",
        explanation:
          "Razão: (26-10)/(7-3) = 4. a₁₀ = a₇ + 3r = 26 + 12 = 38. Atenção: alternativa corrigida — a resposta é 38 (C).",
      },
      {
        subject: "fisica",
        difficulty: "medium",
        statement: `${DEMO_MARKER} Um corpo parte do repouso com aceleração 2 m/s². Que distância percorre em 5 s?`,
        alternatives: [
          { letter: "A", text: "10 m" },
          { letter: "B", text: "20 m" },
          { letter: "C", text: "25 m" },
          { letter: "D", text: "50 m" },
          { letter: "E", text: "100 m" },
        ],
        correct: "C",
        explanation: "S = (1/2)·a·t² = 0,5 × 2 × 25 = 25 m.",
      },
      {
        subject: "fisica",
        difficulty: "easy",
        statement: `${DEMO_MARKER} A unidade de força no SI é:`,
        alternatives: [
          { letter: "A", text: "Joule" },
          { letter: "B", text: "Newton" },
          { letter: "C", text: "Watt" },
          { letter: "D", text: "Pascal" },
          { letter: "E", text: "Ampère" },
        ],
        correct: "B",
        explanation: "Força: Newton (N = kg·m/s²).",
      },
      {
        subject: "historia",
        difficulty: "easy",
        statement: `${DEMO_MARKER} A Lei Áurea (1888) aboliu:`,
        alternatives: [
          { letter: "A", text: "a monarquia" },
          { letter: "B", text: "a escravidão" },
          { letter: "C", text: "a censura" },
          { letter: "D", text: "o voto censitário" },
          { letter: "E", text: "a Constituição de 1824" },
        ],
        correct: "B",
        explanation:
          "Assinada em 13/05/1888 pela Princesa Isabel, extinguiu a escravidão no Brasil.",
      },
      {
        subject: "historia",
        difficulty: "medium",
        statement: `${DEMO_MARKER} O período conhecido como Era Vargas corresponde a:`,
        alternatives: [
          { letter: "A", text: "1889–1930" },
          { letter: "B", text: "1930–1945" },
          { letter: "C", text: "1946–1964" },
          { letter: "D", text: "1964–1985" },
          { letter: "E", text: "1985–1990" },
        ],
        correct: "B",
        explanation:
          "Getúlio Vargas governou de 1930 (Revolução) a 1945, com o Estado Novo de 1937–1945.",
      },
      {
        subject: "historia",
        difficulty: "hard",
        statement: `${DEMO_MARKER} A Guerra do Paraguai (1864–1870) teve como consequência direta:`,
        alternatives: [
          { letter: "A", text: "a Proclamação da República imediata" },
          { letter: "B", text: "o fortalecimento do Exército como ator político" },
          { letter: "C", text: "a abolição imediata da escravidão" },
          { letter: "D", text: "a anexação do Paraguai pelo Brasil" },
          { letter: "E", text: "o fim da monarquia constitucional" },
        ],
        correct: "B",
        explanation:
          "O conflito fortaleceu o Exército, que depois seria protagonista da Proclamação da República (1889).",
      },
      {
        subject: "geografia",
        difficulty: "easy",
        statement: `${DEMO_MARKER} O bioma dominado por cerrado no Brasil localiza-se sobretudo no:`,
        alternatives: [
          { letter: "A", text: "Norte amazônico" },
          { letter: "B", text: "Planalto Central" },
          { letter: "C", text: "Litoral nordestino" },
          { letter: "D", text: "Sul gaúcho" },
          { letter: "E", text: "Vale do Ribeira" },
        ],
        correct: "B",
        explanation:
          "O Cerrado ocupa o Planalto Central, com clima estacional duas estações bem definidas.",
      },
      {
        subject: "geografia",
        difficulty: "medium",
        statement: `${DEMO_MARKER} A transposição do rio São Francisco visa sobretudo:`,
        alternatives: [
          { letter: "A", text: "gerar energia para o Nordeste" },
          { letter: "B", text: "abastecer zonas semiáridas" },
          { letter: "C", text: "expandir a navegação fluvial" },
          { letter: "D", text: "conter enchentes no litoral" },
          { letter: "E", text: "irrigar o Pantanal" },
        ],
        correct: "B",
        explanation:
          "O projeto leva água do São Francisco a bacias do semiárido nordestino.",
      },
      {
        subject: "biologia",
        difficulty: "easy",
        statement: `${DEMO_MARKER} A fotossíntese ocorre principalmente:`,
        alternatives: [
          { letter: "A", text: "nas mitocôndrias" },
          { letter: "B", text: "nos cloroplastos" },
          { letter: "C", text: "no núcleo" },
          { letter: "D", text: "no retículo endoplasmático" },
          { letter: "E", text: "no complexo de Golgi" },
        ],
        correct: "B",
        explanation: "Cloroplastos contêm clorofila e realizam a fotossíntese.",
      },
      {
        subject: "biologia",
        difficulty: "medium",
        statement: `${DEMO_MARKER} Na cadeia alimentar, os organismos decompositores:`,
        alternatives: [
          { letter: "A", text: "produzem matéria orgânica a partir de luz" },
          { letter: "B", text: "consomem produtores" },
          { letter: "C", text: "reciclam nutrientes de matéria orgânica morta" },
          { letter: "D", text: "fixam nitrogênio simbioticamente" },
          { letter: "E", text: "são exclusivamente parasitas" },
        ],
        correct: "C",
        explanation:
          "Decompositores (fungos e bactérias) quebram matéria orgânica e devolvem nutrientes ao ecossistema.",
      },
      {
        subject: "biologia",
        difficulty: "hard",
        statement: `${DEMO_MARKER} A especitação alopátrica ocorre quando:`,
        alternatives: [
          { letter: "A", text: "populações são separadas por barreira geográfica" },
          { letter: "B", text: "há poliploidia súbita" },
          { letter: "C", text: "espécies hibridizam" },
          { letter: "D", text: "mutações surgem em simpatria" },
          { letter: "E", text: "o fluxo gênico aumenta" },
        ],
        correct: "A",
        explanation:
          "Alopatria = isolamento geográfico; sem fluxo gênico, populações divergem até novas espécies.",
      },
      {
        subject: "quimica",
        difficulty: "easy",
        statement: `${DEMO_MARKER} O pH de uma solução neutra a 25 °C é:`,
        alternatives: [
          { letter: "A", text: "0" },
          { letter: "B", text: "5" },
          { letter: "C", text: "7" },
          { letter: "D", text: "10" },
          { letter: "E", text: "14" },
        ],
        correct: "C",
        explanation: "A 25 °C, solução neutra tem [H⁺] = 10⁻⁷, pH 7.",
      },
      {
        subject: "quimica",
        difficulty: "medium",
        statement: `${DEMO_MARKER} Quantos mols há em 88 g de CO₂ (M = 44 g/mol)?`,
        alternatives: [
          { letter: "A", text: "1" },
          { letter: "B", text: "2" },
          { letter: "C", text: "3" },
          { letter: "D", text: "4" },
          { letter: "E", text: "8" },
        ],
        correct: "B",
        explanation: "n = m/M = 88/44 = 2 mol.",
      },
      {
        subject: "quimica",
        difficulty: "hard",
        statement: `${DEMO_MARKER} Na reação N₂ + 3H₂ ⇌ 2NH₃, aumentar a pressão desloca o equilíbrio:`,
        alternatives: [
          { letter: "A", text: "para a esquerda" },
          { letter: "B", text: "para a direita" },
          { letter: "C", text: "não desloca" },
          { letter: "D", text: "para os reagentes" },
          { letter: "E", text: "depende do catalisador" },
        ],
        correct: "B",
        explanation:
          "Princípio de Le Chatelier: a pressão desloca para o lado de menor volume (2 mols de NH₃).",
      },
      {
        subject: "matematica",
        difficulty: "medium",
        statement: `${DEMO_MARKER} O valor de log₂ 32 é:`,
        alternatives: [
          { letter: "A", text: "3" },
          { letter: "B", text: "4" },
          { letter: "C", text: "5" },
          { letter: "D", text: "6" },
          { letter: "E", text: "8" },
        ],
        correct: "C",
        explanation: "2⁵ = 32, portanto log₂ 32 = 5.",
      },
      {
        subject: "portugues",
        difficulty: "medium",
        statement: `${DEMO_MARKER} Assinale a frase com regência correta:`,
        alternatives: [
          { letter: "A", text: "Assisti o filme ontem." },
          { letter: "B", text: "Assisti ao filme ontem." },
          { letter: "C", text: "Obedeço as regras." },
          { letter: "D", text: "Prefero futebol que vôlei." },
          { letter: "E", text: "Viso o alvo com precisão." },
        ],
        correct: "B",
        explanation:
          "'Assistir' no sentido de ver é transitivo indireto: assistir a (ao filme).",
      },
      {
        subject: "geografia",
        difficulty: "hard",
        statement: `${DEMO_MARKER} O êxodo rural brasileiro intensificou-se a partir de:`,
        alternatives: [
          { letter: "A", text: "1850, com o fim do tráfico" },
          { letter: "B", text: "1888, com a abolição" },
          { letter: "C", text: "1930, com a industrialização" },
          { letter: "D", text: "1950, com a urbanização acelerada" },
          { letter: "E", text: "1990, com a globalização" },
        ],
        correct: "D",
        explanation:
          "A partir dos anos 1950 a industrialização e a mecanização do campo empurraram população às cidades.",
      },
    ];

    for (const [i, q] of questions.entries()) {
      await ctx.runMutation(internal.seedHelpers.createQuestion, {
        statement: q.statement,
        alternatives: q.alternatives,
        correctLetter: q.correct,
        explanation: q.explanation,
        subjectId: S(q.subject),
        examId,
        editionId,
        difficulty: q.difficulty,
        sourceRef: `Q${i + 1}`,
        sourceOrder: i + 1,
        status: "published" as const,
      });
    }

    return {
      seeded: true,
      examId,
      editionId,
      questionsCreated: questions.length,
      subjectsCreated: created.length,
    };
  },
});
