import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Upload,
  ArrowLeft,
} from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { useRef, useState } from "react";

/**
 * ENVIAR PROVA (comunidade)
 * [PROVA] → triagem fria automática (questões + ano + originalidade) →
 * aceito: registrado para revisão/categorização admin → o catálogo cresce.
 * A análise é séria: rejeição sempre vem com motivo explícito.
 */

const MAX_PDF_BYTES = 20 * 1024 * 1024;

type SubmissionListItem = NonNullable<
  ReturnType<typeof useQuery<typeof api.examContributions.listMine>>
>[number];

export default function ContributeExam() {
  const submissions = useQuery(api.examContributions.listMine, {});
  const generateUploadUrl = useMutation(api.examContributions.generateUploadUrl);
  const registerContrib = useMutation(api.examContributions.register);
  const analyze = useAction(api.examContributions.analyze);

  const fileInput = useRef<HTMLInputElement>(null);
  const [institution, setInstitution] = useState("");
  const [examName, setExamName] = useState("");
  const [year, setYear] = useState("");
  const [phase, setPhase] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [attestedUse, setAttestedUse] = useState(false);
  const [working, setWorking] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const submitFile = async (file: File) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Apenas arquivos PDF são aceitos.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      toast.error("PDF maior que 20 MB — reduza o arquivo.");
      return;
    }
    if (!attestedUse) {
      toast.error("Marque a declaração de direito de uso antes de enviar.");
      return;
    }
    setWorking(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };

      const reg = await registerContrib({
        storageId,
        filename: file.name,
        contentType: file.type || "application/pdf",
        fileSize: file.size,
        institution: institution || undefined,
        examName: examName || undefined,
        year: year ? Number(year) : undefined,
        phase: phase || undefined,
        sourceUrl: sourceUrl || undefined,
        attestedUse: true,
      });
      if (reg.duplicate) {
        toast.info(
          "Você já enviou esse arquivo antes — a submissão anterior foi reutilizada.",
        );
        return;
      }

      // Triagem fria: pode aceitar (com avisos) ou rejeitar (com motivo).
      const result = await analyze({ contributionId: reg.contributionId });
      toast.success(
        `Analisei: ${result.found} questão(ões) identificada(s), ${result.ready} completa(s). Registrado para revisão.`,
      );
      if (result.warnings.length > 0) {
        toast.info(result.warnings[0]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no envio/análise.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/app/questions"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Questões
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Enviar prova em PDF
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Sua prova passa por uma análise fria e automática: questões
          identificadas, confirmação do ano no texto e verificação de
          duplicados. O que se enquadra fica registrado para revisão e
          categorização — o catálogo do site se atualiza e todos se
          beneficiam. Nada entra sem aprovação.
        </p>
      </div>

      {/* Metadados */}
      <section className="panel space-y-4 p-6">
        <p className="eyebrow text-muted-foreground">
          passo 1 · sobre a prova (opcional, ajuda a análise)
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Instituição (ex.: USP)</Label>
            <Input
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              placeholder="opcional"
            />
          </div>
          <div className="space-y-2">
            <Label>Exame (ex.: FUVEST)</Label>
            <Input
              value={examName}
              onChange={(e) => setExamName(e.target.value)}
              placeholder="opcional"
            />
          </div>
          <div className="space-y-2">
            <Label>Ano</Label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="confirmado no texto do PDF"
            />
            <p className="text-xs text-muted-foreground">
              O ano informado precisa aparecer no PDF, senão a triagem rejeita.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Fase (ex.: 1ª fase)</Label>
            <Input
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              placeholder="opcional"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Fonte oficial (URL)</Label>
            <Input
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://… (onde você obteve a prova)"
            />
          </div>
          <label className="flex items-start gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={attestedUse}
              onChange={(e) => setAttestedUse(e.target.checked)}
              className="mt-1 size-4 accent-[var(--primary)]"
            />
            <span className="text-sm text-muted-foreground">
              Declaro que sou o autor do material ou que tenho direito de uso
              e redistribuição dele.{" "}
              <span className="text-foreground">
                Sem essa declaração o envio é recusado.
              </span>
            </span>
          </label>
        </div>
      </section>

      {/* Upload */}
      <section className="panel space-y-3 p-6">
        <p className="eyebrow text-muted-foreground">
          passo 2 · arquivo (PDF com texto selecionável, máx. 20 MB)
        </p>
        <div
          role="button"
          tabIndex={0}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          }`}
          onClick={() => fileInput.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileInput.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f) void submitFile(f);
          }}
        >
          {working ? (
            <Loader2 className="mx-auto size-10 animate-spin text-primary" aria-hidden />
          ) : (
            <Upload className="mx-auto size-10 text-primary" aria-hidden />
          )}
          <p className="mt-3 font-semibold">
            {working ? "Analisando friamente…" : "Arraste o PDF da prova aqui"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            ou clique para escolher · análise automática de questões e ano
          </p>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void submitFile(f);
          }}
        />
        <p className="text-xs text-muted-foreground">
          O que acontece depois: questões completas vão para fila de revisão e
          categorização (a administração escolhe matéria e tópico), e você vê o
          status de cada submissão abaixo.
        </p>
      </section>

      {/* Minhas submissões */}
      <section className="panel space-y-4 p-6">
        <p className="eyebrow text-muted-foreground">suas submissões</p>
        {submissions === undefined ? (
          <p className="text-sm text-muted-foreground">carregando…</p>
        ) : submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma submissão ainda. Seu primeiro PDF aparecerá aqui com o
            resultado da análise.
          </p>
        ) : (
          <ul className="space-y-3">
            {submissions.map((c) => (
              <SubmissionRow key={c._id} item={c} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SubmissionRow({ item }: { item: SubmissionListItem }) {
  const a = item.analysis;
  return (
    <li className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{item.filename}</p>
          <p className="font-mono-tech text-xs text-muted-foreground">
            {item.examName ?? "prova"} {item.year ? `· ${item.year}` : ""}
            {item.phase ? ` · ${item.phase}` : ""} · licença{" "}
            {item.licenseStatus === "authorized"
              ? "autorizada"
              : item.licenseStatus === "unauthorized"
                ? "não autorizada"
                : "pendente"}
          </p>
        </div>
        <StatusPill status={item.status} />
      </div>

      {a && (
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {a.outcome === "accepted" ? (
              <span className="chip border-chart-3/50 text-chart-3">
                enquadrada
              </span>
            ) : (
              <span className="chip border-destructive/50 text-destructive">
                rejeitada
              </span>
            )}
            <span className="chip font-mono-tech">{a.found} questões</span>
            <span className="chip font-mono-tech">{a.ready} completas</span>
            {a.year !== undefined && (
              <span className="chip font-mono-tech">
                {a.yearSource === "inferred" ? "ano inferido" : "ano"} {a.year}
              </span>
            )}
          </div>
          {a.rejectionReasons.length > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {a.rejectionReasons.join(" · ")}
            </p>
          )}
          {a.warnings.length > 0 && (
            <p className="text-xs text-chart-4">{a.warnings.join(" · ")}</p>
          )}
        </div>
      )}

      {item.errorMessage && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {item.errorMessage}
        </p>
      )}

      {item.status === "analyzed" && !item.errorMessage && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-chart-3">
          <CheckCircle2 className="size-3.5 shrink-0" />
          Registrado — em revisão pela administração.
        </p>
      )}
    </li>
  );
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  uploaded: { label: "recebido", className: "text-muted-foreground" },
  analyzing: { label: "analisando…", className: "text-chart-2" },
  analyzed: { label: "registrado p/ revisão", className: "text-chart-3" },
  rejected: { label: "rejeitado", className: "text-destructive" },
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
