import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Trophy, Zap, Info } from "lucide-react";

export default function Ranking() {
  const ranking = useQuery(api.daily.getWeeklyRanking, {});

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow text-muted-foreground">competição saudável</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Ranking semanal</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          XP acumulado nos últimos 7 dias. Cada acerto vale pontos — questões
          difíceis valem mais. Responder errado não gera XP: aqui quem ganha é
          quem acerta, não quem responde mais.
        </p>
      </div>

      <section className="panel overflow-hidden">
        {ranking === undefined ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            carregando ranking…
          </div>
        ) : ranking.length === 0 ? (
          <div className="p-10 text-center">
            <Trophy className="mx-auto size-10 text-muted-foreground" />
            <p className="mt-4 font-semibold">Ranking vazio esta semana</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Os primeiros acertos corretos da semana preenchem a tabela.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {ranking.map((entry, i) => (
              <div
                key={entry.userId}
                className={`flex items-center justify-between px-5 py-3.5 ${
                  i === 0 ? "bg-primary/5" : ""
                }`}
              >
                <div className="flex items-center gap-4">
                  <span
                    className={`font-mono-tech w-8 text-center text-lg font-semibold ${
                      i === 0
                        ? "text-chart-4"
                        : i === 1
                          ? "text-muted-foreground"
                          : i === 2
                            ? "text-chart-4/70"
                            : "text-muted-foreground"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium">{entry.name}</p>
                    <p className="font-mono-tech text-xs text-muted-foreground">
                      {entry.answered} respostas
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 font-mono-tech text-primary">
                  <Zap className="size-4" />
                  {entry.xp}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          Fácil vale 5 XP, médio 10 XP e difícil 15 XP por acerto. O ranking
          reinicia a cada semana para dar chance a todos.
        </p>
      </div>
    </div>
  );
}
