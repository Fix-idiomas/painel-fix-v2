"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

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
        <span className="i-lucide-user h-4 w-4" />
        <span className="hidden sm:inline">Conta</span>
        <span className={`i-lucide-chevron-down h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
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
            <span className="i-lucide-id-card h-4 w-4" />
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
              <span className="i-lucide-log-out h-4 w-4" />
              Sair
            </button>
          </form>
        </div>
      )}
    </div>
  );
}