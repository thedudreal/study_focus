import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
  SearchX,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

/**
 * GABARITOS (admin)
 * Fila de buscas por gabarito oficial para todas as questões sem chave
 * oficiaI que entraram no site. A busca (API Exa — env EXA_API_KEY) trás
 * candidatos de snippets reais; o admin aprova — a letra vira oficial e
 * substitui a provisória na questão publicada ou no estágio.
 */

export default function AdminAnswerKeys() {
  const searches = useQuery(api.answerKeys.listSearches, {});
  const runSearch = useAction(api.answerKeys.runSearch);
  const applyCandidate = useMutation(api.answerKeys.applyCandidate);
  const retrySearch = useMutation(api.answerKeys.retrySearch);
  const [running, setRunning] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [newHash, setNewHash] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const createSearch = useMutation(api.answerKeys.createSearch);

  const handleRun = async (searchId: Id<"answerKeySearches">) => {
    setRunning(searchId);
    try {
      const r = await runSearch({ searchId });
      if (r.status === "not_found") {
        toast.info("Busca concluída: nenhum candidato confirmado.");
      } else {
        toast.success(`${r.candidates} candidato(s) encontrado(s).`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na busca.");
    } finally {
      setRunning(null);
    }
  };

  const handleApply = async (
    searchId: Id<"answerKeySearches">,
    letter: string,
  ) => {
    setApplying(searchId);
    try {
      await applyCandidate({ searchId, letter });
      toast.success(`Gabarito oficial aplicado: ${letter}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao aplicar.");
    } finally {
      setApplying(null);
    }
  };

  const handleManual = async () => {
    try {
      await createSearch({
        contentHash: newHash.trim(),
        questionNumber: Number(newNumber),
      });
      setNewHash("");
      setNewNumber("");
      toast.success("Busca registrada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao registrar.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Busca por gabaritos oficiais
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Toda questão que entra no site sem gabarito oficial entra nesta
          fila automaticamente (chave provisória ou extraída do próprio
          PDF). A busca traz candidatos — o admin aprova e a letra vira
          oficial, substituindo a provisória. A busca usa a API Exa; se
          falhar, configure <span className="font-mono-tech">EXA_API_KEY</span> nas
          chaves do projeto.
        </p>
      </div>

      {/* Criação manual (questões antigas publicadas sem hash enfileirado) */}
      <section className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <Label>Content hash da questão</Label>
          <Input
            value={newHash}
            onChange={(e) => setNewHash(e.target.value)}
            placeholder="hash do contentHash (ex.: 3f1a9c02)"
            className="font-mono-tech"
          />
        </div>
        <div className="w-32 space-y-1">
          <Label>Nº da questão</Label>
          <Input
            type="number"
            value={newNumber}
            onChange={(e) => setNewNumber(e.target.value)}
            placeholder="34"
          />
        </div>
        <Button
          disabled={!newHash.trim() || !Number(newNumber)}
          onClick={() => void handleManual()}
        >
          <Search className="size-4" />
          Enfileirar busca
        </Button>
      </section>

      {searches === undefined ? (
        <p className="text-sm text-muted-foreground">carregando…</p>
      ) : searches.length === 0 ? (
        <div className="panel p-10 text-center text-sm text-muted-foreground">
          <KeyRound className="mx-auto size-8" />
          <p className="mt-3">Nenhuma questão na fila de gabaritos.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {searches.map((s) => (
            <li key={s._id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono-tech text-sm font-medium">
                    questão {s.questionNumber}
                    {s.examName ? ` · ${s.examName}` : ""}
                    {s.year ? ` ${s.year}` : ""}
                    {s.phase ? ` · ${s.phase}` : ""}
                  </p>
                  <p className="mt-0.5 truncate font-mono-tech text-xs text-muted-foreground">
                    hash {s.contentHash.slice(0, 10)} · “{s.searchQuery}”
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip status={s.status} />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleRun(s._id)}
                    disabled={running !== null || s.status === "applied"}
                  >
                    {running === s._id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Search className="size-3.5" />
                    )}
                    {s.status === "queued" ? "Buscar" : "Buscar de novo"}
                  </Button>
                </div>
              </div>

              {s.errorMessage && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {s.errorMessage}
                  {s.status === "failed" && (
                    <button
                      type="button"
                      className="ml-1 underline hover:text-foreground"
                      onClick={() => void retrySearch({ searchId: s._id })}
                    >
                      <RefreshCw className="mr-1 inline size-3" />
                      reabrir
                    </button>
                  )}
                </p>
              )}

              {s.candidates.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {s.candidates.map((c, i) => (
                    <li
                      key={i}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card/50 p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-mono-tech text-xs">
                          <span className="font-semibold">letra {c.letter}</span>
                          {c.title ? ` · ${c.title}` : ""}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.snippet}
                        </p>
                        <a
                          href={c.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          {c.sourceUrl}
                          <ExternalLink className="size-3" />
                        </a>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleApply(s._id, c.letter)}
                        disabled={applying !== null || s.status === "applied"}
                      >
                        {applying === s._id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-3.5" />
                        )}
                        Aplicar como oficial
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {s.candidates.length === 0 && s.status === "not_found" && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <SearchX className="size-3.5" />
                  Nenhum candidato confirmado — tente novamente depois ou use
                  a chave provisória até confirmar com a fonte oficial.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  queued: { label: "na fila", className: "text-muted-foreground" },
  searched: { label: "com candidatos", className: "text-chart-2" },
  not_found: { label: "não encontrado", className: "text-chart-4" },
  applied: { label: "aplicado", className: "text-chart-3" },
  failed: { label: "falhou", className: "text-destructive" },
};

function StatusChip({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, className: "" };
  return (
    <span className={`chip font-mono-tech text-xs ${meta.className}`}>
      {meta.label}
    </span>
  );
}
