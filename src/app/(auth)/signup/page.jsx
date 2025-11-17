"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSignup(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Validações básicas de UX
    if ((password || "").length < 8) {
      setLoading(false);
      setError("Senha precisa ter ao menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setLoading(false);
      setError("As senhas não coincidem.");
      return;
    }

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }

    if (data.session) {
      const { error: rpcError } = await supabase.rpc("bootstrap_tenant_and_admin", {
        p_tenant_name: "Escola do Novo Cliente",
        p_display_name: email || "Admin",
      });
      setLoading(false);
      if (rpcError) {
        setError(`Falha ao criar tenant/admin: ${rpcError.message}`);
        return;
      }
      router.push("/alunos");
      return;
    }

    setLoading(false);
    router.push("/login");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-b from-slate-50 to-white">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <img src="/logo.png" alt="DASH — Sistema de Gestão" className="h-32 md:h-32 w-auto opacity-90" />
        </div>

        <div className="bg-white/90 backdrop-blur border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">Criar conta</h2>

          <form onSubmit={handleSignup} className="space-y-3">
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-slate-300"
                required
                autoComplete="email"
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
                minLength={8}
                autoComplete="new-password"
              />
              <p className="text-[11px] text-slate-500 mt-1">Mínimo 8 caracteres.</p>
            </div>

            <div>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirmar senha"
                className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-slate-300"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-black text-white px-4 py-2 disabled:opacity-60"
            >
              {loading ? "Cadastrando..." : "Cadastrar"}
            </button>

            {error && <div className="text-red-600 text-sm mt-2">{error}</div>}
          </form>

          <div className="mt-3 text-xs text-slate-600 text-center">
            Já tem conta?{' '}
            <Link href="/login" className="underline hover:opacity-80">Entrar</Link>
          </div>
        </div>

        <div className="mt-4 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} DASH • Sistema de Gestão
        </div>
      </div>
    </div>
  );
}
