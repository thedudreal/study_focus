import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Send,
  Stamp,
  ShieldCheck,
  Ban,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

/**
 * CONTRIBUIÇÕES DA COMUNIDADE (admin)
 * Revisão das submissões dos usuários: autorizar/ negar licença, abrir o
 * estágio de cada contribuição e publicar questão a questão (status
 * "review", com matéria/tópico escolhidos explicitamente). A licença
 * pendente BLOQUEIA a publicação.
 */

type ContributionDoc = NonNullable<
  ReturnType<typeof useQuery<typeof api.examContributions.listForAdmin>>
>[number];

export default function AdminContributions() {
  const contributions = useQuery(api.examContributions.listForAdmin, {});
  const setLicense = useMutation(api.examContributions.setLicense);

  const handleLicense = async (
    contributionId: Id<"examContributions">,
    licenseStatus: "authorized" | "unauthorized" | "pending",
  ) => {
    try {
      await setLicense({ contributionId, licenseStatus });
      toast.success("Licença atualizada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao atualizar licença.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Contribuições da comunidade
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          PDFs enviados pelos usuários, já triados automaticamente (questões,
          ano, duplicados). Autorize a licença e publique questão a questão —
          cada uma entra na fila de revisão existente, nunca direto no banco.
        </p>
      </div>

      {contributions === undefined ? (
        <p className="text-sm text-muted-foreground">carregando…</p>
      ) : contributions.length === 0 ? (
        <div className="panel p-10 text-center text-sm text-muted-foreground">
          Nenhuma contribuição recebida ainda.
        </div>
      ) : (
        <ul className="space-y-4">
          {contributions.map((c) => (
            <li key={c._id}>
              <ContributionCard doc={c} onLicense={handleLicense} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ContributionCard({
  doc,
  onLicense,
}: {
  doc: ContributionDoc;
  onLicense: (
    id: Id<"examContributions">,
    license: "authorized" | "unauthorized" | "pending",
  ) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const parsed = doc.parsedQuestions ?? [];
  const published = parsed.filter((q) => q.createdQuestionId).length;
  const pending = parsed.length - published;

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left"
        onClick={() => setOpen(!open)}
      >
        <div className="min-w-0">
          <p className="truncate font-medium">{doc.filename}</p>
          <p className="font-mono-tech text-xs text-muted-foreground">
            {doc.examName ?? "prova"} {doc.year ? `· ${doc.year}` : ""}
            {doc.phase ? ` · ${doc.phase}` : ""} · por{" "}
            {(doc as { userLabel?: string }).userLabel ?? "usuário"} ·{" "}
            {new Date(doc.createdAt).toLocaleDateString("pt-BR")}
            {parsed.length > 0 ? ` · ${published}/${parsed.length} publicadas` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {doc.status === "analyzed" && (
            <span className="chip font-mono-tech text-xs border-chart-3/50 text-chart-3">
              aceita
            </span>
          )}
          {doc.status === "rejected" && (
            <span className="chip font-mono-tech text-xs border-destructive/50 text-destructive">
              rejeitada
            </span>
          )}
          <LicenseChip status={doc.licenseStatus} />
          {open ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {open && (
        <div className="space-y-4 border-t border-border p-4">
          <LicenseControls doc={doc} onLicense={onLicense} />

          {doc.analysis && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="chip font-mono-tech">{doc.analysis.found} questões</span>
              <span className="chip font-mono-tech">{doc.analysis.ready} completas</span>
              <span className="chip font-mono-tech">
                {doc.analysis.duplicateInDb + doc.analysis.duplicateInFile} duplicadas
              </span>
              {doc.analysis.warnings.map((w, i) => (
                <span key={i} className="chip border-chart-4/50 text-chart-4">
                  {w}
                </span>
              ))}
            </div>
          )}
          {doc.errorMessage && (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {doc.errorMessage}
            </p>
          )}
          {parsed.length > 0 && (
            <StagePublishList doc={doc} parsed={parsed} published={published} pending={pending} />
          )}
        </div>
      )}
    </div>
  );
}

function LicenseChip({ status }: { status: string }) {
  if (status === "authorized") {
    return (
      <span className="chip font-mono-tech text-xs border-chart-3/50 text-chart-3">
        licença ok
      </span>
    );
  }
  if (status === "unauthorized") {
    return (
      <span className="chip font-mono-tech text-xs border-destructive/50 text-destructive">
        licença negada
      </span>
    );
  }
  return (
    <span className="chip font-mono-tech text-xs border-chart-4/50 text-chart-4">
      licença pendente
    </span>
  );
}

function LicenseControls({
  doc,
  onLicense,
}: {
  doc: ContributionDoc;
  onLicense: (
    id: Id<"examContributions">,
    license: "authorized" | "unauthorized" | "pending",
  ) => Promise<void>;
}) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <ShieldCheck className="size-4 text-primary" />
        Direito de uso (declaração do usuário obviamente não basta)
      </p>
      {doc.sourceUrl && (
        <p className="text-xs text-muted-foreground">
          Fonte informada:{" "}
          <a
            href={doc.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            {doc.sourceUrl}
          </a>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={doc.licenseStatus === "authorized" ? "outline" : "default"}
          onClick={() => void onLicense(doc._id, "authorized")}
        >
          <CheckCircle2 className="size-3.5" />
          Autorizar
        </Button>
        <Button
          size="sm"
          variant={
            doc.licenseStatus === "unauthorized" ? "default" : "outline"
          }
          onClick={() => void onLicense(doc._id, "unauthorized")}
        >
          <Ban className="size-3.5" />
          Negar
        </Button>
      </div>
    </div>
  );
}

/**
 * Estágio de publicação: questão a questão, sempre com matéria explícita
 * (taxonomia existente). A licença pendente trava o botão.
 */
function StagePublishList({
  doc,
  parsed,
  published,
  pending,
}: {
  doc: ContributionDoc;
  parsed: NonNullable<ContributionDoc["parsedQuestions"]>;
  published: number;
  pending: number;
}) {
  const taxonomy = useQuery(api.taxonomy.treeWithCounts, {});
  const exams = useQuery(api.exams.listExams, {});
  const publishMutation = useMutation(api.examContributions.publishQuestion);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedTopic, setSelectedTopic] = useState("");
  const [selectedExam, setSelectedExam] = useState("");
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [publishing, setPublishing] = useState<number | null>(null);

  const handlePublish = async (i: number) => {
    if (!selectedSubject) {
      toast.error("Escolha uma matéria primeiro.");
      return;
    }
    setPublishing(i);
    try {
      await publishMutation({
        contributionId: doc._id,
        questionIndex: i,
        subjectId: selectedSubject as Id<"taxonomyNodes">,
        topicId: selectedTopic ? (selectedTopic as Id<"taxonomyNodes">) : undefined,
        examId: selectedExam ? (selectedExam as Id<"exams">) : undefined,
        difficulty: "medium",
      });
      toast.success(`Q${parsed[i].number} enviada para a fila de revisão.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao publicar.");
    } finally {
      setPublishing(null);
    }
  };

  return (
    <div className="space-y-3 rounded-md bg-card/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow text-muted-foreground">
          estágio · {published} publicadas · {pending} pendentes
        </p>
        <p className="font-mono-tech text-xs text-muted-foreground">
          <Stamp className="mr-1 inline size-3" />
          vai para a fila de revisão
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Matéria</Label>
          <Select value={selectedSubject} onValueChange={setSelectedSubject}>
            <SelectTrigger>
              <SelectValue placeholder="selecione…" />
            </SelectTrigger>
            <SelectContent>
              {(taxonomy ?? []).flatMap((a) =>
                a.subjects.map((s) => (
                  <SelectItem key={s._id} value={s._id}>
                    {s.name}
                  </SelectItem>
                )),
              )}
            </SelectContent>
          </Select>
        </div>
        <TopicPicker
          subjectId={selectedSubject ? (selectedSubject as Id<"taxonomyNodes">) : undefined}
          value={selectedTopic}
          onValueChange={setSelectedTopic}
        />
        <div className="space-y-2">
          <Label>Exame (opcional)</Label>
          <Select value={selectedExam} onValueChange={setSelectedExam}>
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {(exams ?? []).map((e) => (
                <SelectItem key={e._id} value={e._id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ul className="space-y-2">
        {parsed.map((q, i) => (
          <li key={i} className="rounded-md border border-border p-3">
            <button
              type="button"
              className="flex w-full flex-wrap items-center gap-2 text-left"
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
            >
              <span className="chip font-mono-tech">Q{q.number}</span>
              <span className="chip">página {q.startPage}</span>
              {q.needsReview && (
                <span className="chip border-chart-4/50 text-chart-4">revisar</span>
              )}
              {(q.duplicateInDb || q.duplicateInFile) && (
                <span className="chip border-destructive/50 text-destructive">
                  duplicata
                </span>
              )}
              {q.createdQuestionId && (
                <span className="chip border-chart-3/50 text-chart-3">
                  na fila ✓
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {q.statement.slice(0, 90)}
                {q.statement.length > 90 ? "…" : ""}
              </span>
            </button>
            {openIndex === i && (
              <div className="mt-3 space-y-3 border-t border-border pt-3 text-sm">
                <p className="leading-relaxed">{q.statement}</p>
                <ol className="space-y-1">
                  {q.alternatives.map((a) => (
                    <li key={a.letter}>
                      <span className="font-mono-tech font-semibold">{a.letter})</span>{" "}
                      {a.text}
                    </li>
                  ))}
                </ol>
                {q.reviewReasons.length > 0 && (
                  <p className="text-xs text-chart-4">{q.reviewReasons.join(" · ")}</p>
                )}
                {!q.createdQuestionId && (
                  <Button
                    size="sm"
                    disabled={
                      publishing !== null ||
                      doc.licenseStatus !== "authorized" ||
                      !selectedSubject
                    }
                    onClick={() => void handlePublish(i)}
                  >
                    {publishing === i ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Send className="size-3.5" />
                    )}
                    Publicar na fila de revisão
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {doc.licenseStatus !== "authorized" && (
        <p className="text-xs text-destructive">
          Licença pendente/negada — publique somente após autorizar o direito de uso.
        </p>
      )}
    </div>
  );
}

function TopicPicker({
  subjectId,
  value,
  onValueChange,
}: {
  subjectId?: Id<"taxonomyNodes">;
  value: string;
  onValueChange: (v: string) => void;
}) {
  const topics = useQuery(
    api.taxonomy.listChildren,
    subjectId ? { parentId: subjectId } : "skip",
  );
  return (
    <div className="space-y-2">
      <Label>Tópico (opcional)</Label>
      <Select value={value} onValueChange={onValueChange} disabled={!subjectId}>
        <SelectTrigger>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {(topics ?? []).map((t) => (
            <SelectItem key={t._id} value={t._id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
