import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Button } from "@/components/ui/button";
import {
  Flame,
  Zap,
  Play,
  ArrowRight,
  Plus,
  AlertTriangle,
  Trophy,
  Target,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { useState } from "react";
import { useMutation } from "convex/react";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);

  const today = useQuery(api.daily.getTodayState, {});
  const stats = useQuery(api.performance.getOverview, {});
  const subjects = useQuery(api.performance.getSubjectBreakdown, {});
  const ranking = useQuery(api.daily.getWeeklyRanking, {});
  const activeSession = useQuery(api.studySessions.getActiveSession, {});
  const errorCount = useQuery(api.errorBook.countErrors, {});
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
        err instanceof Error ? err.message : "Não foi possível iniciar o treino do dia.",
      );
      setStarting(false);
    }
  };

  const firstName = user?.name?.split(" ")[0] ?? "estudante";
  const attentionSubject = subjects?.find((s) => s.attention);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow text-muted-foreground">painel</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Olá, {firstName}
          </h1>
        </div>
        <Button asChild className="glow-primary">
          <Link to="/app/questions/create">
            <Plus className="size-4" />
            Criar sessão
          </Link>
        </Button>
      </div>

      {/* Sessão ativa */}
      {activeSession && activeSession.status === "active" && (
        <div className="panel flex flex-col gap-4 border-primary/40 p-5 sm:flex-row sm:items-center sm:justify-between glow-primary">
          <div>
            <p className="eyebrow text-primary">sessão em andamento</p>
            <p className="mt-1 font-semibold">
              {activeSession.questionCount} questões ·{" "}
              {(activeSession.answers?.length ?? 0)} respondidas
            </p>
          </div>
          <Button asChild className="shrink-0">
            <Link to={`/app/session/${activeSession._id}`}>
              <Play className="size-4" />
              Continuar
            </Link>
          </Button>
        </div>
      )}

      {/* Métricas principais */}
      <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Flame className="size-4 text-chart-4" />
            <p className="eyebrow">streak</p>
          </div>
          <p className="font-mono-tech mt-2 text-3xl font-semibold">
            {stats?.streak ?? 0}
            <span className="ml-1 text-sm text-muted-foreground">
              {stats?.streak === 1 ? "dia" : "dias"}
            </span>
          </p>
        </div>
        <div className="bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Zap className="size-4 text-primary" />
            <p className="eyebrow">xp total</p>
          </div>
          <p className="font-mono-tech mt-2 text-3xl font-semibold">
            {stats?.xp ?? 0}
          </p>
        </div>
        <div className="bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Target className="size-4 text-chart-2" />
            <p className="eyebrow">acertos (30d)</p>
          </div>
          <p className="font-mono-tech mt-2 text-3xl font-semibold">
            {stats?.recent.percent !== null && stats?.recent.percent !== undefined
              ? `${stats.recent.percent}%`
              : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {stats?.recent.percent == null
              ? "aguardando 5+ respostas"
              : `${stats.recent.total} respostas recentes`}
          </p>
        </div>
        <div className="bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertTriangle className="size-4 text-destructive" />
            <p className="eyebrow">erros abertos</p>
          </div>
          <p className="font-mono-tech mt-2 text-3xl font-semibold">
            {errorCount ?? 0}
          </p>
        </div>
      </div>

      {/* Questões do dia */}
      <section className="panel p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="eyebrow text-chart-4">questões do dia</p>
            <h2 className="mt-1 text-xl font-semibold">Aquecimento de hoje</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {today?.done
                ? `Você já respondeu ${today.answered} questões hoje (${today.correct} certas). Pode reforçar mais!`
                : "5 questões rápidas: revisão dos seus erros recentes e novas fáceis."}
            </p>
          </div>
          <Button
            onClick={startDaily}
            disabled={starting}
            className="shrink-0"
            variant={today?.done ? "outline" : "default"}
          >
            <Flame className="size-4" />
            {today?.done ? "Reforçar o dia" : "Começar aquecimento"}
          </Button>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Ponto de atenção */}
        <section className="panel p-6">
          <p className="eyebrow text-destructive">ponto de atenção</p>
          {attentionSubject ? (
            <div className="mt-3">
              <h3 className="text-lg font-semibold">
                {attentionSubject.name}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {attentionSubject.percent}% de acertos em {attentionSubject.total}{" "}
                tentativas. Vale revisar os fundamentos e treinar os erros.
              </p>
              <Button variant="outline" size="sm" asChild className="mt-4">
                <Link to="/app/questions/create?preset=errors">
                  Treinar meus erros
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {stats?.hasEnoughData
                ? "Nenhuma matéria com amostra suficiente abaixo de 60% de acertos. Continue assim."
                : "Responda pelo menos 5 questões por matéria para gerar alertas confiáveis — nada de conclusões apressadas."}
            </p>
          )}

          {/* Desempenho por matéria (resumo) */}
          {subjects && subjects.length > 0 && (
            <div className="mt-6 space-y-3 border-t border-border pt-4">
              {subjects.slice(0, 4).map((s) => (
                <div key={s.name}>
                  <div className="flex items-center justify-between text-sm">
                    <span>{s.name}</span>
                    <span className="font-mono-tech text-muted-foreground">
                      {s.correct}/{s.total}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={`h-full rounded-full ${
                        s.attention ? "bg-destructive" : "bg-chart-3"
                      }`}
                      style={{ width: `${s.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Ranking */}
        <section className="panel p-6">
          <div className="flex items-center justify-between">
            <p className="eyebrow text-primary">ranking semanal</p>
            <Link
              to="/app/ranking"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ver tudo
            </Link>
          </div>
          {ranking && ranking.length > 0 ? (
            <div className="mt-4 space-y-2">
              {ranking.slice(0, 5).map((entry, i) => (
                <div
                  key={entry.userId}
                  className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono-tech w-5 text-sm text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="truncate text-sm">{entry.name}</span>
                  </div>
                  <span className="font-mono-tech text-sm text-primary">
                    {entry.xp} xp
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              O ranking semanal enche com as primeiras respostas corretas da
              semana. Seja o primeiro!
            </p>
          )}
          <div className="mt-4 flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
            <Trophy className="size-3.5 text-chart-4" />
            XP conta apenas acertos, com bônus por dificuldade.
          </div>
        </section>
      </div>
    </div>
  );
}
