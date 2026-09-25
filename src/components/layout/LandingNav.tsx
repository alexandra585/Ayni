"use client";
import { usePathname, useRouter } from "next/navigation";
import { LogoMark } from "@/components/ui/Logo";
import { Icon } from "@/components/ui/Icon";
import { unreadCount } from "@/domain/actions";
import { initials } from "@/lib/format";
import { useAyni } from "@/store/ayni";
import { useUi } from "@/store/ui";

export function LandingNav() {
  const router = useRouter();
  const pathname = usePathname();
  const me = useAyni((st) => st.s.me);
  const unread = useAyni((st) => unreadCount(st.s));
  const openModal = useUi((u) => u.open);

  const jump = (id: string) => {
    if (pathname === "/") document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    else router.push("/#" + id);
  };

  return (
    <header className="nav">
      <div className="wrap">
        <button className="brand" id="go-home" aria-label="Ayni, inicio" onClick={() => router.push("/")}>
          <LogoMark />
          Ayni
        </button>
        <nav className="nav-links" aria-label="Principal">
          <button className="btn btn-ghost btn-sm hide-sm" onClick={() => jump("como")}>Cómo funciona</button>
          <button className="btn btn-ghost btn-sm hide-sm" onClick={() => jump("wallets")}>Pagos y wallets</button>
          {me ? (
            <>
              <button
                id="bell"
                className="bell"
                onClick={() => openModal({ t: "notifs" })}
                aria-label={"Notificaciones" + (unread ? ", " + unread + " sin leer" : "")}
              >
                <Icon name="bell" />
                {unread ? <span className="cnt">{unread > 9 ? "9+" : unread}</span> : null}
              </button>
              <button id="go-app" className="me-chip" aria-label="Abrir mi cuenta" onClick={() => router.push("/groups")}>
                <span className="avatar">{initials(me.name)}</span>
                {me.name.split(" ")[0]}
              </button>
            </>
          ) : (
            <button id="go-app" className="btn btn-primary btn-sm" aria-label="Abrir mis grupos" onClick={() => router.push("/login")}>
              Abrir mis grupos
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
