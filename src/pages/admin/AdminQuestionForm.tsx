import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  CheckCircle2,
  Send,
  Archive,
  Loader2,
  Trash2,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { useState } from "react";

interface AltForm {
  letter: string;
  text: string;
}

const EMPTY_ALTS: AltForm[] = [
  { letter: "A", text: "" },
  { letter: "B", text: "" },
  { letter: "C", text: "" },
  { letter: "D", text: "" },
  { letter: "E", text: "" },
];

const STATUS_STYLE: Record<string, string> = {
  draft: "text-muted-foreground",
  review: "text-chart-4",
  published: "text-chart-3",
  archived: "text-destructive",
};

export default function AdminQuestionForm() {
  const { questionId } = useParams<{ questionId?: string }>();

  const existing = useQuery(
    api.adminQuestions.getQuestionForReview,
    questionId ? { questionId: questionId as Id<"questions"> } : "skip",
  );
  const areas = useQuery(api.taxonomy.treeWithCounts, {});
  const exams = useQuery(api.exams.listExams, {});

  if (questionId && existing === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        carregando questão…
      </div>
    );
  }

  if (questionId && existing === null) {
    return (
      <div className="panel p-10 text-center">
        <p className="font-semibold">Questão não encontrada</p>
        <Button variant="outline" asChild className="mt-4">
          <Link to="/app/admin">Voltar ao painel</Link>
        </Button>
      </div>
    );
  }

  // Remonta o formulário por questão: o estado inicial vem dos dados já
  // carregados (sem useEffect para sincronizar).
  return (
    <QuestionFormInner
      key={questionId ?? "new"}
      questionId={questionId}
      initial={
        existing
          ? {
              statement: existing.statement,
              explanation: existing.explanation ?? "",
              alts:
                existing.alternatives.length > 0
                  ? existing.alternatives
                  : EMPTY_ALTS,
              correct: existing.correctLetter,
              subjectId: existing.subjectId,
              topicId: existing.topicId ?? "",
              examId: existing.examId ?? "",
              editionId: existing.editionId ?? "",
              difficulty: existing.difficulty,
              imageUrl: existing.imageUrl ?? "",
              status: existing.status,
              batchFilename: existing.batchFilename,
            }
          : null
      }
      areas={areas ?? []}
      exams={exams ?? []}
    />
  );
}

interface InitialData {
  statement: string;
  explanation: string;
  alts: AltForm[];
  correct: string;
  subjectId: string;
  topicId: string;
  examId: string;
  editionId: string;
  difficulty: string;
  imageUrl: string;
  status: string;
  batchFilename?: string;
}

