import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  CircleDashed,
  Clock,
  Target,
  ArrowLeft,
  AlertTriangle,
  Bookmark,
  ChevronDown,
} from "lucide-react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";

export default function Results() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);

  const result = useQuery(
    api.studySessions.getSessionResult,
    sessionId ? { sessionId: sessionId as Id<"studySessions"> } : "skip",
  );
  const detail = useQuery(
    api.studySessions.getResultQuestions,
    sessionId ? { sessionId: sessionId as Id<"studySessions"> } : "skip",
  );
  const retryErrors = useMutation(api.studySessions.retryErrorsSession);

  const startErrorTraining = async () => {
    setStarting(true);
    try {
      const newId = await retryErrors({
        sessionId: sessionId as Id<"studySessions">,
      });
      window.location.href = `/app/session/${newId}`;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível criar a sessão de erros.");
      setStarting(false);
    }
  };

  if (result === undefined) {
    return (
      <div className="p-10 text-center font-mono-tech text-sm text-muted-foreground">
        carregando resultado…
      </div>
    );
  }

  if (result === null) {
    return (
      <div className="panel p-10 text-center">
        <p className="font-semibold">Resultado não encontrado</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Ele pode pertencer a outro usuário ou não existir.
        </p>
        <Button variant="outline" asChild className="mt-4">
          <Link to="/app/history">Ver meu histórico</Link>
        </Button>
      </div>
    );
  }

  const formatTime = (s: number) =>
    s >= 3600
      ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}min`
      : `${Math.floor(s / 60)}min ${s % 60}s`;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link
          to="/app/history"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Meu histórico
        </Link>
        <p className="eyebrow mt-4 text-muted-foreground">{result.typeLabel}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {result.title}
        </h1>
      </div>

      {/* Score principal */}
      <section className="panel p-8 text-center glow-primary">
        <p className="eyebrow text-muted-foreground">precisão</p>
        <p className="font-mono-tech mt-2 text-6xl font-semibold text-primary">
          {result.percent}%
        </p>
        <p className="mt-2 text-muted-foreground">
          {result.correct} acertos em {result.total} questões
        </p>

        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-5">
          <div className="bg-card p-4">
            <CheckCircle2 className="mx-auto size-5 text-chart-3" />
            <p className="font-mono-tech mt-1.5 text-xl font-semibold">{result.correct}</p>
            <p className="text-xs text-muted-foreground">corretas</p>
          </div>
          <div className="bg-card p-4">
            <XCircle className="mx-auto size-5 text-destructive" />
            <p className="font-mono-tech mt-1.5 text-xl font-semibold">{result.incorrect}</p>
            <p className="text-xs text-muted-foreground">incorretas</p>
          </div>
          <div className="bg-card p-4">
            <CircleDashed className="mx-auto size-5 text-muted-foreground" />
            <p className="font-mono-tech mt-1.5 text-xl font-semibold">{result.blank}</p>
            <p className="text-xs text-muted-foreground">em branco</p>
          </div>
          <div className="bg-card p-4">
            <Bookmark className="mx-auto size-5 text-chart-4" />
            <p className="font-mono-tech mt-1.5 text-xl font-semibold">{result.marked}</p>
            <p className="text-xs text-muted-foreground">marcadas 🔖</p>
          </div>
          <div className="bg-card p-4">
            <Clock className="mx-auto size-5 text-chart-2" />
            <p className="font-mono-tech mt-1.5 text-xl font-semibold">
              {formatTime(result.elapsedSeconds)}
            </p>
            <p className="text-xs text-muted-foreground">tempo</p>
          </div>
        </div>
      </section>

      {/* Desempenho por matéria */}
      {result.bySubject.length > 0 && (
        <section className="panel p-6">
          <p className="eyebrow text-muted-foreground">desempenho por matéria</p>
          <div className="mt-4 space-y-4">
            {result.bySubject.map((s) => {
              const pct = Math.round((s.correct / s.total) * 100);
              return (
                <div key={s.name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{s.name}</span>
                    <span className="font-mono-tech text-muted-foreground">
                      {s.correct}/{s.total} · {pct}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={`h-full rounded-full ${pct >= 60 ? "bg-chart-3" : "bg-destructive"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Revisão detalhada */}
      {detail !== undefined && detail !== null && (
        <section className="panel p-6">
          <p className="eyebrow text-muted-foreground">revisão questão por questão</p>
          <div className="mt-4 space-y-2">
            {detail.questions.map((q) => {
              const isOpen = expanded === q.position;
              const answered = q.status === "answered";
              const icon = !answered ? (
                <CircleDashed className="size-5 shrink-0 text-muted-foreground" />
              ) : q.isCorrect ? (
                <CheckCircle2 className="size-5 shrink-0 text-chart-3" />
              ) : (
                <XCircle className="size-5 shrink-0 text-destructive" />
              );
              const label = !answered
                ? q.status === "skipped"
                  ? "Deixada para depois"
                  : "Não respondida"
                : q.isCorrect
                  ? "✓ Correta"
                  : "✗ Incorreta";
              return (
                <div key={q.position} className="rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : q.position)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-secondary/40"
                  >
                    {icon}
                    <span className="font-mono-tech w-8 shrink-0 text-sm text-muted-foreground">
                      {q.position + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{q.statement}</span>
                    {q.markedForReview && (
                      <Bookmark className="size-4 shrink-0 fill-chart-4 text-chart-4" aria-label="Marcada para revisão" />
                    )}
                    <span
                      className={`hidden shrink-0 text-xs sm:inline ${
                        !answered
                          ? "text-muted-foreground"
                          : q.isCorrect
                            ? "text-chart-3"
                            : "text-destructive"
                      }`}
                    >
                      {label}
                    </span>
                    <ChevronDown
                      className={`size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isOpen && (
                    <div className="border-t border-border p-4">
                      {q.context && (
                        <div className="rounded-md border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
                          {q.context}
                        </div>
                      )}
                      <p className="mt-3 text-sm leading-relaxed">{q.statement}</p>

                      <div className="mt-4 space-y-2">
                        {q.alternatives.map((alt) => {
                          const chosen = q.selectedLetter === alt.letter;
                          const correct = q.correctLetter === alt.letter;
                          return (
                            <div
                              key={alt.letter}
                              className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
                                chosen && q.isCorrect === false
                                  ? "border-destructive bg-destructive/10"
                                  : correct
                                    ? "border-chart-3 bg-chart-3/10"
                                    : chosen
                                      ? "border-primary bg-primary/5"
                                      : "border-border"
                              }`}
                            >
                              <span className="font-mono-tech mt-0.5 font-semibold">{alt.letter}</span>
                              <span className="flex-1 leading-relaxed">{alt.text}</span>
                              {correct && <CheckCircle2 className="size-4 shrink-0 text-chart-3" />}
                              {chosen && q.isCorrect === false && (
                                <XCircle className="size-4 shrink-0 text-destructive" />
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span
                          className={
                            q.isCorrect === true
                              ? "text-chart-3"
                              : q.isCorrect === false
                                ? "text-destructive"
                              : "text-muted-foreground"
                          }
                        >
                          {label}
                        </span>
                        {q.selectedLetter && (
                          <span>· sua resposta: {q.selectedLetter}</span>
                        )}
                        {q.correctLetter && (
                          <span>· gabarito: {q.correctLetter}</span>
                        )}
                        {q.timeSpentSeconds !== undefined && (
                          <span>· {formatTime(q.timeSpentSeconds)}</span>
                        )}
                        {q.subjectName && <span className="chip">{q.subjectName}</span>}
                      </div>

                      {q.explanation && (
                        <p className="mt-3 rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-muted-foreground">
                          <span className="font-semibold text-foreground">Explicação: </span>
                          {q.explanation}
                        </p>
                      )}

                      {q.videoUrl && (
                        <a
                          href={q.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-flex items-center gap-2 text-sm text-chart-2 hover:underline"
                        >
                          ▶ {q.videoTitle ?? "Vídeo relacionado"}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Treinar meus erros (ERROR_REVIEW real) */}
      <section className="panel flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div>
            <p className="font-semibold">Treinar meus erros</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {result.incorrect > 0
                ? `${result.incorrect} questões erradas nesta sessão. Crie uma sessão de revisão só com elas.`
                : "Nenhum erro nesta sessão — seu caderno agradece."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          {result.incorrect > 0 && (
            <Button variant="outline" onClick={startErrorTraining} disabled={starting}>
              <Target className="size-4" />
              {starting ? "Criando…" : "Treinar meus erros"}
            </Button>
          )}
          <Button asChild className="glow-primary">
            <Link to="/app/questions/create">Nova sessão</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
