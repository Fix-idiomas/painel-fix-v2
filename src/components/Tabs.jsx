"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function Tabs() {
  const pathname = usePathname();

  // rotas agrupadas dentro de "Cadastros" (hub)
  const cadastrosPaths = [
    "/cadastros",      // hub
    "/alunos",
    "/professores",
    "/pagadores",
  ];

  const isActive = (href) => {
    // para o hub: fica ativo se qualquer subrota estiver ativa
    if (href === "/cadastros") {
      return cadastrosPaths.some(
        (p) => pathname === p || pathname.startsWith(p + "/")
      );
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <nav
      aria-label="principal"
      className="mt-4 flex flex-wrap items-center gap-4 border-b border-slate-200"
    >
      <Tab href="/" active={isActive("/")}>Início</Tab>

      {/* Cadastros com dropdown (hub) */}
      <CadastrosMenu active={isActive("/cadastros")} />

      <Tab href="/financeiro" active={isActive("/financeiro")}>
        Financeiro
      </Tab>
        <Tab href="/turmas" active={isActive('/turmas')}>Turmas</Tab>

      {/* deixe os demais conforme for criando as páginas */}
      {/* <Tab href="/evolucao" active={isActive("/evolucao")}>Evolução Pedagógica</Tab>
      <Tab href="/turmas" active={isActive("/turmas")}>Turmas</Tab>
      <Tab href="/relatorios" active={isActive("/relatorios")}>Relatórios</Tab> */}
    </nav>
  );
}

function Tab({ href, active, children }) {
  return (
    <Link
      href={href}
      className={`whitespace-nowrap px-3 py-2 border-b-2 transition
        ${
          active
            ? "border-rose-600 text-rose-700 font-semibold"
            : "border-transparent text-slate-700 hover:text-rose-700"
        }`}
    >
      {children}
    </Link>
  );
}

function CadastrosMenu({ active }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // fecha ao clicar fora
  useEffect(() => {
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`px-3 py-2 border-b-2 transition inline-flex items-center gap-1
          ${
            active
              ? "border-rose-600 text-rose-700 font-semibold"
              : "border-transparent text-slate-700 hover:text-rose-700"
          }`}
        aria-haspopup="menu"
        aria-expanded={open ? "true" : "false"}
      >
        Cadastros
        <svg width="12" height="12" viewBox="0 0 20 20" className="opacity-70">
          <path d="M5 7l5 6 5-6" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 mt-2 w-64 rounded-lg border bg-white shadow z-20"
        >
          {/* Hub */}
          <MenuItem href="/cadastros">Hub de Cadastros</MenuItem>

          <div className="h-px bg-slate-100 my-1" />

          {/* Subitens */}
          <MenuItem href="/alunos">Alunos</MenuItem>
          <MenuItem href="/professores">Professores</MenuItem>
          <MenuItem href="/pagadores">Pagadores</MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({ href, children }) {
  return (
    <Link href={href} className="block px-3 py-2 hover:bg-slate-50" role="menuitem">
      {children}
    </Link>
  );
}

