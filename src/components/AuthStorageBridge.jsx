"use client";

import { useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { supabase as legacy } from "@/lib/supabaseClient";

export default function AuthStorageBridge() {
  useEffect(() => {
    const sb = createClientComponentClient();

    // Sincroniza no carregamento da app
    sb.auth.getSession().then(({ data }) => {
      const s = data?.session;
      if (s?.access_token && s?.refresh_token) {
        legacy.auth.setSession({
          access_token: s.access_token,
          refresh_token: s.refresh_token,
        });
      } else {
        legacy.auth.signOut();
      }
    });

    // E também a cada mudança de auth (login/logout/refresh)
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token && session?.refresh_token) {
        legacy.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
      } else {
        legacy.auth.signOut();
      }
    });

    return () => sub.subscription?.unsubscribe?.();
  }, []);

  return null;
}