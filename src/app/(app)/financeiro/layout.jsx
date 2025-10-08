"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function FinanceiroLayout({ children }) {
  const pathname = usePathname();

  const items = [
    { href: "/financeiro/mensalidades", label: "Mensalidades" },
    { href: "/financeiro/gastos", label: "Gastos" },
    { href: "/financeiro/outras-receitas", label: "Outras Receitas" },
  ];

  return (
    <div className="min-h-screen">
      {/* Subnav Financeiro */}
      <div className="sticky top-0 z-10 border-b bg-white">
        <div className="mx-auto w-full max-w-6xl px-4">
          <nav className="flex gap-2 py-3">
            {items.map((it) => {
              const active = pathname.startsWith(it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={[
                    "rounded px-3 py-1.5 text-sm border",
                    active
                      ? "bg-black text-white border-black"
                      : "bg-white text-slate-700 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {it.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Conteúdo da rota filha */}
      <div className="mx-auto w-full max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}