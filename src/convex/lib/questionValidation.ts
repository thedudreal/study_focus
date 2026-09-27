/**
 * VALIDAÇÃO DE QUESTÕES — regra única usada por criação manual, edição,
 * importação CSV e transições de status. Nada publica sem passar por aqui.
 */

export interface AlternativeInput {
  letter: string;
  text: string;
}

export interface QuestionInputLike {
  statement: string;
  alternatives: AlternativeInput[];
  correctLetter: string;
  subjectId: string;
  examId?: string;
  editionId?: string;
  year?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export const MIN_ALTERNATIVES = 2;

/** Valida uma questão candidata. Retorna todos os erros de uma vez. */
export function validateQuestion(q: QuestionInputLike): ValidationResult {
  const errors: string[] = [];

  // 1. Enunciado obrigatório
  if (!q.statement || q.statement.trim().length === 0) {
    errors.push("enunciado vazio");
  }

  // 2. Matéria obrigatória
  if (!q.subjectId) {
    errors.push("matéria não informada");
  }

  // 3. Alternativas: mínimo e não-vazias
  if (!q.alternatives || q.alternatives.length < MIN_ALTERNATIVES) {
    errors.push(`pelo menos ${MIN_ALTERNATIVES} alternativas são exigidas`);
  } else {
    const emptyAlt = q.alternatives.findIndex((a) => !a.text || a.text.trim().length === 0);
    if (emptyAlt >= 0) {
      errors.push(
        `alternativa ${q.alternatives[emptyAlt].letter || emptyAlt + 1} vazia`,
      );
    }

    // letras duplicadas
    const letters = q.alternatives.map((a) => a.letter.trim().toUpperCase());
    const dup = letters.find((l, i) => letters.indexOf(l) !== i);
    if (dup) {
      errors.push(`letra de alternativa duplicada: ${dup}`);
    }
  }

  // 4. Exatamente uma correta
  if (q.correctLetter) {
    const correct = q.alternatives.find(
      (a) => a.letter.trim().toUpperCase() === q.correctLetter.trim().toUpperCase(),
    );
    if (!correct) {
      errors.push(`resposta correta "${q.correctLetter}" não corresponde a nenhuma alternativa`);
    }
  } else {
    errors.push("nenhuma resposta correta marcada");
  }

  // 5. Prova/ano quando aplicável: se informou edição, exige prova; se informou
  //    ano sem prova, é erro de estrutura do CSV.
  if (q.editionId && !q.examId) {
    errors.push("edição informada sem prova correspondente");
  }
  if (q.year !== undefined && !q.examId) {
    errors.push("ano informado sem prova correspondente");
  }

  return { valid: errors.length === 0, errors };
}

/** Normaliza letra ("a" → "A"). */
export function normalizeLetter(letter: string): string {
  return letter.trim().toUpperCase();
}

/** Normaliza dificuldade aceita variantes comuns no CSV. */
export function normalizeDifficulty(
  raw: string | undefined,
): "easy" | "medium" | "hard" {
  const value = (raw ?? "").trim().toLowerCase();
  if (["fácil", "facil", "easy", "e", "1"].includes(value)) return "easy";
  if (["difícil", "dificil", "hard", "h", "3"].includes(value)) return "hard";
  return "medium";
}
