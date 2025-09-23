"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);

  const [email, setEmail]             = useState("");
  const [tenantName, setTenantName]   = useState("");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          // sem sessão → volta pro login
          if (typeof window !== "undefined") window.location.href = "/login";
          return;
        }
        setEmail(user.email || "");
        // se já tiver um nome salvo no metadata, pré-preenche
        const metaName =
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          "";
        setDisplayName(metaName);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onSubmit(e) {
    e?.preventDefault?.();
    setError(null);

    const school = String(tenantName || "").trim();
    const dname  = String(displayName || "").trim();

    if (!school) { setError("Informe o nome da escola."); return; }
    if (!dname)  { setError("Informe seu nome de exibição."); return; }

    try {
      setSaving(true);

      // 1) cria o tenant + vincula o usuário atual como admin (RPC server-side)
      const { error: rpcErr } = await supabase.rpc("bootstrap_tenant_and_admin", {
        p_tenant_name: school,
        p_display_name: dname,
      });
      if (rpcErr) throw rpcErr;

      // 2) atualiza o user_metadata com o nome exibido
      const { error: updErr } = await supabase.auth.updateUser({
        data: { full_name: dname },
      });
      if (updErr) {
        // não bloqueia o fluxo por causa disso — só informa
        console.warn("Falha ao salvar nome no metadata:", updErr);
      }

      // 3) pronto → vai pro Início
      router.replace("/");
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="p-6">Carregando…</main>;
  }

  return (
    <main className="min-h-[70vh] grid place-items-center p-4">
      <div className="w-full max-w-md rounded-2xl border p-5 shadow-sm bg-white">
        <h1 className="text-xl font-semibold mb-1">Configurar sua escola</h1>
        <p className="text-sm text-slate-600 mb-4">
          Você está autenticado como <b>{email || "—"}</b>. Precisamos de duas informações
          para concluir a criação do seu espaço.
        </p>

        <form onSubmit={onSubmit} className="grid gap-3">
          <div>
            <label className="block text-sm mb-1">Nome da escola*</label>
            <input
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              className="border rounded px-3 py-2 w-full"
              placeholder="Ex.: Escola Harmonia"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Seu nome de exibição*</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="border rounded px-3 py-2 w-full"
              placeholder="Como você quer aparecer no app"
              required
            />
          </div>

          {error && (
            <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => router.replace("/")}
              className="px-3 py-2 border rounded"
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-3 py-2 border rounded bg-emerald-600 text-white disabled:opacity-50"
              disabled={saving}
            >
              {saving ? "Salvando…" : "Concluir"}
            </button>
          </div>
        </form>

        <p className="mt-4 text-xs text-slate-500">
          Obs.: esta ação cria sua escola e te torna administrador. Você poderá ajustar
          detalhes depois em <code>/conta</code>.
        </p>
      </div>
    </main>
  );
}
