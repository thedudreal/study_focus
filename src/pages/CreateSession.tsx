import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Zap,
  BookOpen,
  AlertTriangle,
  Star,
  FileText,
  Flame,
  Timer,
  ArrowLeft,
  Layers,
  Info,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";

type SessionKind =
  | "quick"
  | "subject"
  | "errors"
  | "favorites"
  | "daily"
  | "simulation"
  | "exam";

const KINDS: {
  id: SessionKind;
  icon: typeof Zap;
  title: string;
  description: string;
}[] = [
  {
    id: "quick",
    icon: Zap,
    title: "Questões rápidas",
    description: "Mix aleatório do catálogo publicado",
  },
  {
    id: "daily",
    icon: Flame,
    title: "Questões do dia",
    description: "Aquecimento com seus erros recentes",
  },
  {
    id: "subject",
    icon: BookOpen,
    title: "Estudar assunto",
    description: "Foque em uma matéria específica",
  },
  {
    id: "errors",
    icon: AlertTriangle,
    title: "Treinar erros",
    description: "Refaça as questões do seu caderno de erros",
  },
  {
    id: "favorites",
    icon: Star,
    title: "Revisar favoritos",
    description: "Sessão apenas com as suas questões salvas",
  },
  {
    id: "simulation",
    icon: Timer,
    title: "Simulado",
    description: "Com tempo total, correção só no final",
  },
  {
    id: "exam",
    icon: FileText,
    title: "Fazer prova",
    description: "Edição completa, ordem original",
  },
];

const COUNT_OPTIONS = [5, 10, 15, 20, 30];

