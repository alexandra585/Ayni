"use client";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { unreadCount } from "@/domain/actions";
import { isMember } from "@/domain/model";
import type { NotifType } from "@/domain/types";
import { fdt } from "@/lib/format";
import { useAyni } from "@/store/ayni";
import { useUi } from "@/store/ui";

export const NICO: Record<NotifType, string> = {
  refund: "refund", eve: "cal", full: "users", closed: "lock", start: "dice", debit: "coins", nofunds: "alert", pot: "coins", owe: "alert", round: "dice", info: "bell",
};

/** Lista de notificaciones con "marcar todas como leídas" y navegación contextual. */
export function NotificationList({ inModal }: { inModal?: boolean }) {
  const router = useRouter();
  const s = useAyni((x) => x.s);
  const { markAllRead, markRead } = useAyni.getState();
  const { open, close } = useUi.getState();
  const list = s.notifs;
  const unread = unreadCount(s);

  const onItem = (i: number) => {
    const n = list[i];
    markRead(i);
    const g = n.gid ? s.groups[n.gid] : undefined;
    if (n.gid && g && g.archived) open({ t: "archived", id: n.gid });
    else if (n.gid && g && isMember(g)) { close(); router.push("/groups/" + n.gid); }
    else if (["refund", "debit", "nofunds", "pot"].includes(n.type)) { close(); router.push("/wallet"); }
    else if (inModal) open({ t: "notifs" });
  };

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="caption">{unread} sin leer</span>
        {unread ? <button className="btn btn-ghost btn-sm" id="n-all" onClick={markAllRead}>Marcar todas como leídas</button> : null}
      </div>
      <ul className="nlist" style={inModal ? undefined : { margin: "12px -20px 0", maxHeight: "none" }}>
        {list.length ? (
          list.map((n, i) => (
            <li key={n.key}>
              <button className={"nitem" + (n.read ? "" : " unread")} data-n={i} onClick={() => onItem(i)} style={inModal ? undefined : { paddingInline: 20 }}>
                <span className={"ni " + n.type}><Icon name={NICO[n.type] || "bell"} /></span>
                <span><b>{n.title}</b><p>{n.body}</p></span>
                <time>{fdt(n.at)}</time>
              </button>
            </li>
          ))
        ) : (
          <li style={{ padding: 24 }}><p className="caption">No tienes notificaciones.</p></li>
        )}
      </ul>
    </>
  );
}
