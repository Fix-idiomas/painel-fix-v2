"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/contexts/SessionContext";

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
  const { session } = useSession();

  // Derivados 100% do backend (sem papel simulado na UI)
  const isOwner =
    !!(session?.tenant && session?.user && session.tenant.owner_user_id === session.user.id);
  const claim   = session?.claim || null; // ex.: { role:'admin'|'user', perms:{ classes:{read,write}, finance:{read,write} } }
  const isAdmin = isOwner || claim?.role === "admin";
  const perms   = (claim && claim.perms) || {};

  // Visibilidade baseada em perms reais; com fallback seguro enquanto sessão/claim não carregam
  function computeVisibleKeys() {
    // Fallback: enquanto não carregou, mostra TODAS as abas (compatível com seu comportamento atual)
    if (!session || (!claim && !isOwner)) return TABS.map(t => t.key); // fallback


    if (isAdmin) return TABS.map(t => t.key); // admin/owner vê tudo

    const keys = new Set(["home", "relatorios"]); // básicos
    if (perms?.classes?.read) {
      keys.add("turmas");
      keys.add("agenda");
      // se quiser liberar "cadastro" para quem gerencia turmas, descomente:
      // keys.add("cadastro");
    }
    if (perms?.finance?.read) {
      keys.add("financeiro");
    }
    return Array.from(keys);
  }

  const visibleKeys = computeVisibleKeys();
  const visibleTabs = TABS.filter(t => visibleKeys.includes(t.key));

  return (
    <div className="w-full border-b bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2">
        <nav className="flex flex-wrap gap-2">
          {visibleTabs.map(tab => {
            const active =
              pathname === tab.href || pathname.startsWith(tab.href + "/");
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

        {/* Badge informativo + link Conta (sem seletor de papel) */}
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-gray-500 sm:inline">
            {session?.user?.email ?? "—"} • {isOwner ? "admin (owner)" : (claim?.role ?? "user")}
          </span>
          <Link href="/conta" className="px-2 py-1 hover:underline">
            Minha Conta
          </Link>
        </div>
      </div>
    </div>
  );
}
// Visibilidade por papel