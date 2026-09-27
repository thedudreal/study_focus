import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { ShieldCheck } from "lucide-react";

const ADMIN_TABS = [
  { to: "/app/admin", label: "Questões", end: true },
  { to: "/app/admin/import", label: "Importar CSV", end: false },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow flex items-center gap-1.5 text-primary">
            <ShieldCheck className="size-3.5" />
            área restrita · admin
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Banco de questões
          </h1>
        </div>
        <nav className="flex items-center gap-1">
          {ADMIN_TABS.map((tab) => {
            const active = tab.end
              ? location.pathname === tab.to
              : location.pathname.startsWith(tab.to);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}
