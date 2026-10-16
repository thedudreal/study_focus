/**
 * TRIAGEM FRIA DE CONTRIBUIÇÕES DE PROVA EM PDF — FUNÇÕES PURAS (sem I/O).
 *
 * Uma contribuição de usuário só "entra no site" se passar por critérios
 * objetivos e verificáveis. A triagem NUNCA inventa conteúdo: o que não
 * se enquadra é REJEITADO com motivo explícito, ou ACEITO COM RESSALVAS
 * que a revisão admin precisa resolver antes de publicar.
 *
 * Critérios de enquadramento:
 * 1. Ano: deve estar DENTRO do PDF (informado pelo usuário e confirmado
 *    no texto, OU inferível quando há um único candidato no texto).
 * 2. Questões: enunciado e alternativas parseáveis (>= 1 questão completa).
 * 3. Originalidade: se TUDO for duplicata do banco, a contribuição não
 *    agrega nada — é aceita só como registro, com aviso na revisão.
 */

export type YearSource = "informed_confirmed" | "inferred" | "missing";

export interface YearCheck {
  /** Ano efetivo da triagem (informado ou inferido). */
  year?: number;
  source: YearSource;
  /** Informado mas NÃO aparece no texto → mismatch inviabiliza o ano. */
  mismatched?: boolean;
  /** Vários anos distintos no texto → ambíguo, não infere. */
  ambiguous?: boolean;
}

export interface ContributionStats {
  /** Questões identificadas no PDF. */
  found: number;
  /** Questões completas (enunciado + alternativas, sem revisão pendente). */
  ready: number;
  /** Enunciado idêntico (hash) já existe no banco de questões publicado. */
  duplicateInDb: number;
  /** Enunciado idêntico repetido dentro do próprio arquivo. */
  duplicateInFile: number;
}

export type FitOutcome = "accepted" | "rejected";

export interface FitResult {
  outcome: FitOutcome;
  /** Motivos da rejeição (quando outcome = "rejected"). */
  rejectionReasons: string[];
  /** Ressalvas quando aceito — a revisão admin precisa resolvê-las. */
  warnings: string[];
}

const MIN_YEAR = 1990;

/** Anos plausíveis: 1990..(ano corrente + 1). */
export function isPlausibleYear(n: number): boolean {
  const thisYear = new Date().getFullYear();
  return Number.isInteger(n) && n >= MIN_YEAR && n <= thisYear + 1;
}

/**
 * Verifica o ano "frio":
 * - informado → confirma que o texto o menciona (senão mismatched);
 * - não informado → infere SOMENTE se houver exatamente um candidato
 *   plausível distinto no texto (ambíguo → não inventa).
 */
export function checkYear(
  text: string,
  informedYear: number | undefined,
): YearCheck {
  const candidates = new Set<number>();
  const re = /\b(19\d{2}|20\d{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = parseInt(m[1], 10);
    if (isPlausibleYear(n)) candidates.add(n);
  }

  if (informedYear !== undefined) {
    if (!isPlausibleYear(informedYear)) {
      return { year: undefined, source: "missing", mismatched: true };
    }
    if (!candidates.has(informedYear)) {
      return { year: informedYear, source: "informed_confirmed", mismatched: true };
    }
    return { year: informedYear, source: "informed_confirmed" };
  }

  if (candidates.size === 1) {
    const [year] = candidates;
    return { year, source: "inferred" };
  }
  return { year: undefined, source: "missing", ambiguous: candidates.size > 1 };
}

/**
 * Avalia se a contribuição se enquadra no site.
 * Regras (nesta ordem, motivo sempre claro):
 * 1. sem questões identificadas → rejected;
 * 2. ano INFORMADO que não aparece no PDF → rejected (contradição do
 *    próprio usuário — corrija e reenvie); ano ausente/ambíguo → aceito
 *    com aviso (nada contradiz o texto; o ano é fixado na revisão);
 * 3. nenhuma questão completa → aceito com aviso forte (revisão lê tudo);
 * 4. tudo duplicado no banco → aceito com aviso (nada agrega).
 */
export function assessFit(
  stats: ContributionStats,
  yearCheck: YearCheck,
): FitResult {
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (stats.found === 0) {
    reasons.push(
      "Nenhuma questão identificada — o PDF não segue o padrão visível “QUESTÃO N” com alternativas.",
    );
    return { outcome: "rejected", rejectionReasons: reasons, warnings };
  }

  if (yearCheck.mismatched) {
    reasons.push(
      `Ano informado (${yearCheck.year}) não aparece no texto do PDF — confirme ou corrija o ano e reenvie.`,
    );
    return { outcome: "rejected", rejectionReasons: reasons, warnings };
  }

  if (stats.ready === 0) {
    warnings.push(
      "Nenhuma questão completa — todas pendem de correção manual pelo admin antes de publicar.",
    );
  }

  const duplicates = stats.duplicateInDb + stats.duplicateInFile;
  if (stats.found > 0 && duplicates === stats.found) {
    warnings.push(
      "Todas as questões identificadas são duplicatas — nada novo entra no banco.",
    );
  } else if (duplicates > 0) {
    warnings.push(`${duplicates} questão(ões) duplicada(s) vão à revisão.`);
  }

  if (stats.ready < stats.found) {
    warnings.push(
      `${stats.found - stats.ready} questão(ões) incompleta(s) — revisão manual necessária.`,
    );
  }

  if (yearCheck.source === "inferred") {
    warnings.push(`Ano inferido do texto: ${yearCheck.year} — confirme na revisão.`);
  } else if (yearCheck.source === "missing") {
    warnings.push(
      yearCheck.ambiguous
        ? "Ano ambíguo no PDF (vários candidatos) — confirme o ano na revisão."
        : "Ano não identificado no PDF — informe o ano na revisão.",
    );
  }

  return { outcome: "accepted", rejectionReasons: [], warnings };
}
