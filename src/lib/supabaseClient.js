// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error("[supabaseClient] Faltam variáveis: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  // Em dev, falhe cedo pra não mascarar erro de config
  throw new Error("Supabase não configurado (URL/ANON)");
}

export const supabase = createClient(url, anon);

// Helper opcional: ler claims do token atual
export async function getClaims() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return null;
  const [, payload] = token.split(".");
  try {
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch (e) {
    console.warn("[getClaims] erro ao decodificar payload:", e?.message);
    return null;
  }
}
