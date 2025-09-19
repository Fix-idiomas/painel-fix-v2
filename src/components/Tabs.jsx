"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/contexts/SessionContext";

// Visibilidade por papel
const ROLE_TABS = {
  admin:      ["home", "cadastro", "turmas", "agenda",             "relatorios", "financeiro"],
  professor:  [          "turmas", "agenda",            "relatorios"],
  financeiro: ["home", "cadastro",                      "relatorios", "financeiro"]
};

// Mapa de abas → rotas
const TABS = [
  { key: "home",       label: "Início",      href: "/" },
  { key: "cadastro",   label: "Cadastro",    href: "/cadastro" },
  { key: "turmas",     label: "Turmas",      href: "/turmas" },
  { key: "agenda",     label: "Agenda",      href: "/agenda" },
  { key: "relatorios", label: "Relatórios",  href: "/relatorios" },
  { key: "financeiro", label: "Financeiro",  href: "/financeiro" },
];

export default function Tabs() {
  const pathname = usePathname();
  const { session, switchRole } = useSession();

  // Evita crash caso session ainda não esteja pronta no primeiro render
  const role = session?.role ?? "admin";

  const visibleKeys = ROLE_TABS[role] ?? [];
  const visibleTabs = TABS.filter(t => visibleKeys.includes(t.key));

  return (
    <div className="w-full border-b bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2">
        <nav className="flex flex-wrap gap-2">
          {visibleTabs.map(tab => {
            const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
            return (
              <Link
                key={tab.key}
                href={tab.href}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  active ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {/* ⚠️ MOCK ONLY — mantenha visível no desenvolvimento; remova em produção */}
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-gray-500 sm:inline">
            {session?.name ?? "Dev"} • {role}
          </span>
          <Link href="/conta" className="px-2 py-1 hover:underline">
            Minha Conta
          </Link>
          <select
            aria-label="Selecionar papel (mock)"
            className="rounded border px-2 py-1 text-sm"
            value={role}
            onChange={(e) => switchRole(e.target.value)}
          >
            <option value="admin">admin</option>
            <option value="professor">professor</option>
            <option value="financeiro">financeiro</option>
          </select>
        </div>
      </div>
    </div>
  );
}
