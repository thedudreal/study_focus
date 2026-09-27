import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Search, ChevronRight, Pencil, Trash2, Send, CheckCircle2 } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { useState } from "react";

type StatusTab = "all" | "draft" | "review" | "published" | "archived";

const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "draft", label: "Draft" },
  { value: "review", label: "Review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

const STATUS_STYLE: Record<string, string> = {
  draft: "text-muted-foreground",
  review: "text-chart-4",
  published: "text-chart-3",
  archived: "text-destructive",
};

const PAGE_SIZE = 20;

export default function AdminQuestions() {
  const navigate = useNavigate();
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [examFilter, setExamFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [term, setTerm] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Id<"questions"> | null>(null);

  const exams = useQuery(api.exams.listExams, {});
  const areas = useQuery(api.taxonomy.treeWithCounts, {});
  const counts = useQuery(api.adminQuestions.countByStatus, {});

  const subjects =
    areas?.flatMap((a) => a.subjects.map((s) => ({ id: s._id, name: s.name }))) ?? [];

  const list = useQuery(
    api.adminQuestions.listQuestions,
    {
      status: statusTab === "all" ? undefined : statusTab,
      examId: examFilter === "all" ? undefined : (examFilter as Id<"exams">),
      subjectId:
        subjectFilter === "all" ? undefined : (subjectFilter as Id<"taxonomyNodes">),
      difficulty:
        difficulty === "all" ? undefined : (difficulty as "easy" | "medium" | "hard"),
      term: term || undefined,
      paginationOpts: { numItems: PAGE_SIZE, cursor },
    },
  );

  const setStatus = useMutation(api.adminQuestions.setStatus);
  const deleteQuestion = useMutation(api.adminQuestions.deleteQuestion);

  const handleStatus = async (
    questionId: Id<"questions">,
    next: "review" | "published",
  ) => {
    try {
      await setStatus({ questionId, status: next });
      toast.success(
        next === "published" ? "Questão publicada." : "Enviada para revisão.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao alterar status.");
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteQuestion({ questionId: deleting });
      toast.success("Questão excluída.");
      setDeleting(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Abas de status */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setStatusTab(tab.value);
              setCursor(null);
            }}
            className={`chip cursor-pointer ${
              statusTab === tab.value ? "border-primary text-primary" : ""
            }`}
          >
            {tab.label}
            {counts && (
              <span className="ml-1">
                {tab.value === "all" ? counts.total : counts[tab.value]}
              </span>
            )}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/app/admin/import">Importar CSV</Link>
          </Button>
          <Button asChild size="sm" className="glow-primary">
            <Link to="/app/admin/questions/new">Nova questão</Link>
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="panel flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar no enunciado…"
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setCursor(null);
            }}
            className="pl-8"
          />
        </div>
        <Select
          value={examFilter}
          onValueChange={(v) => {
            setExamFilter(v);
            setCursor(null);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as provas</SelectItem>
            {exams?.map((e) => (
              <SelectItem key={e._id} value={e._id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={subjectFilter}
          onValueChange={(v) => {
            setSubjectFilter(v);
            setCursor(null);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as matérias</SelectItem>
            {subjects.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={difficulty}
          onValueChange={(v) => {
            setDifficulty(v);
            setCursor(null);
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Qualquer dificuldade</SelectItem>
            <SelectItem value="easy">Fácil</SelectItem>
            <SelectItem value="medium">Médio</SelectItem>
            <SelectItem value="hard">Difícil</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      {list === undefined ? (
        <div className="panel p-10 text-center text-sm text-muted-foreground">
          Carregando questões…
        </div>
      ) : list.page.length === 0 ? (
        <div className="panel p-10 text-center">
          <p className="font-semibold">Nenhuma questão com esses filtros</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ajuste os filtros, importe um CSV ou crie uma questão manualmente.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setCursor(null)}
          >
            Recarregar
          </Button>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Ref</TableHead>
                <TableHead>Enunciado</TableHead>
                <TableHead className="w-28">Matéria</TableHead>
                <TableHead className="w-32">Prova</TableHead>
                <TableHead className="w-20">Status</TableHead>
                <TableHead className="w-32 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.page.map((q) => (
                <TableRow key={q._id}>
                  <TableCell className="font-mono-tech text-xs text-muted-foreground">
                    {q.sourceRef ?? q._id.slice(-6)}
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/app/admin/questions/${q._id}`}
                      className="line-clamp-1 text-sm hover:text-primary"
                    >
                      {q.statement}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {q.subjectName}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {q.examName ?? "—"}
                  </TableCell>
                  <TableCell>
                    <span className={`chip ${STATUS_STYLE[q.status] ?? ""}`}>
                      {q.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-0.5">
                      {q.status === "draft" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Enviar para revisão"
                          onClick={() => handleStatus(q._id, "review")}
                        >
                          <Send className="size-3.5" />
                        </Button>
                      )}
                      {q.status === "review" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Publicar"
                          onClick={() => handleStatus(q._id, "published")}
                        >
                          <CheckCircle2 className="size-3.5 text-chart-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Editar / revisar"
                        onClick={() => navigate(`/app/admin/questions/${q._id}`)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Excluir"
                        className="text-destructive"
                        onClick={() => setDeleting(q._id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
            <p className="font-mono-tech text-xs text-muted-foreground">
              {list.total} no filtro atual · {PAGE_SIZE} por página
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={list.isDone}
              onClick={() => setCursor(list.cursor)}
            >
              Próxima página
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Confirmação de exclusão */}
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir questão?</AlertDialogTitle>
            <AlertDialogDescription>
              A questão e suas alternativas serão removidas definitivamente.
              Registros de tentativas de alunos não são afetados.
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
