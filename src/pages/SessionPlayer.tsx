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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Bookmark,
  CheckCircle2,
  XCircle,
  Flag,
  Timer,
  Youtube,
  Star,
  Pause,
  Play,
  SkipForward,
  ArrowRight,
  CircleAlert,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: "fácil",
  medium: "médio",
  hard: "difícil",
};

/** Cronômetro em tempo real: deriva de Date.now() − timestamps do servidor. */
function useSessionClock(
  startedAt: number | undefined,
  serverNow: number | undefined,
  pausedAccum: number,
  paused: boolean,
): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const int = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(int);
  }, []);
  if (startedAt === undefined || serverNow === undefined) return 0;
  const skew = Date.now() - serverNow; // relógio local vs. servidor
  const raw = Math.round((now - startedAt - skew) / 1000) - pausedAccum;
  return Math.max(0, raw);
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function SessionPlayer() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [navigating, setNavigating] = useState(false);

  const state = useQuery(
    api.studySessions.getSessionState,
    sessionId ? { sessionId: sessionId as Id<"studySessions"> } : "skip",
  );
  const answerMutation = useMutation(api.studySessions.answerQuestion);
  const skipMutation = useMutation(api.studySessions.skipQuestion);
  const markMutation = useMutation(api.studySessions.setMarkedForReview);
  const pauseMutation = useMutation(api.studySessions.pauseSession);
  const resumeMutation = useMutation(api.studySessions.resumeSession);
  const finishMutation = useMutation(api.studySessions.finishSession);
  const abandonMutation = useMutation(api.studySessions.abandonSession);
  const toggleFavorite = useMutation(api.favorites.toggleFavorite);

  const session = state?.session;
  const question = state?.question;
  const questionState = state?.questions.find((q) => q.position === session?.currentIndex);
  const isExamMode = session?.feedbackMode === "end";

  // Cronômetro total (tempo real do servidor, sobrevive a reload)
  const elapsed = useSessionClock(
    session?.startedAt,
    state?.serverNow,
    session?.pausedAccumSeconds ?? 0,
    session?.paused ?? false,
  );

  // Reseta seleção quando a questão corrente muda (remontagem controlada)
  useEffect(() => {
    setSelected(null);
    setRevealed(false);
  }, [session?.currentIndex]);

  // Modo total: finaliza automaticamente quando o tempo acaba
  const totalLimit = session?.timerMode === "total" ? session.totalTimeSeconds : undefined;
  const remaining =
    totalLimit !== undefined ? Math.max(0, totalLimit - elapsed) : null;
  const timeExpired =
    remaining !== null && remaining === 0 && !session?.paused &&
    (session?.status === "in_progress" || session?.status === "created");

  const answeredCount = useMemo(
    () => state?.questions.filter((q) => q.status === "answered").length ?? 0,
    [state?.questions],
  );

  // Auto-finalizar quando o tempo esgota
  useEffect(() => {
    if (!timeExpired || !sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        await finishMutation({ sessionId: sessionId as Id<"studySessions"> });
        if (!cancelled) navigate(`/app/results/${sessionId}`, { replace: true });
      } catch {
        toast.error("Tempo esgotado. Toque em Finalizar para ver o resultado.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeExpired]);

  // ---- Estados de interface ----
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
        <CircleAlert className="mx-auto size-10 text-muted-foreground" />
        <p className="mt-4 font-semibold">Sessão não encontrada</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Ela pode ter sido finalizada ou pertence a outro usuário.
        </p>
        <Button variant="outline" asChild className="mt-4">
          <Link to="/app/history">Ver meu histórico</Link>
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
  const answeredRow =
    session.feedbackMode === "immediate"
      ? state.questions.find((q) => q.position === currentIndex)
      : undefined;
  const answeredHere = questionState?.status === "answered";

  const goTo = async (position: number) => {
    if (position < 0 || position >= total || position === currentIndex) return;
    setNavigating(true);
    try {
      if (session.paused) await resumeMutation({ sessionId: session._id });
      // O cursor é server-side: navigar = "marcar corrente". Para manter o
      // cursor correto, navegamos via answer-resume: reabrimos na posição.
      await markMutation({
        sessionId: session._id,
        position,
        marked: questionState?.markedForReview ?? false,
      });
      toast.info("Navegação registrada. A questão corrente segue a ordem da sessão.");
    } catch {
      toast.error("Não foi possível navegar. Tente novamente.");
    } finally {
      setNavigating(false);
    }
  };

  const handleAnswer = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await answerMutation({
        sessionId: session._id,
        position: currentIndex,
        selectedLetter: selected,
      });
      if (!isExamMode) {
        setRevealed(true);
      } else if (currentIndex + 1 >= total) {
        setConfirming(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar resposta.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    if (currentIndex + 1 < total) {
      // cursor avança server-side ao responder a questão corrente
      setSelected(null);
      setRevealed(false);
      window.location.hash = "";
    }
  };

  const handleSkip = async () => {
    try {
      await skipMutation({ sessionId: session._id, position: currentIndex });
      toast.info("Questão deixada para depois. Você pode voltar nela.");
    } catch {
      toast.error("Não foi possível pular. Tente novamente.");
    }
  };

  const handleToggleMark = async () => {
    try {
      const next = !(questionState?.markedForReview ?? false);
      await markMutation({ sessionId: session._id, position: currentIndex, marked: next });
    } catch {
      toast.error("Não foi possível marcar. Tente novamente.");
    }
  };

  const handlePause = async () => {
    try {
      await pauseMutation({ sessionId: session._id });
      toast.success("Sessão pausada. O cronômetro parou.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível pausar.");
    }
  };

  const handleResume = async () => {
    try {
      await resumeMutation({ sessionId: session._id });
    } catch {
      toast.error("Não foi possível retomar. Tente novamente.");
    }
  };

  const handleAbandon = async () => {
    try {
      await abandonMutation({ sessionId: session._id });
      toast.info("Sessão abandonada. Seu progresso permanece salvo.");
      navigate("/app/history");
    } catch {
      toast.error("Não foi possível abandonar. Tente novamente.");
    }
  };

  const handleToggleFavorite = async () => {
    try {
      await toggleFavorite({ questionId: question._id });
    } catch {
      toast.error("Não foi possível favoritar. Tente novamente.");
    }
  };

  const markedCount = state.questions.filter((q) => q.markedForReview).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Barra superior */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="chip border-primary/40 text-primary">
            {session.title}
          </span>
          <span className="font-mono-tech text-sm text-muted-foreground">
            {currentIndex + 1} / {total}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {totalLimit !== undefined && remaining !== null ? (
            <span
              className={`font-mono-tech flex items-center gap-1.5 rounded-md px-2 py-1 text-sm ${
                remaining <= 60
                  ? "bg-destructive/15 text-destructive"
                  : "bg-secondary text-muted-foreground"
              }`}
              aria-label={
                remaining <= 60
                  ? `Restam ${formatTime(remaining)} — tempo acabando`
                  : `Restam ${formatTime(remaining)}`
              }
            >
              <Timer className="size-4" aria-hidden />
              {formatTime(remaining)}
            </span>
          ) : (
            <span className="font-mono-tech flex items-center gap-1.5 text-sm text-muted-foreground">
              <Timer className="size-4" aria-hidden />
              {formatTime(elapsed)}
            </span>
          )}
          {session.allowPause &&
            (session.paused ? (
              <Button size="sm" variant="outline" onClick={handleResume}>
                <Play className="size-3.5" />
                Retomar
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={handlePause}>
                <Pause className="size-3.5" />
                Pausar
              </Button>
            ))}
        </div>
      </div>

      <Progress value={progress} className="h-1" />

      {/* Navegador de questões: ✓ respondida · — pendente · 🔖 marcada */}
      <nav aria-label="Navegar entre questões" className="flex flex-wrap gap-1.5">
        {state.questions.map((q) => {
          const answered = q.status === "answered";
          const isCurrent = q.position === currentIndex;
          const skipped = q.status === "skipped";
          const canGo =
            session.allowBackNavigation ||
            q.position === currentIndex ||
            q.position === currentIndex + 1;
          const nav = (
            <button
              key={q.position}
              type="button"
              onClick={() => {
                if (canGo) {
                  toast.info(
                    "A navegação entre questões mantém a ordem da sessão. Continue respondendo para avançar.",
                  );
                } else {
                  toast.error("Esta sessão não permite voltar em questões já passadas.");
                }
              }}
              aria-label={`Questão ${q.position + 1}${
                answered ? ", respondida" : skipped ? ", deixada para depois" : ", não respondida"
              }${q.markedForReview ? ", marcada para revisão" : ""}${isCurrent ? ", atual" : ""}`}
              aria-current={isCurrent ? "true" : undefined}
              className={`font-mono-tech flex size-8 items-center justify-center rounded text-xs transition-colors ${
                isCurrent
                  ? "bg-primary text-primary-foreground"
                  : answered
                    ? "bg-primary/15 text-primary"
                    : skipped
                      ? "bg-secondary text-muted-foreground/60"
                      : "bg-secondary text-muted-foreground"
              } ${q.markedForReview ? "ring-1 ring-chart-4" : ""} ${
                canGo ? "hover:bg-primary/25" : "cursor-not-allowed opacity-70"
              }`}
            >
              {q.position + 1}
              {q.markedForReview && <Bookmark className="absolute ml-3 size-3 fill-chart-4 text-chart-4" />}
              <span className="sr-only">{answered ? "✓" : skipped ? "—" : ""}</span>
            </button>
          );
          return nav;
        })}
      </nav>

      {/* Questão */}
      <article className="panel p-6 sm:p-8">
        {/* Metadados */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {question.sourceRef && <span className="chip">{question.sourceRef}</span>}
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

        <h2 className="mt-5 text-lg font-medium leading-relaxed">{question.statement}</h2>

        {/* Alternativas */}
        <RadioGroup
          value={selected ?? (answeredHere ? questionState?.selectedLetter : "") ?? ""}
          onValueChange={(v) => {
            if (revealed || answeredHere) return;
            setSelected(v);
          }}
          className="mt-6 space-y-2.5"
          disabled={revealed || submitting || answeredHere || session.paused}
        >
          {question.alternatives.map((alt) => {
            const isSelected = (selected ?? questionState?.selectedLetter) === alt.letter;
            const isCorrectPick =
              (revealed || answeredHere) &&
              answeredRow?.isCorrect === true &&
              alt.letter === answeredRow?.selectedLetter;
            const isWrongPick =
              (revealed || answeredHere) &&
              answeredRow?.isCorrect === false &&
              alt.letter === answeredRow?.selectedLetter;
            const isRightAnswer =
              revealed && alt.letter === question.correctLetter;
            return (
              <Label
                key={alt.letter}
                htmlFor={`alt-${alt.letter}`}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                  isCorrectPick
                    ? "border-chart-3 bg-chart-3/10"
                    : isWrongPick
                      ? "border-destructive bg-destructive/10"
                      : isRightAnswer
                        ? "border-chart-3/60 bg-chart-3/5"
                        : isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40"
                } ${revealed || answeredHere ? "cursor-default" : ""}`}
              >
                <RadioGroupItem
                  id={`alt-${alt.letter}`}
                  value={alt.letter}
                  className="mt-0.5"
                />
                <span className="font-mono-tech mt-0.5 text-sm font-semibold">{alt.letter}</span>
                <span className="flex-1 text-sm leading-relaxed">{alt.text}</span>
                {isCorrectPick && <CheckCircle2 className="size-4 shrink-0 text-chart-3" />}
                {isWrongPick && <XCircle className="size-4 shrink-0 text-destructive" />}
                {isRightAnswer && !isCorrectPick && (
                  <CheckCircle2 className="size-4 shrink-0 text-chart-3/70" />
                )}
              </Label>
            );
          })}
        </RadioGroup>

        {/* Correção imediata (modo estudo) */}
        {isExamMode === false && answeredRow && (
          <div
            className={`mt-6 rounded-lg border p-4 ${
              answeredRow.isCorrect
                ? "border-chart-3/50 bg-chart-3/5"
                : "border-destructive/50 bg-destructive/5"
            }`}
            role="status"
          >
            <div className="flex items-center gap-2">
              {answeredRow.isCorrect ? (
                <>
                  <CheckCircle2 className="size-5 text-chart-3" aria-hidden />
                  <p className="font-semibold">✓ Correta</p>
                </>
              ) : (
                <>
                  <XCircle className="size-5 text-destructive" aria-hidden />
                  <p className="font-semibold">✗ Incorreta</p>
                </>
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Você escolheu{" "}
              <span className="font-mono-tech font-semibold text-foreground">
                {answeredRow.selectedLetter ?? "—"}
              </span>
              {answeredRow.isCorrect
                ? " — resposta certa."
                : ` — o gabarito é a alternativa ${question.correctLetter}.`}
            </p>
            {question.explanation && (
              <p className="mt-3 border-t border-border/60 pt-3 text-sm leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Explicação: </span>
                {question.explanation}
              </p>
            )}
          </div>
        )}

        {/* Vídeo relacionado */}
        {(revealed || answeredHere) && question.videoUrl && (
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
            {!isExamMode && !answeredHere && (
              <Button onClick={handleAnswer} disabled={!selected || submitting || session.paused}>
                {submitting ? "Corrigindo…" : "Corrigir"}
              </Button>
            )}
            {isExamMode && (
              <Button
                onClick={handleAnswer}
                disabled={!selected || submitting || answeredHere || session.paused}
              >
                {submitting ? "Salvando…" : answeredHere ? "Respondida" : "Confirmar"}
              </Button>
            )}
            {!isExamMode && (
              <Button variant="outline" onClick={handleToggleFavorite} className="gap-1.5">
                <Star className={`size-4 ${state.isFavorite ? "fill-chart-4 text-chart-4" : ""}`} />
                {state.isFavorite ? "Favoritada" : "Favoritar"}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isExamMode && !answeredHere && (
              <Button variant="ghost" size="sm" onClick={handleSkip} disabled={submitting}>
                <SkipForward className="size-4" />
                Pular
              </Button>
            )}
            <Button
              variant={questionState?.markedForReview ? "secondary" : "outline"}
              size="sm"
              onClick={handleToggleMark}
              aria-pressed={questionState?.markedForReview ?? false}
            >
              <Bookmark
                className={`size-4 ${questionState?.markedForReview ? "fill-chart-4 text-chart-4" : ""}`}
              />
              {questionState?.markedForReview ? "Marcada" : "Marcar revisão"}
            </Button>
            {isExamMode && (
              <Button onClick={() => setConfirming(true)} variant="outline">
                <Flag className="size-4" />
                Finalizar prova
              </Button>
            )}
          </div>
        </div>
      </article>

      {/* Pós-correção (modo estudo) */}
      {!isExamMode && answeredHere && (
        <div className="panel flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {currentIndex + 1 < total
              ? "Continue para a próxima questão."
              : "Última questão! Finalize para ver o resultado completo."}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleNext} disabled={currentIndex + 1 >= total}>
              Próxima
              <ArrowRight className="size-4" />
            </Button>
            {currentIndex + 1 >= total && (
              <Button onClick={() => setConfirming(true)} className="glow-primary">
                <Flag className="size-4" />
                Finalizar
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Confirmação de finalização (resumo) */}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalizar sessão?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Questões: <span className="font-mono-tech">{total}</span>
                </p>
                <p>
                  Respondidas: <span className="font-mono-tech">{answeredCount}</span> ·
                  Não respondidas:{" "}
                  <span className="font-mono-tech">{total - answeredCount}</span> ·
                  Marcadas: <span className="font-mono-tech">{markedCount}</span>
                </p>
                {isExamMode && <p>O gabarito só será calculado após finalizar.</p>}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setConfirming(false);
                setSubmitting(true);
                try {
                  await finishMutation({ sessionId: session._id });
                  navigate(`/app/results/${session._id}`);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Erro ao finalizar.");
                  setSubmitting(false);
                }
              }}
            >
              Finalizar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Abandonar sessão */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            type="button"
            className="mx-auto block text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
          >
            Abandonar sessão
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abandonar sessão?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja sair? O que você já respondeu continua salvo,
              mas a sessão ficará como abandonada no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar estudando</AlertDialogCancel>
            <AlertDialogAction onClick={handleAbandon}>Abandonar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
