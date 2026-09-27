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
  ArrowLeft,
  Timer,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";

type SessionKind =
  | "quick"
  | "subject"
  | "errors"
  | "favorites"
  | "daily"
  | "exam";

const KINDS: { id: SessionKind; icon: typeof Zap; title: string; description: string }[] = [
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
    id: "exam",
    icon: FileText,
    title: "Fazer prova",
    description: "Edição completa com correção no final",
  },
];

export default function CreateSession() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preset = params.get("preset") as SessionKind | null;

  const [kind, setKind] = useState<SessionKind>(preset ?? "quick");
  const [count, setCount] = useState(10);
  const [subjectId, setSubjectId] = useState<string>("");
  const [examId, setExamId] = useState<string>("");
  const [difficulty, setDifficulty] = useState<string>("any");
  const [timer, setTimer] = useState<"none" | "total">("none");
  const [creating, setCreating] = useState(false);

  const areas = useQuery(api.taxonomy.treeWithCounts, {});
  const exams = useQuery(api.exams.listExams, {});
  const createSession = useMutation(api.studySessions.createSession);

  const subjects =
    areas?.flatMap((a) =>
      a.subjects.map((s) => ({ ...s, areaName: a.name })),
    ) ?? [];

  const handleCreate = async () => {
    setCreating(true);
    try {
      const feedbackImmediate = kind !== "exam";
      const sessionId = await createSession({
        type:
          kind === "daily"
            ? "daily"
            : kind === "exam"
              ? "exam"
              : "custom",
        feedbackMode: feedbackImmediate ? "immediate" : "end",
        subjectId: kind === "subject" && subjectId ? (subjectId as Id<"taxonomyNodes">) : undefined,
        examId: kind === "exam" && examId ? (examId as Id<"exams">) : undefined,
        difficulty:
          kind === "subject" && difficulty !== "any"
            ? (difficulty as "easy" | "medium" | "hard")
            : undefined,
        questionCount:
          kind === "daily"
            ? 5
            : kind === "exam"
              ? 90
              : count,
        source: kind === "errors" ? "errors" : kind === "favorites" ? "favorites" : undefined,
        shuffle: kind !== "exam" && kind !== "errors",
      });
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
  const showCount = kind === "quick" || kind === "subject";
  const showDifficulty = kind === "subject";

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
                <SelectValue placeholder="Selecione o exame" />
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
              {[5, 10, 15, 20, 30].map((n) => (
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

        {(kind === "quick" || kind === "subject") && (
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Timer className="size-3.5" />
              Cronômetro
            </Label>
            <RadioGroup
              value={timer}
              onValueChange={(v) => setTimer(v as "none" | "total")}
              className="flex gap-2"
            >
              <Label
                htmlFor="timer-none"
                className={`chip cursor-pointer ${
                  timer === "none" ? "border-primary text-primary" : ""
                }`}
              >
                <RadioGroupItem id="timer-none" value="none" className="sr-only" />
                Sem tempo
              </Label>
              <Label
                htmlFor="timer-total"
                className={`chip cursor-pointer ${
                  timer === "total" ? "border-primary text-primary" : ""
                }`}
              >
                <RadioGroupItem id="timer-total" value="total" className="sr-only" />
                Tempo total
              </Label>
            </RadioGroup>
            {timer === "total" && (
              <Input
                type="number"
                min={1}
                value={Math.max(1, Math.round(count * 1.5))}
                disabled
                className="font-mono-tech"
              />
            )}
          </div>
        )}
      </section>

      <div className="flex items-center justify-end gap-3">
        <Button variant="ghost" asChild>
          <Link to="/app/questions">Cancelar</Link>
        </Button>
        <Button onClick={handleCreate} disabled={creating} className="glow-primary">
          {creating ? "Criando…" : "Iniciar sessão"}
        </Button>
      </div>
    </div>
  );
}
