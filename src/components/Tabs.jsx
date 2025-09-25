"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/contexts/SessionContext";

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
  const { ready, isAdmin, perms, session } = useSession();

  function computeVisibleKeys() {
    // Fallback seguro enquanto a sessão não estiver pronta
    if (!ready) return ["home"]; // ou ["home","relatorios"] se preferir

    // Admin/owner vê tudo
    if (isAdmin) return TABS.map(t => t.key);

    const keys = new Set(["home", "relatorios"]); // básicos
    if (perms?.classes?.read) {
      keys.add("turmas");
      keys.add("agenda");
      // NÃO liberar "cadastro" aqui para não vazar Cadastros por perm de classes
    }
    if (perms?.finance?.read) keys.add("financeiro");

    // Quando houver perms.registry no token:
    // if (perms?.registry?.read) keys.add("cadastro");

    return Array.from(keys);
  }

  const visibleKeys = computeVisibleKeys();
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

        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-gray-500 sm:inline">
            {session?.name ?? session?.userId ?? "—"} • {isAdmin ? "admin" : "user"}
          </span>
          <Link href="/conta" className="px-2 py-1 hover:underline">Minha Conta</Link>
        </div>
      </div>
    </div>
  );
}
