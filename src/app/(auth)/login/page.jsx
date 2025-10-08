"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
      const { error: bootErr } = await supabase.rpc("bootstrap_tenant_and_admin", {
        p_tenant_name: "Escola (novo cliente)",
      });
      if (bootErr) {
        setLoading(false);
        setError("Falha ao criar tenant: " + bootErr.message);
        return;
      }
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

        <button type="submit" style={{ width: "100%", padding: 10, marginTop: 8 }} disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>

        {error && <div style={{ color: "red", marginTop: 12 }}>{error}</div>}

       
      </form>
    </div>
  );
}