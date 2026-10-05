import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Play, BookOpen } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";

export default function ExamDetail() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [starting, setStarting] = useState<string | null>(null);
  const exam = useQuery(
    api.exams.getExam,
    examId ? { examId: examId as Id<"exams"> } : "skip",
  );
  const createSession = useMutation(api.studySessions.createSession);

  const startExam = async (editionId: string) => {
    setStarting(editionId);
    try {
      const sessionId = await createSession({
        type: "exam",
        editionId: editionId as Id<"examEditions">,
      });
      navigate(`/app/session/${sessionId}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível iniciar a prova.",
      );
      setStarting(null);
    }
  };

  if (exam === undefined) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        carregando exame…
      </div>
    );
  }

  if (exam === null) {
    return (
      <div className="panel p-10 text-center">
        <BookOpen className="mx-auto size-10 text-muted-foreground" />
        <p className="mt-4 font-semibold">Exame não encontrado</p>
        <Button variant="outline" asChild className="mt-4">
          <Link to="/app/questions">
            <ArrowLeft className="size-4" />
            Voltar ao catálogo
          </Link>
        </Button>
      </div>
    );
  }

  // Agrupa edições por ano
  const byYear = new Map<number, typeof exam.editions>();
  for (const ed of exam.editions) {
    const list = byYear.get(ed.year) ?? [];
    list.push(ed);
    byYear.set(ed.year, list);
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/app/questions"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Catálogo
        </Link>
        <div className="mt-4 flex flex-col gap-2">
          <p className="chip w-fit">{exam.type}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{exam.name}</h1>
          <p className="text-muted-foreground">
            {exam.institution}
            {exam.description ? ` · ${exam.description}` : ""}
          </p>
        </div>
      </div>

      <section>
        <h2 className="text-xl font-semibold">Provas disponíveis</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada prova preserva a ordem original das questões e corrige apenas no
          final — como no dia do exame.
        </p>

        {exam.editions.length === 0 ? (
          <div className="panel mt-4 p-10 text-center text-sm text-muted-foreground">
            Nenhuma edição publicada para este exame.
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            {[...byYear.entries()].map(([year, editions]) => (
              <div key={year}>
                <p className="eyebrow text-primary">{year}</p>
                <div className="mt-3 space-y-3">
                  {editions.map((ed) => (
                    <div
                      key={ed._id}
                      className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-semibold">{ed.phase ?? `Edição ${ed.year}`}</p>
                        <p className="font-mono-tech mt-0.5 text-xs text-muted-foreground">
                          {ed.questionCount} questões
                        </p>
                      </div>
                      <Button
                        onClick={() => startExam(ed._id)}
                        disabled={starting === ed._id || ed.questionCount === 0}
                        className="shrink-0"
                      >
                        <Play className="size-4" />
                        {starting === ed._id ? "Iniciando…" : "Fazer prova"}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
