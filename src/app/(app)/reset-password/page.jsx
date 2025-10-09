"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function parseHash() {
  if (typeof window === "undefined") return {};
  const hash = window.location.hash.replace(/^#/, "");
  const p = new URLSearchParams(hash);
  return {
    access_token: p.get("access_token"),
    refresh_token: p.get("refresh_token"),
    type: p.get("type"), // should be "recovery"
  };
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const { access_token, refresh_token } = parseHash();
    // seta a sessão a partir do link do e-mail
    if (access_token && refresh_token) {
      supabase.auth.setSession({ access_token, refresh_token })
        .then(() => setReady(true))
        .catch((e) => setMsg(e.message || String(e)));
    } else {
      setMsg("Link inválido ou expirado. Solicite novamente a recuperação de senha.");
    }
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    if (pwd.length < 8) return setMsg("A nova senha deve ter pelo menos 8 caracteres.");
    if (pwd !== pwd2) return setMsg("As senhas não coincidem.");
    try {
      setSubmitting(true);
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
      setMsg("Senha alterada com sucesso! Redirecionando…");
      setTimeout(() => router.replace("/login"), 1200);
    } catch (err) {
      setMsg(err.message || String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow">
        <h1 className="text-xl font-semibold mb-2">Redefinir senha</h1>
        {!ready ? (
          <p className="text-sm text-slate-600">Validando link… {msg && <span className="text-rose-600">{msg}</span>}</p>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-3">
            <div>
              <label className="block text-sm mb-1">Nova senha</label>
              <input
                type="password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                className="w-full border rounded px-3 py-2"
                minLength={8}
                required
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Confirmar nova senha</label>
              <input
                type="password"
                value={pwd2}
                onChange={(e) => setPwd2(e.target.value)}
                className="w-full border rounded px-3 py-2"
                minLength={8}
                required
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-black text-white px-4 py-2 disabled:opacity-60"
            >
              {submitting ? "Salvando…" : "Definir nova senha"}
            </button>
            {msg && <p className="text-sm text-rose-600">{msg}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
