"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
// ADD
import { User, ChevronDown, IdCard, LogOut } from "lucide-react";


export default function UserMenu() {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);

  // fecha ao clicar fora
  useEffect(() => {
    function onDocClick(e) {
      if (!open) return;
      if (
        popRef.current &&
        !popRef.current.contains(e.target) &&
        btnRef.current &&
        !btnRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    function onEsc(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded border px-3 py-1.5 text-sm hover:bg-neutral-50"
        title="Conta"
      >
        <User className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Conta</span>
        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={popRef}
          role="menu"
          aria-label="Menu do usuário"
          className="absolute right-0 mt-2 w-44 overflow-hidden rounded-md border bg-white shadow-lg z-50"
        >
          <Link
            href="/conta"
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-50"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <IdCard className="h-4 w-4" aria-hidden="true" />
            Minha conta
          </Link>

          {/* Divisor */}
          <div className="my-1 h-px bg-[var(--fix-border)]" />

          {/* Mantém o POST para logout seguro */}
          <form action="/api/mock-logout" method="post" role="none">
            <button
              type="submit"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50"
              role="menuitem"
            >
              < LogOut className="h-4 w-4" aria-hidden="true" />
              Sair
            </button>
          </form>
        </div>
      )}
    </div>
  );
}