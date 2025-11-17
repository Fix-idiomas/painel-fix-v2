"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Carregando…</div>}>
      <LoginInner />
    </Suspense>
  );
}

export const dynamic = "force-dynamic";

function LoginInner() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  // estado do fluxo "Esqueci minha senha"
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotMsg, setForgotMsg] = useState("");

  const router = useRouter();
  const searchParams = useSearchParams();

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setError(error.message);
      setUser(null);
      return;
    }

    setUser(data.user);

    // valida/bootstrapa tenant
    const { data: tData, error: tErr } = await supabase.rpc("current_tenant_id");
    if (tErr) {
      setLoading(false);
      setError("Falha ao validar tenant: " + tErr.message);
      return;
    }
    if (!tData) {
      // Sem tenant configurado ainda → leva para o onboarding, que executa o RPC
      setLoading(false);
      router.replace("/onboarding");
      router.refresh();
      return;
    }

    const next = searchParams?.get("next") || "/recepcao";
    router.replace(next);
    router.refresh();
  }

  async function handleLogout() {
    setLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setLoading(false);
    router.push("/login");
  }

  // -------- Esqueci minha senha --------
  async function handleForgot(e) {
    e?.preventDefault?.();
    try {
      setForgotSending(true);
      setForgotMsg("");

      const emailToSend = (forgotEmail || email || "").trim();
      if (!emailToSend) throw new Error("Informe seu e-mail.");

      // Define a URL que o Supabase deve abrir após o clique no e-mail
      // Garanta que essa URL esteja cadastrada em Authentication » URL Configuration » Redirect URLs
      const origin =
        typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
      const redirectTo = `${origin}/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(emailToSend, { redirectTo });
      if (error) throw error;

      setForgotMsg("Se o e-mail existir, enviamos um link de recuperação.");
    } catch (err) {
      setForgotMsg(err.message || String(err));
    } finally {
      setForgotSending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-b from-slate-50 to-white">
      <div className="w-full max-w-md">
        {/* Logo / Marca */}
        <div className="flex flex-col items-center mb-6">
          <img
            src="/logo.png"
            alt="DASH — Sistema de Gestão"
            className="h-32 md:h-32 w-auto opacity-90"
          />
        </div>

        {/* Card de login */}
        <div className="bg-white/90 backdrop-blur border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">Login</h2>

          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-slate-300"
                required
              />
            </div>

            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha"
                className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-slate-300"
                required
              />
            </div>

            <div className="flex items-center justify-between">
              <span />
              <button
                type="button"
                onClick={() => {
                  setForgotOpen(true);
                  setForgotEmail(email); // pré-preenche com o que já digitou
                }}
                className="text-xs text-slate-600 hover:underline"
              >
                Esqueci minha senha
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-black text-white px-4 py-2 disabled:opacity-60"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>

            {error && <div className="text-red-600 text-sm mt-2">{error}</div>}
          </form>

          <div className="mt-3 text-xs text-slate-600 text-center">
            Ainda não tem conta?{' '}
            <Link href="/signup" className="underline hover:opacity-80">Criar conta</Link>
          </div>
        </div>

        {/* Rodapé opcional */}
        <div className="mt-4 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} DASH • Sistema de Gestão
        </div>
      </div>

      {/* Modal: Esqueci minha senha */}
      {forgotOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center px-4">
          <form
            onSubmit={handleForgot}
            className="w-full max-w-md rounded-xl bg-white p-6 shadow border border-slate-200"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-semibold">Recuperar senha</h3>
              <button
                type="button"
                onClick={() => {
                  if (forgotSending) return;
                  setForgotOpen(false);
                  setForgotMsg("");
                }}
                className="text-slate-500 hover:text-slate-700"
                aria-label="Fechar"
                title="Fechar"
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-slate-600 mb-3">
              Informe seu e-mail. Enviaremos um link para você redefinir a senha.
            </p>

            <input
              type="email"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-slate-300"
              required
            />

            {forgotMsg && (
              <div className="text-xs mt-2 {forgotSending ? 'text-slate-600' : 'text-red-600'}">
                {forgotMsg}
              </div>
            )}

            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  if (forgotSending) return;
                  setForgotOpen(false);
                  setForgotMsg("");
                }}
                className="px-3 py-2 border rounded"
                disabled={forgotSending}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-3 py-2 border rounded bg-black text-white disabled:opacity-60"
                disabled={forgotSending}
              >
                {forgotSending ? "Enviando…" : "Enviar link"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
