import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Search,
  BookOpen,
  AlertTriangle,
  Star,
  ChevronRight,
  Library,
  FileText,
} from "lucide-react";
import { Link } from "react-router";
import { DemoSeedButton } from "@/components/DemoSeedButton";

export default function Questions() {
  const exams = useQuery(api.exams.listExams, {});
  const errorCount = useQuery(api.errorBook.countErrors, {});
  const favCount = useQuery(api.favorites.countFavorites, {});

  const SHORTCUTS = [
    {
      to: "/app/questions/create",
      icon: Plus,
      title: "Criar sessão",
      description: "Treino rápido, por assunto ou prova completa",
    },
    {
      to: "/app/questions/search",
      icon: Search,
      title: "Buscar questões",
      description: "Encontre por texto, matéria ou dificuldade",
    },
    {
      to: "/app/questions/errors",
      icon: AlertTriangle,
      title: "Caderno de erros",
      description: "Refaça o que você errou",
      badge: errorCount,
    },
    {
      to: "/app/questions/favorites",
      icon: Star,
      title: "Favoritos",
      description: "Suas questões salvas",
      badge: favCount,
    },
    {
      to: "/app/questions/contribute",
      icon: FileText,
      title: "Enviar prova (PDF)",
      description:
        "Tem o PDF de uma prova? Submeta — a análise fria cadastra as questões para o catálogo crescer",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow text-muted-foreground">banco de questões</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Questões</h1>
        </div>
        <Button asChild className="glow-primary">
          <Link to="/app/questions/create">
            <Plus className="size-4" />
            Criar sessão
          </Link>
        </Button>
      </div>

      {/* Atalhos */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SHORTCUTS.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className="panel group p-5 transition-colors hover:border-primary/40"
          >
            <div className="flex items-center justify-between">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="size-4" />
              </div>
              {typeof s.badge === "number" && s.badge > 0 && (
                <span className="chip border-destructive/40 text-destructive">
                  {s.badge}
                </span>
              )}
            </div>
            <h3 className="mt-3 font-semibold">{s.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
          </Link>
        ))}
      </div>

      {/* Catálogo de exames */}
      <section>
        <div className="flex items-center gap-2">
          <Library className="size-4 text-primary" />
          <h2 className="text-xl font-semibold">Catálogo de exames</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha um exame para ver edições, anos e fases disponíveis.
        </p>

        {exams === undefined ? (
          <div className="panel mt-4 p-10 text-center text-sm text-muted-foreground">
            carregando catálogo…
          </div>
        ) : exams.length === 0 ? (
          <div className="panel mt-4 flex flex-col items-center p-10 text-center">
            <BookOpen className="size-10 text-muted-foreground" />
            <p className="mt-4 font-semibold">Catálogo vazio</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Nenhum exame foi publicado ainda. Carregue o conteúdo de
              demonstração (ENEM, claramente rotulado como demo) para explorar a
              plataforma com questões de exemplo.
            </p>
            <div className="mt-5">
              <DemoSeedButton />
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {exams.map((exam) => (
              <Link
                key={exam._id}
                to={`/app/exams/${exam._id}`}
                className="panel group flex flex-col p-5 transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="chip mb-2">{exam.type}</p>
                    <h3 className="text-lg font-semibold">{exam.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {exam.institution}
                    </p>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
                {exam.description && (
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                    {exam.description}
                  </p>
                )}
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3 font-mono-tech text-xs text-muted-foreground">
                  <span>{exam.editions.length} edições</span>
                  <span>{exam.totalQuestions} questões</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