export default function CreateSession() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preset = params.get("preset") as SessionKind | null;

  const [kind, setKind] = useState<SessionKind>(preset ?? "quick");
  const [count, setCount] = useState(10);
  const [subjectId, setSubjectId] = useState<string>("");
  const [examId, setExamId] = useState<string>("");
  const [difficulty, setDifficulty] = useState<string>("any");
  const [timerMode, setTimerMode] = useState<"none" | "total">("none");
  const [minutes, setMinutes] = useState(30);
  const [orderMode, setOrderMode] = useState<"random" | "original">("random");
  const [creating, setCreating] = useState(false);

  const areas = useQuery(api.taxonomy.treeWithCounts, {});
  const exams = useQuery(api.exams.listExams, {});
  const createSession = useMutation(api.studySessions.createSession);

  const subjects = useMemo(
    () => areas?.flatMap((a) => a.subjects.map((s) => ({ ...s, areaName: a.name }))) ?? [],
    [areas],
  );

  // Configuração enviada ao motor (um único endpoint para todos os tipos)
  const config = useMemo(() => {
    const base = {
      questionCount: count,
      subjectId:
        kind === "subject" && subjectId
          ? (subjectId as Id<"taxonomyNodes">)
          : undefined,
      examId:
        kind === "exam" && examId ? (examId as Id<"exams">) : undefined,
      difficulty:
        kind === "subject" && difficulty !== "any"
          ? (difficulty as "easy" | "medium" | "hard")
          : undefined,
    };
    if (kind === "daily") {
      return { type: "daily" as const, questionCount: 5 };
    }
    if (kind === "errors") {
      return { type: "error_review" as const, questionCount: count };
    }
    if (kind === "favorites") {
      return { type: "favorites" as const, questionCount: count };
    }
    if (kind === "exam") {
      return {
        type: "exam" as const,
        examId: base.examId,
        feedbackMode: "end" as const,
        orderMode: "original" as const,
      };
    }
    if (kind === "simulation") {
      return {
        type: "simulation" as const,
        questionCount: count,
        feedbackMode: "end" as const,
        timerMode: "total" as const,
        totalTimeSeconds: Math.max(1, minutes) * 60,
        orderMode: "random" as const,
        allowBackNavigation: true,
        allowPause: false,
      };
    }
    // quick / subject: estudo com feedback imediato
    return {
      type: "custom" as const,
      questionCount: count,
      feedbackMode: "immediate" as const,
      timerMode: timerMode,
      totalTimeSeconds:
        timerMode === "total" ? Math.max(1, minutes) * 60 : undefined,
      orderMode: orderMode,
      allowBackNavigation: true,
      allowPause: true,
    };
  }, [kind, count, subjectId, examId, difficulty, timerMode, minutes, orderMode]);

  // Filtros de prévia calculados direto do estado (fora da união de configs)
  const previewFilters = useMemo(
    () => ({
      subjectId:
        kind === "subject" && subjectId
          ? (subjectId as Id<"taxonomyNodes">)
          : undefined,
      examId:
        kind === "exam" && examId ? (examId as Id<"exams">) : undefined,
      difficulty:
        kind === "subject" && difficulty !== "any"
          ? (difficulty as "easy" | "medium" | "hard")
          : undefined,
    }),
    [kind, subjectId, examId, difficulty],
  );

  // Prévia de disponibilidade (garantia de quantidade antes de criar)
  const preview = useQuery(
    api.studySessions.previewSelection,
    kind === "quick" || kind === "subject" || kind === "exam"
      ? { ...previewFilters, requested: count }
      : "skip",
  );
  const available = preview?.available ?? null;
  const effectiveCount = available !== null ? Math.min(count, available) : count;

  const handleCreate = async () => {
    if (kind === "exam" && !examId) {
      toast.error("Escolha a prova que deseja fazer.");
      return;
    }
    if (kind === "subject" && !subjectId) {
      toast.error("Escolha a matéria que deseja estudar.");
      return;
    }
    setCreating(true);
    try {
      const sessionId = await createSession(config);
      navigate(`/app/session/${sessionId}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível criar a sessão.",
      );
      setCreating(false);
    }
  };

  const showSubject = kind === "subject";
  const showExam = kind === "exam";
  const showCount = kind === "quick" || kind === "subject" || kind === "simulation" ||
    kind === "errors" || kind === "favorites";
  const showDifficulty = kind === "subject";
  const showTimer = kind === "quick" || kind === "subject";
  const showOrder = kind === "quick" || kind === "subject";

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <Link
          to="/app/questions"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Questões
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Criar sessão</h1>
        <p className="mt-2 text-muted-foreground">
          Escolha o tipo e ajuste apenas o que importa. O resto fica com o motor
          de sessões.
        </p>
      </div>

      {/* Tipo de sessão */}
      <div className="grid gap-3 sm:grid-cols-2">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => setKind(k.id)}
            className={`panel flex items-start gap-3 p-4 text-left transition-colors ${
              kind === k.id ? "border-primary glow-primary" : "hover:border-primary/40"
            }`}
          >
            <div
              className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                kind === k.id ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
              }`}
            >
              <k.icon className="size-4" />
            </div>
            <div>
              <p className="font-semibold">{k.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{k.description}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Configurações relevantes */}
      <section className="panel space-y-5 p-6">
        {showSubject && (
          <div className="space-y-2">
            <Label>Matéria</Label>
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todas as matérias" />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s._id} value={s._id}>
                    {s.name} ({s.questionCount} questões)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {showExam && (
          <div className="space-y-2">
            <Label>Prova</Label>
            <Select value={examId} onValueChange={setExamId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione a prova e a edição" />
              </SelectTrigger>
              <SelectContent>
                {exams?.map((e) =>
                  e.editions.map((ed) => (
                    <SelectItem key={ed._id} value={ed._id}>
                      {e.name} · {ed.year}
                      {ed.phase ? ` · ${ed.phase}` : ""}
                    </SelectItem>
                  )),
                )}
              </SelectContent>
            </Select>
            <p className="font-mono-tech text-xs text-muted-foreground">
              a prova usa todas as questões da edição, na ordem original
            </p>
          </div>
        )}

        {showCount && (
          <div className="space-y-2">
            <Label>Quantidade de questões</Label>
            <RadioGroup
              value={String(count)}
              onValueChange={(v) => setCount(Number(v))}
              className="flex flex-wrap gap-2"
            >
              {COUNT_OPTIONS.map((n) => (
                <Label
                  key={n}
                  htmlFor={`count-${n}`}
                  className={`chip cursor-pointer justify-center ${
                    count === n ? "border-primary text-primary" : ""
                  }`}
                >
                  <RadioGroupItem id={`count-${n}`} value={String(n)} className="sr-only" />
                  {n}
                </Label>
              ))}
            </RadioGroup>
          </div>
        )}

        {showDifficulty && (
          <div className="space-y-2">
            <Label>Dificuldade</Label>
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Qualquer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Qualquer</SelectItem>
                <SelectItem value="easy">Fácil</SelectItem>
                <SelectItem value="medium">Médio</SelectItem>
                <SelectItem value="hard">Difícil</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {showTimer && (
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Timer className="size-3.5" />
              Cronômetro
            </Label>
            <RadioGroup
              value={timerMode}
              onValueChange={(v) => setTimerMode(v as "none" | "total")}
              className="flex gap-2"
            >
              <Label
                htmlFor="timer-none"
                className={`chip cursor-pointer ${
                  timerMode === "none" ? "border-primary text-primary" : ""
                }`}
              >
                <RadioGroupItem id="timer-none" value="none" className="sr-only" />
                Sem tempo
              </Label>
              <Label
                htmlFor="timer-total"
                className={`chip cursor-pointer ${
                  timerMode === "total" ? "border-primary text-primary" : ""
                }`}
              >
                <RadioGroupItem id="timer-total" value="total" className="sr-only" />
                Tempo total
              </Label>
            </RadioGroup>
            {timerMode === "total" && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={300}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value) || 30)}
                  className="font-mono-tech w-28"
                  aria-label="Minutos de duração"
                />
                <span className="text-sm text-muted-foreground">minutos</span>
              </div>
            )}
          </div>
        )}

        {showOrder && (
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Layers className="size-3.5" />
              Ordem das questões
            </Label>
            <RadioGroup
              value={orderMode}
              onValueChange={(v) => setOrderMode(v as "random" | "original")}
              className="flex gap-2"
            >
              <Label
                htmlFor="order-random"
                className={`chip cursor-pointer ${
                  orderMode === "random" ? "border-primary text-primary" : ""
                }`}
              >
                <RadioGroupItem id="order-random" value="random" className="sr-only" />
                Aleatória
              </Label>
              <Label
                htmlFor="order-original"
                className={`chip cursor-pointer ${
                  orderMode === "original" ? "border-primary text-primary" : ""
                }`}
              >
                <RadioGroupItem id="order-original" value="original" className="sr-only" />
                Do catálogo
              </Label>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              A ordem é definida agora e permanece a mesma até o fim da sessão —
              mesmo se você sair e voltar.
            </p>
          </div>
        )}

        {/* Garantia de quantidade */}
        {(kind === "quick" || kind === "subject" || kind === "exam") &&
          available !== null && (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-secondary/40 p-3 text-sm">
              <Info className="mt-0.5 size-4 shrink-0 text-chart-2" />
              {available === 0 ? (
                <p className="text-muted-foreground">
                  Não há questões publicadas para esse filtro. Altere os filtros
                  para conseguir montar a sessão.
                </p>
              ) : available < count ? (
                <p className="text-muted-foreground">
                  Encontramos apenas{" "}
                  <span className="font-mono-tech text-foreground">{available}</span>{" "}
                  questões disponíveis para esse filtro. A sessão será criada com
                  elas.
                </p>
              ) : (
                <p className="text-muted-foreground">
                  <span className="font-mono-tech text-foreground">{available}</span>{" "}
                  questões disponíveis para esse filtro.
                </p>
              )}
            </div>
          )}
      </section>

      <div className="flex items-center justify-end gap-3">
        <Button variant="ghost" asChild>
          <Link to="/app/questions">Cancelar</Link>
        </Button>
        <Button
          onClick={handleCreate}
          disabled={
            creating ||
            (available !== null &&
              available === 0 &&
              (kind === "quick" || kind === "subject" || kind === "exam"))
          }
          className="glow-primary"
        >
          {creating
            ? "Criando…"
            : available !== null && available < count
              ? `Começar com ${effectiveCount}`
              : "Iniciar sessão"}
        </Button>
      </div>
    </div>
  );
}
