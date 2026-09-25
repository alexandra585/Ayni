"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAyni } from "@/store/ayni";
import { useUi } from "@/store/ui";
import { Sidebar } from "./Sidebar";

/** Contenedor autenticado: sidebar fija + contenido a ancho completo (sin contenedores globales). */
export function PortalShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const me = useAyni((s) => s.s.me);
  const checkTimed = useAyni((s) => s.checkTimed);
  const loggingOut = useUi((u) => u.loggingOut);
  const authReady = useUi((u) => u.authReady);

  useEffect(() => {
    if (authReady && !me && !loggingOut) router.replace("/login?next=" + encodeURIComponent(pathname));
  }, [authReady, me, loggingOut, pathname, router]);

  useEffect(() => {
    if (me) checkTimed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!me]);

  if (!me) return null;
  return (
    <main id="app" data-auth="true">
      <div className="portal-shell authenticated" id="portal-shell">
        <Sidebar />
        <section className="portal-content">
          <div id="view">{children}</div>
        </section>
      </div>
    </main>
  );
}
