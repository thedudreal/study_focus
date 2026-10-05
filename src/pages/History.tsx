import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Play,
  ArrowLeft,
  History as HistoryIcon,
  CheckCircle2,
  Pause,
  CircleDashed,
} from "lucide-react";
import { Link, useNavigate } from "react-router";

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  created: { text: "criada", className: "text-muted-foreground" },
  in_progress: { text: "em andamento", className: "text-primary" },
  paused: { text: "pausada", className: "text-chart-4" },
  completed: { text: "concluída", className: "text-chart-3" },
  abandoned: { text: "abandonada", className: "text-muted-foreground" },
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Hoje";
  if (sameDay(d, yesterday)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function formatDuration(s: number | undefined): string {
  if (s === undefined) return "—";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}min`;
}

export default function History() {
  const navigate = useNavigate();
  const sessions = useQuery(api.studySessions.listHistory, { limit: 50 });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <Link
          to="/app"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Início
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Meu histórico</h1>
        <p className="mt-2 text-muted-foreground">
          Todas as suas sessões de estudo. Retome de onde parou.
        </p>
      </div>

      {sessions === undefined ? (
        <div className="panel p-10 text-center font-mono-tech text-sm text-muted-foreground">
          carregando histórico…
        </div>
      ) : sessions.length === 0 ? (
        <div className="panel p-10 text-center">
          <HistoryIcon className="mx-auto size-10 text-muted-foreground" />
          <p className="mt-4 font-semibold">Nenhuma sessão ainda</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crie sua primeira sessão de estudo para começar.
          </p>
          <Button asChild className="mt-4 glow-primary">
            <Link to="/app/questions/create">Criar sessão</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const status = STATUS_LABEL[s.status] ?? STATUS_LABEL.abandoned;
            const resumable = s.status === "in_progress" || s.status === "paused" || s.status === "created";
            const finished = s.status === "completed";
            return (
              <div
                key={s._id}
                className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="chip border-primary/40 text-primary">{s.typeLabel}</span>
                    <span>{formatDate(s.startedAt)}</span>
                    <span>·</span>
                    <span className={status.className}>{status.text}</span>
                  </div>
                  <p className="mt-1.5 font-semibold">{s.title}</p>
                  <p className="font-mono-tech mt-1 text-xs text-muted-foreground">
                    {s.questionCount} questões · {s.answeredCount} respondidas ·{" "}
                    {s.correctCount} acertos ·{" "}
                    {finished || s.status === "abandoned" ? `${s.percent}%` : "—"} ·{" "}
                    {formatDuration(s.elapsedSeconds)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {resumable && (
                    <Button onClick={() => navigate(`/app/session/${s._id}`)} className="glow-primary">
                      {s.status === "paused" ? (
                        <>
                          <Pause className="size-4" />
                          Retomar
                        </>
                      ) : (
                        <>
                          <Play className="size-4" />
                          Continuar
                        </>
                      )}
                    </Button>
                  )}
                  {finished && (
                    <Button variant="outline" onClick={() => navigate(`/app/results/${s._id}`)}>
                      <CheckCircle2 className="size-4" />
                      Resultado
                    </Button>
                  )}
                  {s.status === "abandoned" && s.answeredCount > 0 && (
                    <Button variant="ghost" onClick={() => navigate(`/app/results/${s._id}`)}>
                      <CircleDashed className="size-4" />
                      Ver respostas
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
