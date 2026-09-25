"use client";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { LogoMark } from "@/components/ui/Logo";
import { unreadCount } from "@/domain/actions";
import { initials } from "@/lib/format";
import { useAyni } from "@/store/ayni";
import { useUi } from "@/store/ui";
import { useSession } from "@/features/auth/useSession";

/** Barra lateral del portal (mismo markup y clases que el prototipo). */
export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const me = useAyni((st) => st.s.me);
  const unread = useAyni((st) => unreadCount(st.s));
  const openModal = useUi((u) => u.open);
  const { signOut } = useSession();

  const inGroups = pathname.startsWith("/groups");
  const isCreate = pathname === "/groups/new" || /^\/groups\/[^/]+\/created$/.test(pathname);
  const isJoin = pathname === "/groups/join";
  const isList = inGroups && !isCreate && !isJoin;

  const unreadLabel = "Notificaciones" + (unread ? ", " + unread + " sin leer" : "");
  const cur = (on: boolean) => (on ? "page" : "false");

  return (
    <aside className="portal-sidebar" id="portal-sidebar" aria-label="Navegación principal de Ayni">
      <button className="portal-brand" id="app-home" type="button" aria-label="Volver al inicio de Ayni" onClick={() => router.push("/")}>
        <LogoMark size={25} />
        Ayni
      </button>
      <p className="portal-nav-title">Navegación</p>
      <nav className="portal-menu" aria-label="Secciones" id="tabs">
        <button
          className="portal-menu-item"
          id="tab-grupos"
          type="button"
          aria-expanded={inGroups}
          aria-controls="groups-subnav"
          aria-current={cur(inGroups)}
          onClick={() => router.push("/groups")}
        >
          <span className="portal-nav-icon"><Icon name="users" /></span>
          <span>Grupos</span>
          <span className="portal-chevron" aria-hidden="true">⌃</span>
        </button>
        {inGroups ? (
          <div className="portal-subnav" id="groups-subnav" aria-label="Opciones de grupos">
            <button className="portal-subitem" type="button" id="sub-my-groups" aria-current={cur(isList)} onClick={() => router.push("/groups")}>Mis grupos</button>
            <button className="portal-subitem" type="button" id="sub-create-group" aria-current={cur(isCreate)} onClick={() => router.push("/groups/new")}>Crear nuevo grupo</button>
            <button className="portal-subitem" type="button" id="sub-join-group" aria-current={cur(isJoin)} onClick={() => router.push("/groups/join")}>Unirme a un grupo</button>
          </div>
        ) : null}
        <button className="portal-menu-item" id="tab-foro" type="button" aria-current={cur(pathname === "/forum")} onClick={() => router.push("/forum")}>
          <span className="portal-nav-icon"><Icon name="globe" /></span>
          <span>Foro de panderos</span>
        </button>
        <button className="portal-menu-item" id="tab-billetera" type="button" aria-current={cur(pathname === "/wallet")} onClick={() => router.push("/wallet")}>
          <span className="portal-nav-icon"><Icon name="wallet" /></span>
          <span>Billetera</span>
        </button>
        <button className="portal-menu-item" id="sidebar-notifs" type="button" aria-label={unreadLabel} onClick={() => openModal({ t: "notifs" })}>
          <span className="portal-nav-icon"><Icon name="bell" /></span>
          <span>Notificaciones</span>
          {unread ? <span className="portal-nav-count" id="sidebar-notif-count">{unread > 9 ? "9+" : unread}</span> : null}
        </button>
        <button className="portal-menu-item" id="tab-perfil" type="button" aria-current={cur(pathname === "/profile")} onClick={() => router.push("/profile")}>
          <span className="portal-nav-icon"><Icon name="finger" /></span>
          <span>Perfil</span>
        </button>
      </nav>
      <div className="portal-user">
        <div className="portal-user-card">
          <span className="avatar" id="sidebar-avatar" aria-hidden="true">{me ? initials(me.name) : "?"}</span>
          <div>
            <b id="sidebar-user-name">{me ? me.name : "Mi cuenta"}</b>
            <small>Cuenta Ayni</small>
          </div>
        </div>
        <button className="portal-logout" id="sidebar-logout" type="button" onClick={signOut}>Cerrar sesión</button>
      </div>
    </aside>
  );
}
