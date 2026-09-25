"use client";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useCavos } from "@cavos/kit/react";
import { useAyni } from "@/store/ayni";
import { useUi } from "@/store/ui";

/**
 * Sesión de la app. En modo demo la sesión vive en memoria (store).
 * En modo supabase, `signOut` además cierra la sesión de Supabase Auth (ver features/auth/supabase-auth.ts).
 */
export function useSession() {
  const router = useRouter();
  const { logout: logoutCavos } = useCavos();
  const logout = useAyni((s) => s.logout);
  const setLoggingOut = useUi((u) => u.setLoggingOut);

  const signOut = useCallback(async () => {
    if (useUi.getState().loggingOut) return;
    setLoggingOut(true);
    let stage: "cavos" | "supabase" = "cavos";
    try {
      const { APP_MODE } = await import("@/config/app");
      if (APP_MODE === "supabase") {
        await logoutCavos();
        stage = "supabase";
        const { signOutSupabase } = await import("./supabase-auth");
        await signOutSupabase();
      }
      useUi.getState().close();
      logout();
      router.replace("/login");
      setTimeout(() => setLoggingOut(false), 300);
    } catch {
      setLoggingOut(false);
      useUi.getState().toast(stage === "cavos"
        ? "No se pudo cerrar la sesión Cavos. No se cerró Supabase. Reintenta antes de cambiar de usuario."
        : "Cavos se desconectó, pero no se pudo cerrar Supabase. Reintenta cerrar sesión.");
    }
  }, [logoutCavos, logout, router, setLoggingOut]);

  return { signOut };
}
