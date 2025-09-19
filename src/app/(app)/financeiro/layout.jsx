"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SUBTABS = [
  { key: "mensalidades", label: "Mensalidades", href: "/financeiro/mensalidades" },
  { key: "gastos",       label: "Gastos",       href: "/financeiro/gastos" },
];

export default function FinanceiroLayout({ children }) {
  const pathname = usePathname();

  return (
    <div className="space-y-4">
      {/* Sub-abas locais do Financeiro */}
      <div className="w-full border-b bg-white">
        <div className="mx-auto max-w-5xl px-4 py-2">
          <nav className="flex flex-wrap gap-2">
            {SUBTABS.map((t) => {
              const active = pathname === t.href || pathname.startsWith(t.href + "/");
              return (
                <Link
                  key={t.key}
                  href={t.href}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    active ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Conteúdo da sub-rota */}
      <div className="mx-auto max-w-5xl px-4">{children}</div>
    </div>
  );
}
