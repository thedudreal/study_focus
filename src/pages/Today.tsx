import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Flame, CheckCircle2, Target, ListChecks } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useState } from "react";

export default function Today() {
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const today = useQuery(api.daily.getTodayState, {});
  const stats = useQuery(api.performance.getOverview, {});
  const createSession = useMutation(api.studySessions.createSession);

  const startDaily = async () => {
    setStarting(true);
    try {
      const sessionId = await createSession({
        type: "daily",
        feedbackMode: "immediate",
        questionCount: 5,
      });
      navigate(`/app/session/${sessionId}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível iniciar o aquecimento.",
      );
      setStarting(false);
    }
  };

  const pct =
    today && today.answered > 0
      ? Math.round((today.correct / today.answered) * 100)
      : null;

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow text-muted-foreground">rotina diária</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Hoje</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          O aquecimento é gerado uma vez por dia: reforço dos seus erros recentes
          e novas questões fáceis. Mesmas questões o dia todo, para você não
          perder o fio.
        </p>
      </div>

      <section className="panel p-6 glow-primary">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Flame className="size-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Aquecimento · 5 questões</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {today?.done
                  ? "Concluído! Reforçar mais é sempre bem-vindo."
                  : "Feedback imediato, sem cronômetro. Aprox. 5 minutos."}
              </p>
            </div>
          </div>
          <Button
            onClick={startDaily}
            disabled={starting}
            size="lg"
            variant={today?.done ? "outline" : "default"}
          >
            {today?.done ? "Fazer de novo" : "Começar"}
          </Button>
        </div>
      </section>

      <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
        <div className="bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ListChecks className="size-4" />
            <p className="eyebrow">respondidas hoje</p>
          </div>
          <p className="font-mono-tech mt-2 text-3xl font-semibold">
            {today?.answered ?? 0}
          </p>
        </div>
        <div className="bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CheckCircle2 className="size-4 text-chart-3" />
            <p className="eyebrow">corretas</p>
          </div>
          <p className="font-mono-tech mt-2 text-3xl font-semibold">
            {today?.correct ?? 0}
          </p>
        </div>
        <div className="bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Target className="size-4 text-chart-2" />
            <p className="eyebrow">precisão do dia</p>
          </div>
          <p className="font-mono-tech mt-2 text-3xl font-semibold">
            {pct !== null ? `${pct}%` : "—"}
          </p>
        </div>
      </div>

      <section className="panel p-6">
        <p className="eyebrow text-muted-foreground">contexto</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Streak atual:{" "}
          <span className="font-mono-tech text-foreground">{stats?.streak ?? 0} dias</span>{" "}
          · melhor streak:{" "}
          <span className="font-mono-tech text-foreground">{stats?.bestStreak ?? 0}</span>{" "}
          · XP total:{" "}
          <span className="font-mono-tech text-foreground">{stats?.xp ?? 0}</span>
        </p>
      </section>
    </div>
  );
}
