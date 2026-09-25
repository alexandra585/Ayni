"use client";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { groupIds, isMember, isP } from "@/domain/model";
import type { PanderoGroup } from "@/domain/types";
import { fdate, xlm } from "@/lib/format";
import { useAyni } from "@/store/ayni";
import { useUi } from "@/store/ui";

const PHASE_ORDER = { reclutando: 0, espera: 1, juego: 2, terminado: 3 } as const;

/** /forum — Panderos públicos. Los privados no aparecen: solo se entra con su código. */
export function ForumScreen() {
  const router = useRouter();
  const s = useAyni((x) => x.s);
  const open = useUi((u) => u.open);
  const ids = groupIds(s)
    .filter((id) => {
      const g = s.groups[id];
      return isP(g) && g.visibility === "publico" && !g.archived;
    })
    .sort((a, b) => PHASE_ORDER[(s.groups[a] as PanderoGroup).phase] - PHASE_ORDER[(s.groups[b] as PanderoGroup).phase]);

  return (
    <>
      <div className="forum-head">
        <div>
          <p className="eyebrow">Foro público</p>
          <h1>Panderos abiertos</h1>
          <p className="muted">Panderos públicos publicados en Ayni. Los privados no aparecen: solo se entra con su código.</p>
        </div>
        <button className="btn btn-primary" id="fo-new" onClick={() => router.push("/groups/new?kind=pandero")}><Icon name="plus" />Publicar un pandero</button>
      </div>
      <div className="forum">
        {ids.map((id) => {
          const g = s.groups[id] as PanderoGroup;
          const n = Object.keys(g.members).length;
          const mem = isMember(g);
          const stBadge = {
            reclutando: <Badge tone="pending" icon="users">Faltan {g.capacity - n}</Badge>,
            espera: <Badge tone="neutral">Completo · empieza el {fdate(g.startDate)}</Badge>,
            juego: <Badge tone="locked" icon="lock">En juego · ronda {g.round}</Badge>,
            terminado: <Badge tone="neutral">Terminado</Badge>,
          }[g.phase];
          return (
            <article className="pcardf" key={id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                {stBadge}
                {mem ? <span className="you">Estás dentro</span> : null}
              </div>
              <h3>{g.name}</h3>
              <p className="caption">Publicado por {g.creator === "me" ? s.me!.name + " (tú)" : g.creatorName} · {fdate(g.createdAt)}</p>
              <div className="figs">
                <div><b>{xlm(g.cuota)}</b><span>aporte mensual</span></div>
                <div><b>{xlm(g.cuota * g.capacity)}</b><span>pozo por ronda</span></div>
              </div>
              <div className="progress" aria-label={n + " de " + g.capacity + " participantes"} role="img" style={{ margin: 0 }}>
                <span style={{ width: Math.round((n / g.capacity) * 100) + "%" }} />
              </div>
              <p className="caption">{n} de {g.capacity} participantes · {g.capacity} meses</p>
              <div className="foot">
                {mem ? (
                  <button className="btn btn-secondary btn-sm" data-open={id} onClick={() => router.push("/groups/" + id)}>Ver mi pandero</button>
                ) : g.phase === "reclutando" ? (
                  <button className="btn btn-primary btn-sm" data-joinp={id} onClick={() => open({ t: "terms", id })}>Ver términos y unirme</button>
                ) : (
                  <span className="caption">Ya no acepta participantes</span>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <p className="fine" style={{ paddingBottom: 48 }}>Al unirte debes aceptar los términos y condiciones: el aporte se debita de tu billetera automáticamente al iniciar cada ronda.</p>
    </>
  );
}
