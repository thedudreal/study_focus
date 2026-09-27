import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Database } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

/**
 * Popula o catálogo com o conteúdo de demonstração ([DEMO] ENEM).
 * Idempotente: nada acontece se o catálogo já tiver sido semeado.
 */
export function DemoSeedButton({ label = "Carregar catálogo de demonstração" }: { label?: string }) {
  const runSeed = useAction(api.seed.runDemoSeed);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const result = await runSeed({});
      if (result.seeded) {
        toast.success(
          `Catálogo criado: ${result.questionsCreated ?? 0} questões demo publicadas.`,
        );
        window.location.reload();
      } else {
        toast.info(result.reason ?? "Catálogo já existente.");
        setLoading(false);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Falha ao popular o catálogo.",
      );
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" onClick={handleClick} disabled={loading}>
      <Database className="size-4" />
      {loading ? "Populando…" : label}
    </Button>
  );
}
