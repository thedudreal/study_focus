import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="font-mono-tech text-7xl font-bold text-primary">404</p>
      <h1 className="mt-4 text-2xl font-semibold">Página não encontrada</h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        O endereço que você tentou abrir não existe ou foi movido.
      </p>
      <div className="mt-6 flex gap-3">
        <Button asChild>
          <Link to="/app">Ir para o painel</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/">Página inicial</Link>
        </Button>
      </div>
    </main>
  );
}
