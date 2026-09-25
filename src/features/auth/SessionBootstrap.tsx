"use client";
import { useEffect } from "react";
import { APP_MODE } from "@/config/app";
import { useUi } from "@/store/ui";

/**
 * En modo supabase restaura la sesión (cookies SSR) y carga el snapshot antes de decidir
 * si se redirige al login. En modo demo no hace nada (authReady ya es true).
 */
export function SessionBootstrap() {
  const setAuthReady = useUi((u) => u.setAuthReady);
  useEffect(() => {
    if (APP_MODE !== "supabase") return;
    let alive = true;
    (async () => {
      try {
        const { refreshSnapshot } = await import("@/repositories/supabase");
        await refreshSnapshot();
        const { getSupabase } = await import("@/lib/supabase/client");
        getSupabase().auth.onAuthStateChange((event) => {
          if (event === "SIGNED_OUT") import("@/store/ayni").then((m) => m.useAyni.getState().logout());
        });
      } catch (e) {
        console.error("bootstrap", e);
      } finally {
        if (alive) setAuthReady(true);
      }
    })();
    return () => { alive = false; };
  }, [setAuthReady]);
  return null;
}
