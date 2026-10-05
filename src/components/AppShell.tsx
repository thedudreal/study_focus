import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Home,
  Layers,
  Flame,
  Trophy,
  User,
  LogOut,
  History,
} from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router";

const NAV_ITEMS = [
  { to: "/app", label: "Início", icon: Home, end: true },
  { to: "/app/questions", label: "Questões", icon: Layers, end: false },
  { to: "/app/today", label: "Hoje", icon: Flame, end: false },
  { to: "/app/history", label: "Histórico", icon: History, end: false },
  { to: "/app/ranking", label: "Ranking", icon: Trophy, end: false },
  { to: "/app/profile", label: "Perfil", icon: User, end: false },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="relative z-10 min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
          <NavLink to="/app" className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded bg-primary font-mono-tech text-xs font-bold text-primary-foreground">
              SF
            </span>
            <span className="font-mono-tech text-sm font-semibold tracking-tight">
              StudyFocus
            </span>
          </NavLink>

          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <span className="flex size-6 items-center justify-center rounded-full bg-secondary font-mono-tech text-[10px] font-semibold">
                    {(user?.name ?? user?.email ?? "?").slice(0, 2).toUpperCase()}
                  </span>
                  <span className="hidden max-w-32 truncate sm:inline">
                    {user?.name ?? user?.email ?? "Conta"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="font-mono-tech text-xs">
                  {user?.email ?? "usuário anônimo"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/app/profile")}>
                  <User className="size-4" />
                  Perfil
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="size-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Navegação mobile */}
        <nav className="flex items-center gap-1 overflow-x-auto border-t border-border px-4 py-1.5 md:hidden">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-xs transition-colors ${
                  isActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground"
                }`
              }
            >
              <item.icon className="size-3.5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        {children}
      </main>

      <footer className="border-t border-border py-6">
        <p className="text-center font-mono-tech text-xs text-muted-foreground">
          StudyFocus · preparação baseada em questões
        </p>
      </footer>
    </div>
  );
}
