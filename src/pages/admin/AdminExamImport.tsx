import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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
import {
  AlertTriangle,
  FileText,
  Loader2,
  Upload,
  RefreshCw,
  ArrowLeft,
  Send,
  Stamp,
} from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { useRef, useState } from "react";

/**
 * IMPORTAR PROVAS (admin)
 * Fluxo: metadados → upload caderno (+ gabarito) → extração → prévia →
 * publicação individual para a fila de revisão (nunca published direto).
 */

const MAX_PDF_BYTES = 20 * 1024 * 1024;

type Kind = "exam_paper" | "answer_key";

function uid(): string {
  return `pdf-batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function AdminExamImport() {
  const history = useQuery(api.examPdfs.listAll, {});
  const taxonomy = useQuery(api.taxonomy.treeWithCounts, {});
  const exams = useQuery(api.exams.listExams, {});
  const generateUploadUrl = useMutation(api.examPdfs.generateUploadUrl);
  const registerUpload = useMutation(api.examPdfs.registerUpload);
  const extract = useAction(api.examPdfs.extractPdf);
  const retry = useMutation(api.examPdfs.resetForRetry);
  const publish = useMutation(api.examPdfs.publishParsedQuestion);

  const paperInput = useRef<HTMLInputElement>(null);
  const keyInput = useRef<HTMLInputElement>(null);

  const [institution, setInstitution] = useState("");
  const [examName, setExamName] = useState("");
  const [year, setYear] = useState("");
  const [phase, setPhase] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [licenseStatus, setLicenseStatus] = useState<"pending" | "authorized">("pending");
  const [uploading, setUploading] = useState<Kind | null>(null);
  const [extracting, setExtracting] = useState(false);

  const uploadOne = async (kind: Kind, file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Apenas arquivos PDF são aceitos.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      toast.error("PDF maior que 20 MB.");
      return;
    }
    setUploading(kind);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const fingerprint = await sha1Hex(bytes);
      // Upload direto ao File Storage do Convex (POST com a URL gerada).
      const uploadUrl = await generateUploadUrl({});
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };

      const result = await registerUpload({
        batchId: uid(),
        kind,
        storageId,
        filename: file.name,
        contentType: file.type || "application/pdf",
        fileSize: file.size,
        institution: institution || undefined,
        examName: examName || undefined,
        year: year ? Number(year) : undefined,
        phase: phase || undefined,
        sourceUrl: sourceUrl || undefined,
        licenseStatus,
        fileFingerprint: fingerprint,
      });
      if (result.duplicate) {
        toast.info("Arquivo já enviado neste lote — reutilizado.");
      } else {
        toast.success(`PDF ${kind === "exam_paper" ? "do caderno" : "do gabarito"} recebido.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no upload.");
    } finally {
      setUploading(null);
    }
  };

  const startExtraction = async (examPdfId: Id<"examPdfs">) => {
    setExtracting(true);
    try {
      const summary = await extract({ examPdfId });
      toast.success(
        `Extração concluída: ${summary.found} questões identificadas · ${summary.incomplete} incompletas · ${summary.duplicateInFile + summary.duplicateInDb} duplicatas.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na extração.");
    } finally {
      setExtracting(false);
    }
  };

  const handleRetry = async (examPdfId: Id<"examPdfs">) => {
    try {
      await retry({ examPdfId });
      toast.info("Pronto para nova tentativa.");
    } catch {
      toast.error("Não foi possível reprocessar.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/app/admin"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Painel admin
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Importar provas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Envie o caderno em PDF (texto selecionável) e, se disponível, o gabarito
          oficial. Nada é publicado automaticamente — todas as questões passam
          pela fila de revisão.
        </p>
      </div>

      {/* Passo 1: metadados */}
      <section className="panel space-y-4 p-6">
        <p className="eyebrow text-muted-foreground">passo 1 · informações da prova</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Instituição (ex.: USP)</Label>
            <Input value={institution} onChange={(e) => setInstitution(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Exame (ex.: FUVEST)</Label>
            <Input value={examName} onChange={(e) => setExamName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Ano</Label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="2025"
            />
          </div>
          <div className="space-y-2">
            <Label>Fase</Label>
            <Input value={phase} placeholder="1ª fase" onChange={(e) => setPhase(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Endereço da fonte (URL oficial)</Label>
            <Input
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="space-y-2">
            <Label>Direito de uso</Label>
            <Select
              value={licenseStatus}
              onValueChange={(v) => setLicenseStatus(v as "pending" | "authorized")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pendente de verificação</SelectItem>
                <SelectItem value="authorized">Autorizado</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              PDF público não é automaticamente redistribuível. Pendência
              <span className="text-chart-4"> bloqueia a publicação</span>.
            </p>
          </div>
        </div>
      </section>

      {/* Passo 2: uploads */}
      <section className="panel space-y-4 p-6">
        <p className="eyebrow text-muted-foreground">passo 2 · arquivos (PDF, máx. 20 MB)</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-dashed border-border p-5 text-center">
            <FileText className="mx-auto size-8 text-primary" aria-hidden />
            <p className="mt-2 font-semibold">Caderno de questões</p>
            <input
              ref={paperInput}
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadOne("exam_paper", f);
              }}
            />
            <Button
              className="mt-3"
              disabled={uploading !== null}
              onClick={() => paperInput.current?.click()}
            >
              {uploading === "exam_paper" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Enviar
            </Button>
          </div>
          <div className="rounded-lg border border-dashed border-border p-5 text-center">
            <FileText className="mx-auto size-8 text-chart-4" aria-hidden />
            <p className="mt-2 font-semibold">Gabarito oficial (opcional)</p>
            <input
              ref={keyInput}
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadOne("answer_key", f);
              }}
            />
            <Button
              variant="outline"
              className="mt-3"
              disabled={uploading !== null}
              onClick={() => keyInput.current?.click()}
            >
              {uploading === "answer_key" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Enviar
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Cada envio cria um lote próprio; caderno e gabarito devem ser enviados
          com os mesmos metadados para serem associados.
        </p>
      </section>

      {/* Passo 3: lista de recibos/lotes */}
      <section className="panel space-y-4 p-6">
        <p className="eyebrow text-muted-foreground">passo 3 · arquivos e status</p>
        {(history ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum PDF enviado ainda.
          </p>
        ) : (
          <ul className="space-y-3">
            {(history ?? []).map((doc) => (
              <li
                key={doc._id}
                className="rounded-lg border border-border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{doc.filename}</p>
                    <p className="font-mono-tech text-xs text-muted-foreground">
                      {kindLabel(doc.kind)} · {(doc.fileSize / 1024 / 1024).toFixed(2)} MB
                      {doc.year ? ` · ${doc.year}` : ""}
                      {doc.phase ? ` · ${doc.phase}` : ""} · licença {licLabel(doc.licenseStatus)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={doc.status} />
                    {doc.status === "uploaded" && (
                      <Button
                        size="sm"
                        onClick={() => void startExtraction(doc._id)}
                        disabled={extracting}
                        className="glow-primary"
                      >
                        {extracting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                        Extrair questões
                      </Button>
                    )}
                    {doc.status === "failed" && (
                      <Button size="sm" variant="outline" onClick={() => void handleRetry(doc._id)}>
                        <RefreshCw className="size-3.5" />
                        Tentar novamente
                      </Button>
                    )}
                    {doc.status === "awaiting_review" && (
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/app/admin">
                          <Stamp className="size-3.5" />
                          Revisar no banco
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
                {doc.errorMessage && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    {doc.errorMessage}
                  </p>
                )}
                {doc.pdfType === "needs_ocr" && (
                  <p className="mt-2 text-xs text-chart-4">
                    PDF digitalizado (sem texto selecionável) — OCR manual necessário.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Passo 4: prévia + publicação p/ fila de revisão (apenas cadernos) */}
      {(history ?? [])
        .filter((doc) => doc.kind === "exam_paper" && doc.status === "awaiting_review")
        .map((doc) => (
          <ExamPreviewSection
            key={doc._id}
            doc={doc}
            areas={taxonomy ?? []}
            exams={exams ?? []}
            publishMutation={publish}
          />
        ))}
    </div>
  );
}

// ============================================================
// PRÉVIA DO stage (pós-extração) + publicar p/ fila de revisão
// ============================================================

type ExamPdfListItem = NonNullable<
  ReturnType<typeof useQuery<typeof api.examPdfs.listAll>>
>[number];

function ExamPreviewSection({
  doc,
  areas,
  exams,
  publishMutation,
}: {
  doc: ExamPdfListItem;
  areas: NonNullable<ReturnType<typeof useQuery<typeof api.taxonomy.treeWithCounts>>>;
  exams: NonNullable<ReturnType<typeof useQuery<typeof api.exams.listExams>>>;
  publishMutation: ReturnType<
    typeof useMutation<typeof api.examPdfs.publishParsedQuestion>
  >;
}) {
  const parsed = doc.parsedQuestions ?? [];
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedTopic, setSelectedTopic] = useState("");
  const [publishing, setPublishing] = useState<number | null>(null);

  const ready = parsed.filter((q) => !q.needsReview).length;
  const incomplete = parsed.filter((q) => q.needsReview).length;
  const dups = parsed.filter(
    (q) => q.duplicateInDb || q.duplicateInFile,
  ).length;

  return (
    <section className="panel space-y-4 p-6">
      <p className="eyebrow text-muted-foreground">
        prévia · {doc.filename}
      </p>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        <StatChip value={parsed.length} label="questões encontradas" />
        <StatChip value={ready} label="prontas p/ revisão" tone="chart-3" />
        <StatChip value={incomplete} label="incompletas" tone="chart-4" />
        <StatChip value={dups} label="possíveis duplicatas" tone="destructive" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Matéria para publicar (taxonomia existente)</Label>
          <Select value={selectedSubject} onValueChange={setSelectedSubject}>
            <SelectTrigger>
              <SelectValue placeholder="selecione…" />
            </SelectTrigger>
            <SelectContent>
              {areas.flatMap((a) =>
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
          subjectId={selectedSubject as Id<"taxonomyNodes"> | undefined}
          value={selectedTopic}
          onValueChange={setSelectedTopic}
        />
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
                <span className="chip border-destructive/50 text-destructive">duplicata</span>
              )}
              {q.createdQuestionId && (
                <span className="chip border-chart-3/50 text-chart-3">na fila ✓</span>
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
                  <p className="text-xs text-chart-4">
                    {q.reviewReasons.join(" · ")}
                  </p>
                )}
                {!q.createdQuestionId && selectedSubject && (
                  <Button
                    size="sm"
                    disabled={publishing !== null}
                    onClick={async () => {
                      setPublishing(i);
                      try {
                        await publishMutation({
                          examPdfId: doc._id,
                          questionIndex: i,
                          subjectId: selectedSubject as Id<"taxonomyNodes">,
                          topicId: selectedTopic
                            ? (selectedTopic as Id<"taxonomyNodes">)
                            : undefined,
                          examId: selectedExamId(exams, doc),
                          editionId: selectedEditionId(exams, doc),
                          difficulty: "medium",
                        });
                        toast.success(`Q${q.number} enviada para a fila de revisão.`);
                      } catch (err) {
                        toast.error(
                          err instanceof Error ? err.message : "Falha ao publicar.",
                        );
                      } finally {
                        setPublishing(null);
                      }
                    }}
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
      {parsed.length >= 0 && !selectedSubject && (
        <p className="text-xs text-muted-foreground">
          Escolha uma matéria acima para habilitar a publicação — nada entra no
          banco sem classificação explícita do admin.
        </p>
      )}
    </section>
  );
}

function selectedExamId(
  exams: NonNullable<ReturnType<typeof useQuery<typeof api.exams.listExams>>>,
  doc: ExamPdfListItem,
): Id<"exams"> | undefined {
  return exams.find((e) => e.name === doc.examName)?._id as Id<"exams"> | undefined;
}

function selectedEditionId(
  exams: NonNullable<ReturnType<typeof useQuery<typeof api.exams.listExams>>>,
  doc: ExamPdfListItem,
): Id<"examEditions"> | undefined {
  const exam = exams.find((e) => e.name === doc.examName);
  return exam?.editions?.find((ed) => ed.year === doc.year)
    ?._id as Id<"examEditions"> | undefined;
}

// Tópicos da matéria selecionada (children no taxonomyNodes)
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
      <Select
        value={value}
        onValueChange={onValueChange}
        disabled={!subjectId}
      >
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

function StatChip({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: "chart-3" | "chart-4" | "destructive";
}) {
  const toneClass = tone ? `text-${tone}` : "";
  return (
    <div className="bg-card p-4 text-center">
      <p className={`font-mono-tech text-2xl font-semibold ${toneClass}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function kindLabel(kind: Kind): string {
  return kind === "exam_paper" ? "caderno" : "gabarito";
}

function licLabel(license: string): string {
  return license === "authorized" ? "autorizada" : "pendente";
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  uploaded: { label: "recebido", className: "text-muted-foreground" },
  processing: { label: "processando…", className: "text-chart-2" },
  extracting: { label: "extraindo…", className: "text-chart-2" },
  awaiting_review: { label: "aguardando revisão", className: "text-chart-4" },
  completed: { label: "concluído", className: "text-chart-3" },
  failed: { label: "falhou", className: "text-destructive" },
};

function StatusPill({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, className: "" };
  return (
    <span className={`chip font-mono-tech text-xs ${meta.className}`}>
      {meta.label}
    </span>
  );
}
