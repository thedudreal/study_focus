import { useQuery } from "convex/react";
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
} from "lucide-react";
import { Link, useParams } from "react-router";
import type { Id } from "@/convex/_generated/dataModel";

export default function Results() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const result = useQuery(
    api.studySessions.getSessionResult,
    sessionId ? { sessionId: sessionId as Id<"studySessions"> } : "skip",
  );

  const startErrorTraining = async () => {
    try {
      // navega para criar sessão com preset de erros
      window.location.href = "/app/questions/create?preset=errors";
    } catch {
      // ignore
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
        <Button variant="outline" asChild className="mt-4">
          <Link to="/app">Voltar ao início</Link>
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
          to="/app"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Início
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          Resultado da sessão
        </h1>
      </div>

      {/* Score principal */}
      <section className="panel p-8 text-center glow-primary">
        <p className="eyebrow text-muted-foreground">precisão</p>
        <p className="font-mono-tech mt-2 text-6xl font-semibold text-primary">
          {result.percent}%
        </p>
        <p className="mt-2 text-muted-foreground">
          {result.correct} acertos em {result.answered} respondidas
        </p>

        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
          <div className="bg-card p-4">
            <CheckCircle2 className="mx-auto size-5 text-chart-3" />
            <p className="font-mono-tech mt-1.5 text-xl font-semibold">
              {result.correct}
            </p>
            <p className="text-xs text-muted-foreground">corretas</p>
          </div>
          <div className="bg-card p-4">
            <XCircle className="mx-auto size-5 text-destructive" />
            <p className="font-mono-tech mt-1.5 text-xl font-semibold">
              {result.wrong}
            </p>
            <p className="text-xs text-muted-foreground">incorretas</p>
          </div>
          <div className="bg-card p-4">
            <CircleDashed className="mx-auto size-5 text-muted-foreground" />
            <p className="font-mono-tech mt-1.5 text-xl font-semibold">
              {result.blank}
            </p>
            <p className="text-xs text-muted-foreground">em branco</p>
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
                      className={`h-full rounded-full ${
                        pct >= 60 ? "bg-chart-3" : "bg-destructive"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Próximos passos */}
      <section className="panel flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div>
            <p className="font-semibold">Treinar meus erros</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {result.wrong > 0
                ? `${result.wrong} questões erradas nesta sessão entraram no seu caderno de erros.`
                : "Nenhum erro nesta sessão. Seu caderno de erros continua como estava."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={startErrorTraining}>
            <Target className="size-4" />
            Treinar erros
          </Button>
          <Button asChild className="glow-primary">
            <Link to="/app/questions/create">
              Nova sessão
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
