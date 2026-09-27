import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Star, Play, Trash2, ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";

export default function Favorites() {
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const favorites = useQuery(api.favorites.listFavorites, {});
  const toggleFavorite = useMutation(api.favorites.toggleFavorite);
  const createSession = useMutation(api.studySessions.createSession);

  const startFavoritesSession = async () => {
    setStarting(true);
    try {
      const sessionId = await createSession({
        type: "custom",
        feedbackMode: "immediate",
        source: "favorites",
        questionCount: 20,
      });
      navigate(`/app/session/${sessionId}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível iniciar a sessão.",
      );
      setStarting(false);
    }
  };

  const unfavorite = async (questionId: string) => {
    try {
      await toggleFavorite({ questionId: questionId as Id<"questions"> });
    } catch {
      toast.error("Não foi possível remover. Tente novamente.");
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/app/questions"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Questões
        </Link>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Favoritos</h1>
            <p className="mt-1 text-muted-foreground">
              {favorites === undefined
                ? "carregando…"
                : favorites.length === 0
                  ? "Salve questões durante o treino para revisá-las aqui."
                  : `${favorites.length} questões salvas`}
            </p>
          </div>
          {favorites && favorites.length > 0 && (
            <Button onClick={startFavoritesSession} disabled={starting} className="glow-primary">
              <Play className="size-4" />
              {starting ? "Iniciando…" : "Treinar favoritos"}
            </Button>
          )}
        </div>
      </div>

      {favorites === undefined ? (
        <div className="panel p-10 text-center text-sm text-muted-foreground">
          carregando…
        </div>
      ) : favorites.length === 0 ? (
        <div className="panel p-10 text-center">
          <Star className="mx-auto size-10 text-muted-foreground" />
          <p className="mt-4 font-semibold">Nenhum favorito ainda</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Durante uma sessão de treino, toque em "Favoritar" para guardar
            questões importantes.
          </p>
          <Button variant="outline" asChild className="mt-4">
            <Link to="/app/questions/create">Criar uma sessão</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {favorites.map((fav) => (
            <div
              key={fav.favoriteId}
              className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="chip">{fav.subjectName}</span>
                  {fav.examName && <span className="chip">{fav.examName}</span>}
                </div>
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed">
                  {fav.statement}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => unfavorite(fav.questionId)}
                title="Remover dos favoritos"
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
