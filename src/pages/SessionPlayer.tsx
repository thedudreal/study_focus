import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
  Bookmark,
  CheckCircle2,
  XCircle,
  Flag,
  Timer,
  Youtube,
  Star,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: "fácil",
  medium: "médio",
  hard: "difícil",
};

export default function SessionPlayer() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const state = useQuery(
    api.studySessions.getSessionState,
    sessionId ? { sessionId: sessionId as Id<"studySessions"> } : "skip",
  );
  const answerMutation = useMutation(api.studySessions.answerQuestion);
  const finishMutation = useMutation(api.studySessions.finishSession);
  const toggleFavorite = useMutation(api.favorites.toggleFavorite);
  const isFav = useQuery(
    api.favorites.isFavorite,
    state?.question ? { questionId: state.question._id } : "skip",
  );

  const session = state?.session;
  const question = state?.question;
  const isExamMode = session?.feedbackMode === "end";

  // Marcação para revisão (modo prova)
  const [flags, setFlags] = useState<Record<number, boolean>>({});

  // Cronômetro da sessão
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!session) return;
    const tick = () => setElapsed(Math.floor((Date.now() - session.startedAt) / 1000));
    tick();
    const int = setInterval(tick, 1000);
    return () => clearInterval(int);
  }, [session?.startedAt]);

  const answeredCount = useMemo(
    () => (session?.answers ?? []).filter((a) => a.selectedLetter).length,
    [session?.answers],
  );

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  if (state === undefined) {
    return (
      <div className="p-10 text-center font-mono-tech text-sm text-muted-foreground">
        carregando sessão…
      </div>
    );
  }

  if (state === null || !session) {
    return (
      <div className="panel p-10 text-center">
        <p className="font-semibold">Sessão não encontrada</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Ela pode ter sido finalizada ou pertence a outro usuário.
        </p>
        <Button variant="outline" asChild className="mt-4">
          <Link to="/app">Voltar ao início</Link>
        </Button>
      </div>
    );
  }

  if (session.status === "completed") {
    navigate(`/app/results/${sessionId}`, { replace: true });
    return null;
  }

  if (!question) {
    return (
      <div className="panel p-10 text-center">
        <p className="font-semibold">Questão não disponível</p>
        <Button variant="outline" asChild className="mt-4">
          <Link to="/app">Voltar ao início</Link>
        </Button>
      </div>
    );
  }

  const currentIndex = session.currentIndex;
  const total = session.questionCount;
  const progress = Math.round(((currentIndex + 1) / total) * 100);

  const currentAnswer = session.answers.find((a) => a.questionId === question._id);

  const handleAnswer = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await answerMutation({
        sessionId: sessionId as Id<"studySessions">,
        questionIndex: currentIndex,
        selectedLetter: selected,
      });
      if (!isExamMode) {
        setRevealed(true);
      } else if (currentIndex + 1 >= total) {
        // prova completa: pede confirmação de finalização
        setConfirming(true);
      }
    } catch {
      toast.error("Erro ao registrar resposta.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinish = async () => {
    setSubmitting(true);
    try {
      await finishMutation({ sessionId: sessionId as Id<"studySessions"> });
      navigate(`/app/results/${sessionId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao finalizar.");
      setSubmitting(false);
    }
  };

  const handleToggleFavorite = async () => {
    try {
      await toggleFavorite({ questionId: question._id });
    } catch {
      toast.error("Não foi possível favoritar. Tente novamente.");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Barra superior */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="chip border-primary/40 text-primary">
            {isExamMode ? "prova" : session.type === "daily" ? "aquecimento" : "treino"}
          </span>
          <span className="font-mono-tech text-sm text-muted-foreground">
            {currentIndex + 1} / {total}
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono-tech text-sm text-muted-foreground">
          <Timer className="size-4" />
          {formatTime(elapsed)}
        </div>
      </div>

      <Progress value={progress} className="h-1" />

      {/* Navegador de questões (modo prova) */}
      {isExamMode && (
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: total }).map((_, i) => {
            const answered = session.answers[i]?.selectedLetter !== undefined;
            const flagged = flags[i] ?? false;
            return (
              <span
                key={i}
                className={`font-mono-tech flex size-8 items-center justify-center rounded text-xs ${
                  answered
                    ? "bg-primary/15 text-primary"
                    : "bg-secondary text-muted-foreground"
                } ${flagged ? "ring-1 ring-chart-4" : ""}`}
              >
                {i + 1}
                {flagged && <Bookmark className="ml-0.5 size-3" />}
              </span>
            );
          })}
        </div>
      )}

      {/* Questão */}
      <article className="panel p-6 sm:p-8">
        {/* Metadados */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {question.sourceRef && (
            <span className="chip">{question.sourceRef}</span>
          )}
          {question.subjectName && <span className="chip">{question.subjectName}</span>}
          {question.topicName && <span className="chip">{question.topicName}</span>}
          <span className="chip">
            {DIFFICULTY_LABEL[question.difficulty] ?? question.difficulty}
          </span>
          {question.editionLabel && (
            <span className="chip">
              {question.examName} · {question.editionLabel}
            </span>
          )}
        </div>

        {question.context && (
          <div className="mt-5 rounded-md border border-border bg-secondary/40 p-4 text-sm leading-relaxed text-muted-foreground">
            {question.context}
          </div>
        )}

        <h2 className="mt-5 text-lg font-medium leading-relaxed">
          {question.statement}
        </h2>

        {/* Alternativas */}
        <RadioGroup
          value={selected ?? currentAnswer?.selectedLetter ?? ""}
          onValueChange={(v) => {
            if (revealed) return;
            setSelected(v);
          }}
          className="mt-6 space-y-2.5"
          disabled={revealed || submitting}
        >
          {question.alternatives.map((alt) => {
            const isSelected =
              (selected ?? currentAnswer?.selectedLetter) === alt.letter;
            const isCorrect = revealed && alt.letter === currentAnswer?.selectedLetter && session.answers.find(a => a.questionId === question._id)?.isCorrect;
            const isWrongPick =
              revealed && isSelected && !session.answers.find(a => a.questionId === question._id)?.isCorrect;
            return (
              <Label
                key={alt.letter}
                htmlFor={`alt-${alt.letter}`}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                  isCorrect
                    ? "border-chart-3 bg-chart-3/10"
                    : isWrongPick
                      ? "border-destructive bg-destructive/10"
                      : isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                } ${revealed ? "cursor-default" : ""}`}
              >
                <RadioGroupItem
                  id={`alt-${alt.letter}`}
                  value={alt.letter}
                  className="mt-0.5"
                />
                <span className="font-mono-tech mt-0.5 text-sm font-semibold">
                  {alt.letter}
                </span>
                <span className="flex-1 text-sm leading-relaxed">{alt.text}</span>
                {isCorrect && (
                  <CheckCircle2 className="size-4 shrink-0 text-chart-3" />
                )}
                {isWrongPick && <XCircle className="size-4 shrink-0 text-destructive" />}
              </Label>
            );
          })}
        </RadioGroup>

        {/* Correção imediata */}
        {revealed && currentAnswer && (
          <div
            className={`mt-6 rounded-lg border p-4 ${
              currentAnswer.isCorrect
                ? "border-chart-3/50 bg-chart-3/5"
                : "border-destructive/50 bg-destructive/5"
            }`}
          >
            <div className="flex items-center gap-2">
              {currentAnswer.isCorrect ? (
                <CheckCircle2 className="size-5 text-chart-3" />
              ) : (
                <XCircle className="size-5 text-destructive" />
              )}
              <p className="font-semibold">
                {currentAnswer.isCorrect ? "Resposta correta" : "Resposta incorreta"}
              </p>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Gabarito: alternativa{" "}
              <span className="font-mono-tech font-semibold text-foreground">
                {currentAnswer.isCorrect ? selected : "—"}
              </span>
            </p>
          </div>
        )}

        {/* Vídeo relacionado */}
        {revealed && question.videoUrl && (
          <a
            href={question.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center gap-2 text-sm text-chart-2 hover:underline"
          >
            <Youtube className="size-4" />
            {question.videoTitle ?? "Vídeo relacionado"}
          </a>
        )}

        {/* Ações */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <div className="flex items-center gap-2">
            {!revealed && !isExamMode && (
              <Button onClick={handleAnswer} disabled={!selected || submitting}>
                {submitting ? "Corrigindo…" : "Corrigir"}
              </Button>
            )}
            {isExamMode && (
              <Button
                onClick={handleAnswer}
                disabled={!selected || submitting || !!currentAnswer}
              >
                {submitting ? "Salvando…" : currentAnswer ? "Respondida" : "Confirmar"}
              </Button>
            )}
            {!isExamMode && (
              <Button
                variant="outline"
                onClick={handleToggleFavorite}
                className="gap-1.5"
              >
                <Star className={`size-4 ${isFav ? "fill-chart-4 text-chart-4" : ""}`} />
                {isFav ? "Favoritada" : "Favoritar"}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isExamMode && (
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  setFlags((f) => ({ ...f, [currentIndex]: !f[currentIndex] }))
                }
                title="Marcar para revisar"
              >
                <Bookmark className={`size-4 ${flags[currentIndex] ? "fill-chart-4 text-chart-4" : ""}`} />
              </Button>
            )}
            {isExamMode && currentIndex + 1 >= total && (
              <Button onClick={() => setConfirming(true)} variant="outline">
                <Flag className="size-4" />
                Finalizar prova
              </Button>
            )}
          </div>
        </div>
      </article>

      {/* Explicação (modo estudo, após corrigir) */}
      {revealed && !isExamMode && (
        <div className="panel p-6">
          <p className="eyebrow text-primary">explicação</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            A explicação detalhada desta questão está disponível no resultado da
            sessão, junto com o desempenho por matéria.
          </p>
          <Button variant="outline" size="sm" asChild className="mt-4">
            <Link to="/app/questions/create">Criar próxima sessão</Link>
          </Button>
        </div>
      )}

      {/* Confirmação de finalização */}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalizar sessão?</AlertDialogTitle>
            <AlertDialogDescription>
              Você respondeu {answeredCount} de {total} questões.
              {total - answeredCount > 0 &&
                ` ${total - answeredCount} ficarão em branco.`}
              {isExamMode && " O gabarito será corrigido ao final."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar estudando</AlertDialogCancel>
            <AlertDialogAction onClick={handleFinish}>
              Finalizar e ver resultado
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
