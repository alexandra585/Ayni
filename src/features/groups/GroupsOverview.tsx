"use client";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { APP_MODE } from "@/config/app";
import { groupStatusText, isAdmin, isP, KIND, myGroupIds } from "@/domain/model";
import type { Group } from "@/domain/types";
import { useAyni } from "@/store/ayni";

export function groupRoleTag(g: Group) {
  if (isP(g)) return g.visibility === "publico" ? <span className="gtag pub">Público</span> : <span className="gtag priv">Privado</span>;
  return isAdmin(g) ? <span className="gtag tes">Tesorero</span> : <span className="gtag par">Participante</span>;
}

/** /groups — "Mis grupos" */
export function GroupsOverview() {
  const router = useRouter();
  const s = useAyni((x) => x.s);
  const ids = myGroupIds(s);
  return (
    <div className="groups-page">
      <div className="groups-page-head">
        <div>
          <p className="eyebrow">Grupos</p>
          <h1>Mis grupos</h1>
          <p>Selecciona un grupo para ver su información, aportes y miembros.</p>
        </div>
      </div>
      {ids.length ? (
        <div className="group-card-grid">
          {ids.map((id) => {
            const g = s.groups[id];
            const nature = "nature" in g && g.nature ? g.nature : KIND[g.kind].label;
            return (
              <button key={id} className="group-card" type="button" data-open-group={id} onClick={() => router.push("/groups/" + id)}>
                <div>
                  <p className="eyebrow">{nature}</p>
                  <h3>{g.name}</h3>
                  <p className="caption" style={{ marginTop: 4 }}>{groupStatusText(g)}</p>
                  <div className="group-card-meta">{groupRoleTag(g)}</div>
                </div>
                <span className="group-card-arrow" aria-hidden="true">›</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="empty">
          <Icon name="users" />
          <h2>Aún no estás en ningún grupo</h2>
          <p>Usa las opciones de “Grupos” en el menú lateral para crear uno nuevo o unirte con un código.</p>
        </div>
      )}
      {APP_MODE === "demo" ? (
        <p className="mode" style={{ maxWidth: 520 }}>Modo demo: todo vive en esta pestaña y se reinicia al recargar. Pagos simulados.</p>
      ) : null}
    </div>
  );
}