function QuestionFormInner({
  questionId,
  initial,
  areas,
  exams,
}: {
  questionId?: string;
  initial: InitialData | null;
  areas: NonNullable<ReturnType<typeof useQuery<typeof api.taxonomy.treeWithCounts>>>;
  exams: NonNullable<ReturnType<typeof useQuery<typeof api.exams.listExams>>>;
}) {
  const navigate = useNavigate();
  const isEdit = Boolean(questionId);

  const createMutation = useMutation(api.adminQuestions.createQuestion);
  const updateMutation = useMutation(api.adminQuestions.updateQuestion);
  const setStatusMutation = useMutation(api.adminQuestions.setStatus);
  const deleteMutation = useMutation(api.adminQuestions.deleteQuestion);

  const [statement, setStatement] = useState(initial?.statement ?? "");
  const [explanation, setExplanation] = useState(initial?.explanation ?? "");
  const [alts, setAlts] = useState<AltForm[]>(initial?.alts ?? EMPTY_ALTS);
  const [correct, setCorrect] = useState<string>(initial?.correct ?? "A");
  const [subjectId, setSubjectId] = useState(initial?.subjectId ?? "");
  const [topicId, setTopicId] = useState(initial?.topicId ?? "");
  const [examId, setExamId] = useState(initial?.examId ?? "");
  const [editionId, setEditionId] = useState(initial?.editionId ?? "");
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? "medium");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const existingStatus = initial?.status;

  const subjects =
    areas?.flatMap((a) => a.subjects.map((s) => ({ id: s._id, name: s.name }))) ?? [];
  const selectedExam = exams?.find((e) => e._id === examId);

  const payload = () => ({
    statement: statement.trim(),
    explanation: explanation.trim() || undefined,
    alternatives: alts
      .filter((a) => a.text.trim() !== "")
      .map((a) => ({ letter: a.letter, text: a.text.trim() })),
    correctLetter: correct,
    subjectId: subjectId as Id<"taxonomyNodes">,
    topicId: topicId ? (topicId as Id<"taxonomyNodes">) : undefined,
    examId: examId ? (examId as Id<"exams">) : undefined,
    editionId: editionId ? (editionId as Id<"examEditions">) : undefined,
    difficulty: difficulty as "easy" | "medium" | "hard",
    imageUrl: imageUrl.trim() || undefined,
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isEdit) {
        await updateMutation({ questionId: questionId as Id<"questions">, ...payload() });
        toast.success("Questão atualizada.");
      } else {
        const newId = await createMutation({ ...payload(), status: "draft" });
        toast.success("Questão criada como draft.");
        navigate(`/app/admin/questions/${newId}`, { replace: true });
        return;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (next: "review" | "published" | "draft" | "archived") => {
    if (!questionId) return;
    try {
      await setStatusMutation({ questionId: questionId as Id<"questions">, status: next });
      toast.success(`Status: ${next}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na transição.");
    }
  };

  const handleDelete = async () => {
    if (!questionId) return;
    try {
      await deleteMutation({ questionId: questionId as Id<"questions"> });
      toast.success("Questão excluída.");
      navigate("/app/admin");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir.");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          to="/app/admin"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Painel admin
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {isEdit ? "Revisar / editar questão" : "Nova questão"}
          </h1>
          {isEdit && existingStatus && (
            <span className={`chip ${STATUS_STYLE[existingStatus] ?? ""}`}>
              {existingStatus}
            </span>
          )}
        </div>
        {isEdit && initial?.batchFilename && (
          <p className="mt-1 font-mono-tech text-xs text-muted-foreground">
            importada de: {initial.batchFilename}
          </p>
        )}
      </div>

      {/* Enunciado */}
      <section className="panel space-y-4 p-6">
        <div className="space-y-2">
          <Label htmlFor="statement">Enunciado</Label>
          <Textarea
            id="statement"
            rows={4}
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            placeholder="Texto da questão…"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="imageUrl">URL de imagem (opcional)</Label>
          <Input
            id="imageUrl"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>
      </section>

      {/* Alternativas */}
      <section className="panel space-y-3 p-6">
        <div className="flex items-center justify-between">
          <Label>Alternativas · marque a correta</Label>
          <span className="font-mono-tech text-xs text-muted-foreground">
            {alts.filter((a) => a.text.trim()).length} preenchidas
          </span>
        </div>
        {alts.map((alt, i) => (
          <div key={alt.letter} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCorrect(alt.letter)}
              title="Marcar como correta"
              className={`flex size-8 shrink-0 items-center justify-center rounded-md border font-mono-tech text-sm transition-colors ${
                correct === alt.letter
                  ? "border-chart-3 bg-chart-3/15 text-chart-3"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {correct === alt.letter ? (
                <CheckCircle2 className="size-4" />
              ) : (
                alt.letter
              )}
            </button>
            <Input
              value={alt.text}
              onChange={(e) =>
                setAlts((prev) =>
                  prev.map((a, j) =>
                    j === i ? { ...a, text: e.target.value } : a,
                  ),
                )
              }
              placeholder={`Texto da alternativa ${alt.letter}`}
            />
          </div>
        ))}
      </section>

      {/* Classificação */}
      <section className="panel grid gap-4 p-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Matéria</Label>
          <Select value={subjectId} onValueChange={(v) => { setSubjectId(v); setTopicId(""); }}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Assunto (tópico)</Label>
          <Select value={topicId} onValueChange={setTopicId} disabled={!topicId && !subjectId}>
            <SelectTrigger>
              <SelectValue placeholder="Opcional" />
            </SelectTrigger>
            <SelectContent>
              {areas
                ?.find((a) => a.subjects.some((s) => s._id === subjectId))
                ?.subjects.find((s) => s._id === subjectId) && null}
            </SelectContent>
          </Select>
          <p className="font-mono-tech text-[11px] text-muted-foreground">
            tópicos por matéria chegam com a expansão da taxonomia
          </p>
        </div>
        <div className="space-y-2">
          <Label>Prova</Label>
          <Select value={examId} onValueChange={(v) => { setExamId(v); setEditionId(""); }}>
            <SelectTrigger>
              <SelectValue placeholder="Opcional" />
            </SelectTrigger>
            <SelectContent>
              {exams?.map((e) => (
                <SelectItem key={e._id} value={e._id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Edição (ano · fase)</Label>
          <Select value={editionId} onValueChange={setEditionId} disabled={!examId}>
            <SelectTrigger>
              <SelectValue placeholder="Opcional" />
            </SelectTrigger>
            <SelectContent>
              {selectedExam?.editions.map((ed) => (
                <SelectItem key={ed._id} value={ed._id}>
                  {ed.year}
                  {ed.phase ? ` · ${ed.phase}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Dificuldade</Label>
          <Select value={difficulty} onValueChange={setDifficulty}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">Fácil</SelectItem>
              <SelectItem value="medium">Médio</SelectItem>
              <SelectItem value="hard">Difícil</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* Explicação */}
      <section className="panel space-y-2 p-6">
        <Label htmlFor="explanation">Explicação / resolução (opcional)</Label>
        <Textarea
          id="explanation"
          rows={3}
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          placeholder="Aparece ao aluno após responder."
        />
      </section>

      {/* Ações */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {isEdit && (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="size-4" />
              Excluir
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isEdit && existingStatus === "draft" && (
            <Button variant="outline" onClick={() => handleStatus("review")}>
              <Send className="size-4" />
              Enviar para revisão
            </Button>
          )}
          {isEdit && existingStatus === "review" && (
            <>
              <Button variant="outline" onClick={() => handleStatus("draft")}>
                Voltar p/ draft
              </Button>
              <Button onClick={() => handleStatus("published")} className="glow-primary">
                <Archive className="size-4" />
                Publicar
              </Button>
            </>
          )}
          {isEdit && existingStatus === "published" && (
            <Button variant="outline" onClick={() => handleStatus("archived")}>
              Arquivar
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving || !subjectId}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {isEdit ? "Salvar alterações" : "Criar questão"}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir questão?</AlertDialogTitle>
            <AlertDialogDescription>
              A questão e suas alternativas serão removidas definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
