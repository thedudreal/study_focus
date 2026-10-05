import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Play, Check, ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";

export default function Errors() {
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const errors = useQuery(api.errorBook.listErrors, {});
  const markResolved = useMutation(api.errorBook.markResolved);
  const createSession = useMutation(api.studySessions.createSession);

  const startErrorsSession = async () => {
    setStarting(true);
    try {
      const sessionId = await createSession({
        type: "error_review",
        questionCount: 20,
      });
      navigate(`/app/session/${sessionId}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível iniciar a sessão.",
      );
      setStarting(false);
    }
  };

  const resolve = async (errorId: string) => {
    try {
      await markResolved({ errorId: errorId as Id<"errorBook"> });
      toast.success("Questão marcada como revisada.");
    } catch {
      toast.error("Não foi possível atualizar. Tente novamente.");
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/app/questions"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Questões
        </Link>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Caderno de erros</h1>
            <p className="mt-1 text-muted-foreground">
              {errors === undefined
                ? "carregando…"
                : errors.length === 0
                  ? "Nenhum erro aberto — bom sinal!"
                  : `${errors.length} questões para revisar`}
            </p>
          </div>
          {errors && errors.length > 0 && (
            <Button onClick={startErrorsSession} disabled={starting} className="glow-primary">
              <Play className="size-4" />
              {starting ? "Iniciando…" : "Treinar erros"}
            </Button>
          )}
        </div>
      </div>

      {errors === undefined ? (
        <div className="panel p-10 text-center text-sm text-muted-foreground">
          carregando…
        </div>
      ) : errors.length === 0 ? (
        <div className="panel p-10 text-center">
          <AlertTriangle className="mx-auto size-10 text-muted-foreground" />
          <p className="mt-4 font-semibold">Caderno limpo</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Quando você errar uma questão, ela aparece aqui automaticamente para
            você refazer até dominar.
          </p>
          <Button variant="outline" asChild className="mt-4">
            <Link to="/app/questions/create">Começar a treinar</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {errors.map((err) => (
            <div
              key={err.errorId}
              className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="chip">{err.subjectName}</span>
                  {err.examName && <span className="chip">{err.examName}</span>}
                  {err.errorCount > 1 && (
                    <span className="chip border-destructive/40 text-destructive">
                      {err.errorCount} erros
                    </span>
                  )}
                </div>
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed">
                  {err.statement}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => resolve(err.errorId)}
                className="shrink-0"
              >
                <Check className="size-4" />
                Já revisei
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
