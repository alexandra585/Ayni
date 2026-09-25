"use client";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useAyni } from "@/store/ayni";
import { useUi } from "@/store/ui";

/**
 * Sesión de la app. En modo demo la sesión vive en memoria (store).
 * En modo supabase, `signOut` además cierra la sesión de Supabase Auth (ver features/auth/supabase-auth.ts).
 */
export function useSession() {
  const router = useRouter();
  const logout = useAyni((s) => s.logout);
  const setLoggingOut = useUi((u) => u.setLoggingOut);

  const signOut = useCallback(async () => {
    setLoggingOut(true);
    const { APP_MODE } = await import("@/config/app");
    if (APP_MODE === "supabase") {
      const { signOutSupabase } = await import("./supabase-auth");
      await signOutSupabase();
    }
    logout();
    router.replace("/login");
    setTimeout(() => setLoggingOut(false), 300);
  }, [logout, router, setLoggingOut]);

  return { signOut };
}
