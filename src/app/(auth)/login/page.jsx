"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/* Exporta a página com Suspense (exige no Next 13+/15 quando usa useSearchParams) */
export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Carregando…</div>}>
      <LoginInner />
    </Suspense>
  );
}

/* Evita prerender estático que estoura no build com hooks de navegação */
export const dynamic = "force-dynamic";

/* Seu conteúdo original, intacto, só movido para um componente interno */
function LoginInner() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams(); // 👈 (opcional)

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

    // sessão criada com sucesso
    setUser(data.user);

    // 1) checar se já existe tenant provisionado para este usuário
    const { data: tData, error: tErr } = await supabase.rpc("current_tenant_id");
    if (tErr) {
      setLoading(false);
      setError("Falha ao validar tenant: " + tErr.message);
      return;
    }

    // 2) se não houver tenant ainda, fazer o bootstrap (cria tenant e promove a admin)
    if (!tData) {
      const { error: bootErr } = await supabase.rpc("bootstrap_tenant_and_admin", {
        p_tenant_name: "Escola (novo cliente)",
      });
      if (bootErr) {
        setLoading(false);
        setError("Falha ao criar tenant: " + bootErr.message);
        return;
      }
    }

    // ✅ pousar em Recepção (ou em ?next=...)
    const next = searchParams?.get("next") || "/recepcao"; // ex.: /auth/callback?next=/agenda
    router.replace(next);
    router.refresh(); // (opcional) força re-render dos Server Components
  }

  async function handleLogout() {
    setLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setLoading(false);
    router.push("/login");
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
      }}
    >
      <form
        onSubmit={handleLogin}
        style={{ border: "1px solid #ccc", padding: 32, borderRadius: 12, minWidth: 320 }}
      >
        <h2>Login</h2>

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          style={{ width: "100%", marginBottom: 12, padding: 8 }}
          required
        />

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Senha"
          style={{ width: "100%", marginBottom: 12, padding: 8 }}
          required
        />

        <button
          type="button"
          onClick={async () => {
            const { createClient } = await import("@supabase/supabase-js");
            const sb = createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL,
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
            );
            const { data } = await sb.auth.getSession();
            const tok = data?.session?.access_token;
            if (!tok) {
              alert("Sem sessão");
              return;
            }
            const [, p] = tok.split(".");
            const j = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
            alert(`role=${j.role}\ntenant_id=${j.tenant_id}\nperms=${JSON.stringify(j.perms || {})}`);
          }}
          style={{ width: "100%", marginTop: 8, padding: 10 }}
        >
          Ver claims
        </button>

        <button
          type="button"
          onClick={async () => {
            // 0) checar sessão primeiro
            const { data: s } = await supabase.auth.getSession();
            if (!s?.session?.access_token) {
              alert("Sem sessão — faça login e clique novamente.");
              return;
            }

            // 1) ler helpers do lado do servidor (RLS-context)
            const r1 = await supabase.rpc("current_role");
            const r2 = await supabase.rpc("current_tenant_id");
            const roleSrv = r1.data ?? r1?.error?.message;
            const tenantSrv = r2.data ?? r2?.error?.message;

            // 2) contar alunos
            const q = await supabase.from("students").select("id", { count: "exact", head: true });
            const count = q.count ?? 0;
            const err = q.error ? `\nqueryError=${q.error.message}` : "";

            alert(
              `SERVER current_role()=${roleSrv}\nSERVER current_tenant_id()=${tenantSrv}\nstudents.count=${count}${err}`
            );
          }}
          style={{ width: "100%", marginTop: 8, padding: 10 }}
        >
          Validar RLS (server)
        </button>

        <button type="submit" style={{ width: "100%", padding: 10, marginTop: 8 }} disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>

        {error && <div style={{ color: "red", marginTop: 12 }}>{error}</div>}

        {user && (
          <div style={{ marginTop: 12 }}>
            <strong>Usuário logado:</strong>
            <pre style={{ background: "#f6f6f6", padding: 8 }}>{JSON.stringify(user, null, 2)}</pre>
            <button type="button" onClick={handleLogout} style={{ marginTop: 12, width: "100%", padding: 10 }}>
              Sair
            </button>
          </div>
        )}
      </form>
    </div>
  );
}