"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSignup(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }

    // Se o projeto estiver com "Confirm email" DESATIVADO, já há sessão e podemos chamar o RPC agora.
    if (data.session) {
      const { error: rpcError } = await supabase.rpc("bootstrap_tenant_and_admin", {
        p_tenant_name: "Escola do Novo Cliente",
      });
      setLoading(false);
      if (rpcError) {
        setError(`Falha ao criar tenant/admin: ${rpcError.message}`);
        return;
      }
      alert("Cadastro concluído! Você já é admin do seu tenant.");
      // como admin, pode ir direto para a área logada:
      router.push("/alunos");
      return;
    }

    // Se "Confirm email" estiver ATIVADO (sem sessão aqui), só avise e mande logar:
    setLoading(false);
    alert("Usuário criado! Confirme o email (se exigido) e faça login. Ao entrar a gente provisiona o tenant.");
    router.push("/login");
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
      <form onSubmit={handleSignup} style={{ border: "1px solid #ccc", padding: 32, borderRadius: 12, minWidth: 320 }}>
        <h2>Cadastro (novo cliente)</h2>
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
        <button type="submit" style={{ width: "100%", padding: 10 }} disabled={loading}>
          {loading ? "Cadastrando..." : "Cadastrar"}
        </button>
        {error && <div style={{ color: "red", marginTop: 12 }}>{error}</div>}
      </form>
    </div>
  );
}
