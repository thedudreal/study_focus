import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileUp,
  Loader2,
  XCircle,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { useRef, useState } from "react";

interface PreviewRow {
  row: number;
  exam: string;
  year?: number;
  phase?: string;
  subject: string;
  topic?: string;
  statement: string;
  options: number;
  correctAnswer: string;
}

interface PreviewResult {
  filename: string;
  totalRows: number;
  validCount: number;
  errorCount: number;
  rowErrors: { row: number; errors: string[] }[];
  /** Linhas com enunciado idêntico a outra (banco ou próprio arquivo). */
  duplicateRows: number[];
  duplicateCount: number;
  preview: PreviewRow[];
  validQuestions: {
    row: number;
    exam: string;
    year?: number;
    phase?: string;
    area?: string;
    subject: string;
    topic?: string;
    subtopic?: string;
    difficulty?: string;
    type?: string;
    statement: string;
    options: { label: string; text: string }[];
    correctAnswer: string;
    explanation?: string;
    source?: string;
  }[];
}

const EXAMPLE_CSV = `exam,year,phase,area,subject,topic,subtopic,difficulty,type,statement,option_a,option_b,option_c,option_d,option_e,correct_answer,explanation,source
ENEM,2024,1º dia,Exatas,Matemática,Funções,Função quadrática,Média,multiple_choice,"Qual é o vértice da parábola y = x² - 4x + 3?","(2, -1)","(2, 1)","(-2, -1)","(4, 3)","(0, 3)",A,"x_v = -b/2a = 4/2 = 2; y_v = 4 - 8 + 3 = -1.","[DEMO] Material de teste próprio"
ENEM,2024,1º dia,Linguagens,Português,Crase,Uso da crase,Fácil,multiple_choice,"Assinale a frase correta:","Vou à escola.","Vou a escola agora à tarde.","Refiro-me à ele.","Cheguei à uma hora.","Às vezes eu vou à pé.",A,"Crase antes de palavra feminina determinada.","[DEMO] Material de teste próprio"`;

