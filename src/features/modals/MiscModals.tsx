"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Sheet, SheetHead } from "@/components/ui/Sheet";
import { APP_MODE } from "@/config/app";
import { termsList } from "@/domain/actions";
import { isAdmin, isP, jstats, KIND, ledgerList } from "@/domain/model";
import type { JuntaGroup, PanderoGroup } from "@/domain/types";
import { useJoinPandero } from "@/features/groups/useJoinGroup";
import { LedgerRow, downloadReport } from "@/features/ledger/shared";
import { NotificationList } from "@/features/notifications/NotificationList";
import { fdate, xlm } from "@/lib/format";
import { useAyni } from "@/store/ayni";
import { useUi } from "@/store/ui";

export function NotifsModal() {
  const { close } = useUi.getState();
  return (
    <Sheet wide onClose={close}>
      <SheetHead title="Notificaciones" onClose={close} />
      <NotificationList inModal />
    </Sheet>
  );
}

export function LedgerModal({ id }: { id: string }) {
  const { close } = useUi.getState();
  const g = useAyni((x) => x.s.groups[id]);
  const L = ledgerList(g);
  return (
    <Sheet wide onClose={close}>
      <SheetHead title={"Registro de " + g.name} onClose={close} />
      <p className="caption">{L.length} movimientos · verificables en Stellar</p>
      <ul className="ledger" style={{ margin: "12px -24px 0", maxHeight: "min(62vh,560px)", overflow: "auto" }}>
        {L.map((t) => <LedgerRow key={t.id} t={t} padded />)}
      </ul>
    </Sheet>
  );
}

/** Términos y condiciones del pandero (solo lectura desde el pandero; con aceptación al unirse). */
export function TermsModal({ id, readOnly }: { id: string; readOnly?: boolean }) {
  const router = useRouter();
  const { close } = useUi.getState();
  const g = useAyni((x) => x.s.groups[id]) as PanderoGroup;
  const joinPandero = useJoinPandero();
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true);
    const joined = await joinPandero(id);
    close();
    if (joined) router.push("/groups/" + id);
  };
  return (
    <Sheet wide onClose={close}>
      <SheetHead title="Términos y condiciones" onClose={close} />
      <p className="muted" style={{ fontSize: 14 }}>{g.name} · pandero {g.visibility === "publico" ? "público" : "privado"}</p>
      <ol className="terms">{termsList(g, APP_MODE === "supabase").map((t) => <li key={t}>{t}</li>)}</ol>
      {readOnly ? (
        <button className="btn btn-secondary btn-block" style={{ marginTop: 16 }} id="t-close" onClick={close}>Cerrar</button>
      ) : (
        <>
          <label className="check"><input type="checkbox" id="t-ok" checked={ok} onChange={(e) => setOk(e.target.checked)} />Leí y acepto los términos, incluido el débito automático de mi aporte.</label>
          <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" id="t-c" onClick={close}>Cancelar</button>
            <button className="btn btn-primary" id="t-join" disabled={!ok || busy} onClick={join}>Aceptar y unirme</button>
          </div>
        </>
      )}
    </Sheet>
  );
}

/** Resumen (solo lectura) de un grupo archivado. */
export function ArchivedModal({ id }: { id: string }) {
  const { close, open } = useUi.getState();
  const g = useAyni((x) => x.s.groups[id]);
  const P = isP(g);
  let rows: [string, string][];
  if (P) {
    const p = g as PanderoGroup;
    rows = [["Tipo", "Pandero " + (p.visibility === "publico" ? "público" : "privado")], ["Tu rol", p.creator === "me" ? "Lo creaste" : "Participante"], ["Rondas", p.capacity + " de " + p.capacity], ["Aporte mensual", xlm(p.cuota)], ["Archivado", fdate(p.archivedAt)]];
  } else {
    const j = g as JuntaGroup;
    const s = jstats(j);
    rows = [
      ["Tipo", j.nature || KIND[j.kind].label], ["Tu rol", isAdmin(j) ? "Tesorero" : "Participante"], ["Recolectado", xlm(j.releasedAmount || s.total)],
      ["Destino", j.releasedTo === "me" ? "Tu wallet" : j.releasedTo === j.creator ? "Wallet del tesorero" : "Entregado a " + (j.releasedToName || "")],
      ["Cerrado", fdate(j.releasedAt)], ["Archivado", fdate(j.archivedAt)],
    ];
  }
  return (
    <Sheet wide onClose={close}>
      <SheetHead title={g.name} onClose={close} />
      <p className="caption">Grupo archivado · solo lectura</p>
      <dl className="summary" style={{ marginTop: 12 }}>
        {rows.map((r) => <div key={r[0]}><dt>{r[0]}</dt><dd>{r[1]}</dd></div>)}
      </dl>
      <div className="row" style={{ marginTop: 20 }}>
        <button className="btn btn-secondary" id="ar-led" onClick={() => open({ t: "ledger", id })}><Icon name="doc" />Ver registro</button>
        <button className="btn btn-secondary" id="ar-rep" onClick={() => downloadReport(g)}><Icon name="doc" />Descargar reporte</button>
      </div>
    </Sheet>
  );
}
