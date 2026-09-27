import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { LogOut, User, Flame, Zap, Target, Info } from "lucide-react";
import { useNavigate } from "react-router";

export default function Profile() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const stats = useQuery(api.performance.getOverview, {});
  const subjects = useQuery(api.performance.getSubjectBreakdown, {});

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow text-muted-foreground">conta</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Perfil</h1>
      </div>

      {/* Dados da conta */}
      <section className="panel flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="size-7" />
          </div>
          <div>
            <p className="text-lg font-semibold">
              {user?.name ?? "Estudante"}
            </p>
            <p className="font-mono-tech text-sm text-muted-foreground">
              {user?.email ?? "sessão anônima"}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={handleSignOut} className="shrink-0">
          <LogOut className="size-4" />
          Sair da conta
        </Button>
      </section>

      {/* Métricas gerais */}
      <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
        <div className="bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Flame className="size-4 text-chart-4" />
            <p className="eyebrow">streak atual</p>
          </div>
          <p className="font-mono-tech mt-2 text-3xl font-semibold">
            {stats?.streak ?? 0}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            recorde: {stats?.bestStreak ?? 0} dias
          </p>
        </div>
        <div className="bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Zap className="size-4 text-primary" />
            <p className="eyebrow">xp acumulado</p>
          </div>
          <p className="font-mono-tech mt-2 text-3xl font-semibold">
            {stats?.xp ?? 0}
          </p>
        </div>
        <div className="bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Target className="size-4 text-chart-2" />
            <p className="eyebrow">acertos (histórico)</p>
          </div>
          <p className="font-mono-tech mt-2 text-3xl font-semibold">
            {stats?.allTime.percent !== null && stats?.allTime.percent !== undefined
              ? `${stats.allTime.percent}%`
              : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {stats?.allTime.total ?? 0} tentativas no total
          </p>
        </div>
      </div>

      {/* Desempenho por matéria */}
      <section className="panel p-6">
        <p className="eyebrow text-muted-foreground">desempenho por matéria</p>
        {subjects === undefined ? (
          <p className="mt-3 text-sm text-muted-foreground">carregando…</p>
        ) : subjects.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Você ainda não respondeu questões. Comece pelo aquecimento do dia!
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {subjects.map((s) => (
              <div key={s.name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{s.name}</span>
                  <span className="font-mono-tech text-muted-foreground">
                    {s.correct}/{s.total} · {s.percent}%
                    {!s.enoughData && (
                      <span className="ml-2 text-xs">(amostra pequena)</span>
                    )}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full rounded-full ${
                      s.attention
                        ? "bg-destructive"
                        : s.enoughData
                          ? "bg-chart-3"
                          : "bg-muted-foreground/50"
                    }`}
                    style={{ width: `${s.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-6 flex items-start gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <p>
            Alertas de fraqueza só aparecem com 5+ tentativas na matéria —
            histórico completo, não apenas os últimos dias.
          </p>
        </div>
      </section>
    </div>
  );
}
