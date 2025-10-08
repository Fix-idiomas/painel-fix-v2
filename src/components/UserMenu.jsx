"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { User, ChevronDown, IdCard, LogOut } from "lucide-react";

export default function UserMenu() {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const router = useRouter();
  const supabase = createClientComponentClient();

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

  async function onLogout() {
  try {
    setSigningOut(true);
    await supabase.auth.signOut();     // encerra a sessão
    window.location.href = "/login";   // 🔥 recarrega e força middleware
  } catch (e) {
    console.warn("Falha no logout:", e?.message || e);
  } finally {
    setSigningOut(false);
    setOpen(false);
  }
}
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

          <div className="my-1 h-px bg-[var(--fix-border)]" />

          <button
            type="button"
            onClick={onLogout}
            disabled={signingOut}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 disabled:opacity-60"
            role="menuitem"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {signingOut ? "Saindo…" : "Sair"}
          </button>
        </div>
      )}
    </div>
  );
}