export default function AdminImport() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  const [filename, setFilename] = useState("");
  const [csvContent, setCsvContent] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    duplicateSkipped: number;
    failed: number;
  } | null>(null);

  const previewAction = useAction(api.importCsv.previewImport);
  const confirmImport = useMutation(api.importCsv.confirmImport);
  const cancelImport = useMutation(api.importCsv.cancelImport);

  const [previewing, setPreviewing] = useState(false);

  const handleFile = async (file: File) => {
    const text = await file.text();
    setFilename(file.name);
    setCsvContent(text);
    setPreview(null);
    setImportResult(null);
  };

  const handlePreview = async () => {
    if (!csvContent.trim()) {
      toast.error("Cole o conteúdo do CSV ou selecione um arquivo.");
      return;
    }
    setPreviewing(true);
    setImportResult(null);
    try {
      const result = await previewAction({
        csvContent,
        filename: filename || "colado.csv",
      });
      setPreview(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao analisar o CSV.");
    } finally {
      setPreviewing(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview || preview.validQuestions.length === 0) return;
    setImporting(true);
    try {
      const result = await confirmImport({
        filename: preview.filename,
        questions: preview.validQuestions,
      });
      setImportResult({
        imported: result.imported,
        duplicateSkipped: result.duplicateSkipped,
        failed: result.failed,
      });
      if (result.failed > 0) {
        // Exemplo de falha real (duplicatas puladas não são erro).
        const firstFail = result.perRow.find(
          (r) => !r.ok && !r.errors?.[0]?.startsWith("duplicada"),
        );
        const dupNote =
          result.duplicateSkipped > 0 ? `, ${result.duplicateSkipped} duplicadas puladas` : "";
        toast.warning(
          `${result.imported} importadas${dupNote}, ${result.failed} falharam${
            firstFail ? ` (ex.: linha ${firstFail.row}: ${firstFail.errors?.join("; ")})` : ""
          }.`,
        );
      } else if (result.duplicateSkipped > 0) {
        toast.success(
          `${result.imported} questões importadas; ${result.duplicateSkipped} duplicadas puladas.`,
        );
      } else {
        toast.success(`${result.imported} questões importadas como review.`);
      }
      setPreview(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na importação.");
    } finally {
      setImporting(false);
    }
  };

  const handleCancel = async () => {
    try {
      await cancelImport({});
    } finally {
      setPreview(null);
      setCsvContent("");
      setFilename("");
      toast.info("Importação cancelada. Nada foi gravado.");
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
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Importar questões (CSV)
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Toda questão importada entra como <span className="chip text-chart-4">review</span>{" "}
          — nada é publicado automaticamente.
        </p>
      </div>

      {/* Passo 1: arquivo */}
      {!preview && (
        <section className="panel space-y-4 p-6">
          <div className="space-y-2">
            <Label>Arquivo CSV</Label>
            <div
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center transition-colors hover:border-primary/50"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) void handleFile(file);
              }}
            >
              <FileUp className="size-8 text-muted-foreground" />
              <p className="mt-2 text-sm">
                {filename || "Clique ou arraste um arquivo .csv"}
              </p>
              <p className="mt-1 font-mono-tech text-xs text-muted-foreground">
                exam, year, phase, area, subject, topic, subtopic, difficulty,
                type, statement, option_a…option_e, correct_answer, explanation,
                source
              </p>
            </div>
            <Input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Ou cole o conteúdo</Label>
            <Textarea
              rows={6}
              value={csvContent}
              onChange={(e) => {
                setCsvContent(e.target.value);
                setPreview(null);
              }}
              placeholder="exam,year,phase,…,statement,option_a,…,correct_answer,explanation,source"
              className="font-mono-tech text-xs"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilename("exemplo.csv");
                setCsvContent(EXAMPLE_CSV);
                setPreview(null);
              }}
            >
              Preencher com exemplo
            </Button>
            <Button onClick={handlePreview} disabled={previewing} className="glow-primary">
              {previewing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileUp className="size-4" />
              )}
              Analisar arquivo
            </Button>
          </div>
        </section>
      )}

      {/* Passo 2: prévia */}
      {preview && (
        <>
          <section className="panel p-6">
            <p className="eyebrow text-muted-foreground">importação</p>
            <p className="mt-2 font-semibold">Arquivo: {preview.filename}</p>
            <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
              <div className="bg-card p-4 text-center">
                <p className="font-mono-tech text-2xl font-semibold">
                  {preview.totalRows}
                </p>
                <p className="text-xs text-muted-foreground">encontradas</p>
              </div>
              <div className="bg-card p-4 text-center">
                <p className="font-mono-tech text-2xl font-semibold text-chart-3">
                  {preview.validCount}
                </p>
                <p className="text-xs text-muted-foreground">válidas</p>
              </div>
              <div className="bg-card p-4 text-center">
                <p className="font-mono-tech text-2xl font-semibold text-chart-4">
                  {preview.duplicateCount}
                </p>
                <p className="text-xs text-muted-foreground">duplicadas</p>
              </div>
              <div className="bg-card p-4 text-center">
                <p className="font-mono-tech text-2xl font-semibold text-destructive">
                  {preview.errorCount}
                </p>
                <p className="text-xs text-muted-foreground">com erros</p>
              </div>
            </div>

            {/* Duplicatas (enunciado idêntico) */}
            {preview.duplicateCount > 0 && (
              <div className="mt-5 rounded-lg border border-chart-4/40 bg-chart-4/5 p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-chart-4" />
                  <p className="text-sm font-semibold text-chart-4">
                    {preview.duplicateCount} duplicata{preview.duplicateCount > 1 ? "s" : ""} —
                    enunciado idêntico já existe no banco ou repete no arquivo
                  </p>
                </div>
                <p className="mt-2 font-mono-tech text-xs text-muted-foreground">
                  Linhas: {preview.duplicateRows.join(", ")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Elas serão puladas na importação — nenhuma questão repetida entra no banco.
                </p>
              </div>
            )}

            {/* Erros por linha */}
            {preview.rowErrors.length > 0 && (
              <div className="mt-5 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-destructive" />
                  <p className="text-sm font-semibold text-destructive">
                    Linhas com erro (não serão importadas)
                  </p>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {preview.rowErrors.map((e) => (
                    <li key={e.row} className="text-sm">
                      <span className="font-mono-tech text-muted-foreground">
                        Questão {e.row}:
                      </span>{" "}
                      {e.errors.join("; ")}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                  Corrija o CSV e analise novamente, ou prossiga — apenas as
                  linhas válidas serão importadas.
                </p>
              </div>
            )}

            {/* Prévia das primeiras questões */}
            {preview.preview.length > 0 && (
              <div className="mt-5">
                <p className="eyebrow text-muted-foreground">
                  prévia · primeiras {preview.preview.length}
                </p>
                <div className="mt-3 space-y-2">
                  {preview.preview.map((q) => (
                    <div key={q.row} className="rounded-md border border-border p-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="chip">linha {q.row}</span>
                        <span className="chip">{q.exam}</span>
                        {q.year && <span className="chip">{q.year}</span>}
                        <span className="chip">{q.subject}</span>
                        <span className="chip">gab. {q.correctAnswer}</span>
                        <span className="chip">{q.options} alternativas</span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm">{q.statement}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" onClick={handleCancel}>
              <XCircle className="size-4" />
              Cancelar
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handlePreview} disabled={previewing}>
                Reanalisar
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={importing || preview.validCount === 0}
                className="glow-primary"
              >
                {importing ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                Importar {preview.validCount - preview.duplicateCount} questões como review
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Resultado */}
      {importResult && (
        <section className="panel flex items-center gap-4 p-6">
          <CheckCircle2 className="size-8 shrink-0 text-chart-3" />
          <div className="flex-1">
            <p className="font-semibold">
              {importResult.imported} questões importadas
              {importResult.duplicateSkipped > 0 &&
                `, ${importResult.duplicateSkipped} duplicatas puladas`}
              {importResult.failed > 0 && `, ${importResult.failed} falharam`}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Todas entraram como <span className="text-chart-4">review</span> —
              revise e publique no painel de questões.
            </p>
          </div>
          <Button className="glow-primary" onClick={() => navigate("/app/admin")}>
            Ir para revisão
          </Button>
        </section>
      )}

      {/* Formato esperado */}
      <section className="panel p-6">
        <p className="eyebrow text-muted-foreground">formato esperado</p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-secondary/50 p-4 font-mono-tech text-xs leading-relaxed">
{`exam,year,phase,area,subject,topic,subtopic,difficulty,type,statement,option_a,option_b,option_c,option_d,option_e,correct_answer,explanation,source
FUVEST,2025,1ª fase,Exatas,Matemática,Álgebra,Funções,Média,multiple_choice,"Enunciado…","Alt A","Alt B","Alt C","Alt D","Alt E",C,"Explicação…","Fonte autorizada"`}
        </pre>
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          <li>· dificuldade aceita: Fácil/Facil/easy, Média/medium, Difícil/hard</li>
          <li>· campos com vírgula devem estar entre aspas duplas</li>
          <li>· use A–E em correct_answer; a letra deve ter alternativa correspondente</li>
          <li>· source é registrado como fonte não verificada — valide antes de publicar</li>
        </ul>
      </section>
    </div>
  );
}
