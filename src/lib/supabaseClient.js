// src/lib/supabaseClient.js
import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error('[supabaseClient] Faltam variáveis: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  throw new Error('Supabase não configurado (URL/ANON)');
}

// createBrowserSupabaseClient garante integração com cookies para middleware/server components
export const supabase = createBrowserSupabaseClient({ supabaseUrl: url, supabaseKey: anon });

// Helper opcional: ler claims do token atual
export async function getClaims() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return null;
  const [, payload] = token.split('.');
  try {
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch (e) {
    console.warn('[getClaims] erro ao decodificar payload:', e?.message);
    return null;
  }
}
