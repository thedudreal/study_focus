import { motion } from "framer-motion";
import {
  ArrowRight,
  Layers,
  Flame,
  Target,
  BarChart3,
  Zap,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router";

const FEATURES = [
  {
    icon: ListChecks,
    title: "Tudo é uma Study Session",
    description:
      "Treino livre, questões do dia, simulado ou prova inteira — um único motor de sessões com timer, navegação e correção.",
  },
  {
    icon: Flame,
    title: "Questões do dia",
    description:
      "Aquecimento diário determinístico: reforço dos seus erros recentes e novas questões fáceis para manter o ritmo.",
  },
  {
    icon: Target,
    title: "Caderno de erros real",
    description:
      "Cada erro vira registro: refaça, acompanhe quantas vezes errou e treine apenas o que precisa.",
  },
  {
    icon: BarChart3,
    title: "Desempenho honesto",
    description:
      "Estatísticas por matéria e tópico, com amostra mínima antes de concluir qualquer fraqueza.",
  },
  {
    icon: Zap,
    title: "XP e streak",
    description:
      "Pontos por dificuldade, streak por presença diária e ranking semanal — sem gamificação de cassino.",
  },
  {
    icon: Layers,
    title: "Catálogo por exame",
    description:
      "Navegue por exame, edição, ano e fase. O mesmo catálogo alimenta treino e prova.",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Escolha o que estudar",
    description:
      "Questões rápidas, um assunto específico, seus erros, favoritos ou uma prova completa do catálogo.",
  },
  {
    number: "02",
    title: "Responda com feedback sob medida",
    description:
      "No treino, correção e explicação na hora. Na prova, o gabarito sai só no final — como no exame real.",
  },
  {
    number: "03",
    title: "Acompanhe a evolução",
    description:
      "Resultado por matéria, histórico versus últimos 30 dias, e um botão para treinar exatamente o que errou.",
  },
];

export default function Landing() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="relative z-10 min-h-screen"
    >
      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded bg-primary font-mono-tech text-xs font-bold text-primary-foreground">
              SF
            </span>
            <span className="font-mono-tech text-base font-semibold">StudyFocus</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link to="/auth">Entrar</Link>
            </Button>
            <Button asChild className="glow-primary">
              <Link to="/auth">
                Criar conta
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-20 pt-20 sm:px-6 sm:pt-28">
        <div className="max-w-3xl">
          <Badge variant="outline" className="chip mb-6 border-primary/40 text-primary">
            preparação baseada em questões
          </Badge>
          <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
            Estude pelo que{" "}
            <span className="text-primary">corrige você</span>, não por conteúdo
            infinito.
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            O StudyFocus organiza sua preparação para exames em sessões de estudo:
            treine por assunto, refaça seus erros, realize simulados e acompanhe
            desempenho real — questão por questão.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" asChild className="glow-primary">
              <Link to="/auth">
                Começar agora
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/auth">Ver questões do dia</Link>
            </Button>
          </div>
          <p className="mt-4 font-mono-tech text-xs text-muted-foreground">
            Sem cartão de crédito · conta em segundos
          </p>
        </div>

        {/* Terminal-style preview */}
        <div className="panel mt-16 overflow-hidden">
          <div className="flex items-center gap-1.5 border-b border-border bg-secondary/50 px-4 py-2.5">
            <span className="size-2.5 rounded-full bg-destructive/70" />
            <span className="size-2.5 rounded-full bg-chart-4/70" />
            <span className="size-2.5 rounded-full bg-chart-3/70" />
            <span className="ml-3 font-mono-tech text-xs text-muted-foreground">
              studyfocus:/dashboard
            </span>
          </div>
          <div className="grid gap-px bg-border sm:grid-cols-4">
            {[
              { label: "streak", value: "12 dias", color: "text-chart-4" },
              { label: "xp total", value: "1.840", color: "text-primary" },
              { label: "acertos 30d", value: "78%", color: "text-chart-2" },
              { label: "erros abertos", value: "6", color: "text-destructive" },
            ].map((m) => (
              <div key={m.label} className="bg-card p-5">
                <p className="eyebrow text-muted-foreground">{m.label}</p>
                <p className={`font-mono-tech mt-2 text-2xl font-semibold ${m.color}`}>
                  {m.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="border-y border-border bg-card/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <p className="eyebrow text-primary">como funciona</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Três passos, zero atrito
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.number} className="panel p-6">
                <span className="font-mono-tech text-sm text-primary">{step.number}</span>
                <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <p className="eyebrow text-primary">recursos</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Feito para quem leva o estudo a sério
        </h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="panel p-6 transition-colors hover:border-primary/40">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <feature.icon className="size-5" />
              </div>
              <h3 className="mt-4 font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="border-t border-border bg-primary/5">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-20 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">
              Sua próxima sessão começa em segundos
            </h2>
            <p className="mt-2 max-w-xl text-muted-foreground">
              Crie sua conta, escolha um exame e comece pelo aquecimento do dia.
            </p>
          </div>
          <Button size="lg" asChild className="glow-primary shrink-0">
            <Link to="/auth">
              Criar conta grátis
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <p className="text-center font-mono-tech text-xs text-muted-foreground">
          StudyFocus · questões do dia, caderno de erros e desempenho em um só lugar
        </p>
      </footer>
    </motion.div>
  );
}
