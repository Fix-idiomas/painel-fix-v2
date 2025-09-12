import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  // Evita quebrar em dev se variável faltar
  console.warn("[supabaseClient] Variáveis NEXT_PUBLIC_SUPABASE_URL/ANON_KEY não definidas.");
}

export const supabase = createClient(url || "", anon);
