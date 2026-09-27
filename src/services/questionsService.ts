import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * QUESTIONS SERVICE
 * Camada única de acesso a questões para o frontend. Componentes NÃO chamam
 * `api.questions.*` diretamente — passam por aqui, mantendo a fronteira
 * UI → Service → Backend (Convex) limpa e fácil de evoluir (ex.: trocar
 * por API REST/Supabase sem tocar nas telas).
 */

export type QuestionStatus = "draft" | "review" | "published" | "archived";
export type Difficulty = "easy" | "medium" | "hard";

export interface QuestionFilters {
  term?: string;
  subjectId?: Id<"taxonomyNodes">;
  examId?: Id<"exams">;
  difficulty?: Difficulty;
  paginationOpts: { numItems: number; cursor: string | null };
}

export const PAGE_SIZE = 20;

/** Busca paginada de questões publicadas (aluno). */
export function searchPublishedQuestions(filters: QuestionFilters) {
  return {
    query: api.questions.searchQuestions,
    args: {
      term: filters.term,
      subjectId: filters.subjectId,
      examId: filters.examId,
      difficulty: filters.difficulty,
      paginationOpts: filters.paginationOpts,
    },
  } as const;
}

/** Detalhe de questão publicada, com ou sem gabarito (controle do player). */
export function getQuestionPublic(questionId: Id<"questions">, includeAnswer: boolean) {
  return {
    query: api.questions.getQuestion,
    args: { questionId, includeAnswer },
  } as const;
}

/**
 * Filtros administrativos (todos os status). Requer role admin no backend.
 */
export function listAdminQuestions(args: {
  status?: QuestionStatus;
  examId?: Id<"exams">;
  subjectId?: Id<"taxonomyNodes">;
  difficulty?: Difficulty;
  term?: string;
  paginationOpts: { numItems: number; cursor: string | null };
}) {
  return {
    query: api.adminQuestions.listQuestions,
    args,
  } as const;
}

export function getQuestionForReview(questionId: Id<"questions">) {
  return {
    query: api.adminQuestions.getQuestionForReview,
    args: { questionId },
  } as const;
}

/** Validação espelhada no cliente para feedback imediato no formulário. */
export {
  validateQuestion,
  MIN_ALTERNATIVES,
} from "@/convex/lib/questionValidation";
