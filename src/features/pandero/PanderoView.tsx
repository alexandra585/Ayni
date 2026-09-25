"use client";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { APP_MODE } from "@/config/app";
import { canAfford } from "@/domain/actions";
import { allPaid, filtered, ledgerList, mlist, mstatus, payoutDate, inviteText } from "@/domain/model";
import type { LedgerEntryWithId, MemberWithId, PanderoGroup } from "@/domain/types";
import { PanderoDemoPanel } from "@/features/demo/DemoPanels";
import { useArchiveAndGo } from "@/features/groups/nav";
import { FilterChips, downloadReport } from "@/features/ledger/shared";
import { copyText } from "@/lib/clipboard";
import { daysTo, fdate, fmt, initials, juntaDateTime, r2, short, xlm } from "@/lib/format";
import { useAyni } from "@/store/ayni";
import { useUi } from "@/store/ui";

const Money = ({ n }: { n: number }) => (<>{fmt(n)}<span className="u">XLM</span></>);
const daysText = (d: number) => (d <= 0 ? "hoy" : "en " + d + " día" + (d === 1 ? "" : "s"));

function PStatusBadge({ st }: { st: string }) {
  if (st === "paid") return <Badge tone="paid" icon="check">Aportó</Badge>;
  if (st === "nofunds") return <Badge tone="pending" icon="clock">Sin saldo</Badge>;
  if (st === "wait") return <Badge tone="neutral" icon="users">Inscrito</Badge>;
  return <Badge tone="neutral" icon="clock">Pendiente</Badge>;
}

function roundNumber(t: LedgerEntryWithId): number {
  const m = String(t.desc || "").match(/ronda\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
}
function ledgerHuman(t: LedgerEntryWithId): string {
  const d = String(t.desc || "");
  let m = d.match(/^Aporte ronda\s+(\d+)\s+de\s+(.+)$/i);
  if (m) return m[2] + " aportó a la ronda " + m[1];
  m = d.match(/^Pozo ronda\s+(\d+)\s+para\s+(.+)$/i);
  if (m) return "Pozo de la ronda " + m[1] + " para " + m[2];
  return d;
}

/** Vista del Pandero: 6 estados (reclutando, espera, ronda activa, sin saldo, ronda completa, terminado). */
export function PanderoView({ id }: { id: string }) {
  const st = useAyni((x) => x.s);
  const g = st.groups[id] as PanderoGroup;
  const me = g.members.me;
  const urgent = (g.phase === "juego" && mstatus(g, me) === "nofunds") || (g.phase === "espera" && !canAfford(st, g.cuota));

  const head = <PHeader id={id} g={g} />;
  const hero = <PHero g={g} balanceOk={canAfford(st, g.cuota)} />;
  const personal = <PMyCard id={id} g={g} />;
  const turns = <PTurns id={id} g={g} />;
  const ledger = <PLedger id={id} g={g} />;
  const archive = <PArchive id={id} g={g} />;
  const demo = APP_MODE === "demo" ? <PanderoDemoPanel id={id} /> : null;

  let body: ReactNode;
  if (g.phase === "reclutando") body = (<><PInvite id={id} g={g} focus />{hero}{personal}{turns}{ledger}{archive}{demo}</>);
  else if (urgent) body = (<><PInvite id={id} g={g} />{personal}{hero}{turns}{ledger}{archive}{demo}</>);
  else body = (<><PInvite id={id} g={g} />{hero}{personal}{turns}{ledger}{archive}{demo}</>);

  return (
    <div className="junta-page pandero-page">
      {head}
      {body}
    </div>
  );
}

function PHeader({ id, g }: { id: string; g: PanderoGroup }) {
  const open = useUi((u) => u.open);
  const mine = g.creator === "me";
  const pot = g.cuota * g.capacity;
  return (
    <header className="ghead phead">
      <div style={{ minWidth: 0 }}>
        <div className="p-chip-row">
          <span className="j-role-chip"><Icon name={g.visibility === "publico" ? "globe" : "lock"} />Pandero {g.visibility === "publico" ? "público" : "privado"}</span>
          <span className="j-role-chip"><Icon name={mine ? "shield" : "users"} />{mine ? "Lo creaste tú" : "Participante"}</span>
          <span className="j-role-chip"><Icon name="wallet" />Débito automático</span>
          {g.demo ? <span className="j-role-chip"><Icon name="spark" />Ejemplo</span> : null}
        </div>
        <h1>{g.name}</h1>
        <div className="p-head-metrics">
          <div className="p-head-metric"><small>Aporte mensual</small><b><Money n={g.cuota} /></b></div>
          <div className="p-head-metric"><small>Participantes</small><b>{g.capacity}</b></div>
          <div className="p-head-metric"><small>Pozo por ronda</small><b><Money n={pot} /></b></div>
        </div>
      </div>
      <div className="p-head-actions">
        <button className="btn btn-secondary" id="dl-report" onClick={() => downloadReport(g)}><Icon name="doc" />Reporte</button>
        <button className="p-link" id="p-terms" onClick={() => open({ t: "terms", id, readOnly: true })}>Términos</button>
      </div>
    </header>
  );
}

function RoundTrack({ g }: { g: PanderoGroup }) {
  if (g.phase === "reclutando" || g.phase === "espera") return null;
  const items: ReactNode[] = [];
  for (let i = 1; i <= g.capacity; i++) {
    const done = g.phase === "terminado" || g.payouts[i];
    const cls = done ? "done" : i === g.round ? "current" : "future";
    items.push(<span key={i} className={"p-round-dot " + cls}>{done ? <Icon name="check" /> : i}</span>);
  }
  return (
    <div className="p-hero-head">
      <div>
        <p className="p-rounds-label">Ronda {Math.min(g.round || 1, g.capacity)} de {g.capacity}</p>
        <div className="p-round-track">{items}</div>
      </div>
    </div>
  );
}

function PHero({ g, balanceOk }: { g: PanderoGroup; balanceOk: boolean }) {
  if (g.phase === "reclutando") {
    const n = Object.keys(g.members).length;
    const missing = Math.max(0, g.capacity - n);
    return (
      <section className="p-hero">
        <p className="p-amount-label">Pozo por ronda</p>
        <p className="p-amount"><Money n={g.cuota * g.capacity} /></p>
        <div className="p-state-msg wait">
          <Icon name="users" />
          <span><b>Faltan {missing} participante{missing === 1 ? "" : "s"} para empezar.</b> Cuando se completen los cupos, el ingreso se cerrará y el juego comenzará un mes después.</span>
        </div>
        <div className="p-slot-grid">
          {mlist(g).map((m) => <span key={m.id} className="p-slot full" title={m.name}>{initials(m.name)}</span>)}
          {Array.from({ length: missing }, (_, i) => <span key={"e" + i} className="p-slot empty" aria-hidden="true">+</span>)}
        </div>
        <div className="p-progress-meta" style={{ marginTop: 12 }}><span>{n} de {g.capacity} inscritos</span></div>
      </section>
    );
  }
  if (g.phase === "espera") {
    const d = daysTo(g.startDate!);
    return (
      <section className="p-hero">
        <p className="p-amount-label">Pozo por ronda</p>
        <p className="p-amount"><Money n={g.cuota * g.capacity} /></p>
        <div className="p-state-msg wait">
          <Icon name="clock" />
          <span><b>El juego empieza el {fdate(g.startDate)}.</b> El orden de turnos se sortea al iniciar. Este mes es para reunir tu aporte de {xlm(g.cuota)}.</span>
        </div>
        <div className="p-guard"><Icon name="lock" /><span><b>Fondo protegido:</b> el pozo solo se deposita al cumplirse el mes.</span></div>
        <div className="p-progress-meta"><span>Grupo completo · ingreso cerrado</span><strong>{daysText(d)}</strong></div>
        {balanceOk ? null : (
          <div className="p-state-msg danger"><span><Icon name="alert" /></span><span>Tu billetera todavía no alcanza para el primer débito automático.</span></div>
        )}
      </section>
    );
  }
  if (g.phase === "juego") {
    const pot = g.cuota * g.capacity;
    const pc = Object.keys(g.members).filter((k) => (g.members[k].paidRound || 0) >= g.round).length;
    const pct = Math.round((pc / g.capacity) * 100);
    const wid = g.order![g.round - 1];
    const w = g.members[wid];
    const pd = payoutDate(g, g.round);
    const dd = daysTo(pd);
    const full = allPaid(g);
    return (
      <section className="p-hero">
        <RoundTrack g={g} />
        <p className="p-amount-label">Pozo de la ronda actual</p>
        <p className="p-amount"><Money n={pot} /></p>
        <div className="p-recipient">
          <span className="avatar" aria-hidden="true">{initials(w.name)}</span>
          <div><b>Este mes recibe {w.name}{wid === "me" ? " (tú)" : ""}</b></div>
          <span className="p-date-chip"><Icon name="cal" />Se deposita el {fdate(pd)}</span>
        </div>
        <div className="p-progress"><span style={{ width: pct + "%" }} /></div>
        <div className="p-progress-meta"><span>{pc} de {g.capacity} ya aportaron</span><strong>{pct}%</strong></div>
        <div className="p-guard"><Icon name="lock" /><span><b>Fondo protegido:</b> el pozo solo se deposita al cumplirse el mes.</span></div>
        <div className={"p-state-msg " + (full ? "complete" : "collect")}>
          <Icon name={full ? "check" : "clock"} />
          <span>
            {full
              ? "Ronda completa. El pozo se deposita a " + w.name + (wid === "me" ? " (tú)" : "") + " el " + fdate(pd) + " (" + daysText(dd) + ")."
              : "Recolectando aportes · faltan " + (g.capacity - pc) + "."}
          </span>
        </div>
      </section>
    );
  }
  return (
    <section className="p-hero">
      <RoundTrack g={g} />
      <p className="p-amount-label">Pozo por ronda</p>
      <p className="p-amount"><Money n={g.cuota * g.capacity} /></p>
      <div className="p-state-msg complete"><Icon name="check" /><span>Se completaron las {g.capacity} rondas. El pandero terminó y todos los movimientos quedaron registrados.</span></div>
    </section>
  );
}

function PMyCard({ g }: { id: string; g: PanderoGroup }) {
  const st = useAyni((x) => x.s);
  const open = useUi((u) => u.open);
  const me = g.members.me;
  const status = mstatus(g, me);
  const mine = g.creator === "me";
  const myTurn = g.order ? g.order.indexOf("me") + 1 : 0;
  const urgent = (g.phase === "juego" && status === "nofunds") || (g.phase === "espera" && !canAfford(st, g.cuota));
  let chip: ReactNode = null, desc = "", btn: ReactNode = null;
  let turnText = "Tu turno se sortea cuando empiece el juego.";
  const topup = () => open({ t: "topup", ctx: { need: r2(Math.max(0, g.cuota - st.wallet!.bal)) } });

  if (g.phase === "reclutando") {
    chip = <Badge tone="neutral" icon="users">Aún no empieza</Badge>;
    desc = "Tu aporte se cobrará automáticamente cuando comience la ronda 1.";
  } else if (g.phase === "espera") {
    if (canAfford(st, g.cuota)) {
      chip = <Badge tone="paid" icon="check">Saldo listo</Badge>;
      desc = "Tu billetera ya tiene saldo para el primer débito automático.";
    } else {
      chip = <Badge tone="late" icon="alert">Te falta saldo</Badge>;
      desc = "Recarga tu billetera antes del inicio para cubrir " + xlm(g.cuota) + ".";
      btn = <button className="btn btn-primary p-pay-btn" id="p-top" onClick={topup}><Icon name="wallet" />Recargar billetera</button>;
    }
  } else if (g.phase === "juego") {
    if (status === "paid") {
      chip = <Badge tone="paid" icon="check">Pagado · débito automático</Badge>;
      desc = "Tu aporte de esta ronda ya entró al pozo.";
    } else {
      chip = <Badge tone="late" icon="alert">No se pudo debitar {xlm(g.cuota)}</Badge>;
      desc = "Recarga tu billetera y el cobro se hará automáticamente.";
      btn = <button className="btn btn-primary p-pay-btn" id="p-top" onClick={topup}><Icon name="wallet" />Recargar y pagar</button>;
    }
  } else {
    chip = <Badge tone="paid" icon="check">Completaste tus aportes</Badge>;
    desc = "Tus aportes quedaron registrados durante todo el pandero.";
  }
  if (myTurn) turnText = g.payouts[myTurn] ? "Ronda " + myTurn + " · ya recibiste el pozo" : "Ronda " + myTurn + " · se deposita el " + fdate(payoutDate(g, myTurn));

  return (
    <>
      <section className={"p-personal" + (urgent ? " urgent" : "")}>
        <div className="p-personal-row">
          <div className="p-personal-main"><b>Tu aporte de esta ronda</b><p>{desc}</p></div>
          {chip}
        </div>
        <div className="p-personal-row">
          <div className="p-personal-main"><b>Tu turno</b><p>{turnText}</p></div>
          {myTurn ? <span className="p-turn-pill">{myTurn}</span> : <span className="p-turn-pill muted">?</span>}
        </div>
        {btn}
      </section>
      {mine ? (
        <p className="p-creator-note"><Icon name="shield" /><span>Creaste este pandero, pero tienes los mismos derechos que los demás: nadie puede eliminar participantes ni cambiar el aporte.</span></p>
      ) : null}
    </>
  );
}

function PInvite({ g, focus }: { id: string; g: PanderoGroup; focus?: boolean }) {
  const router = useRouter();
  const n = Object.keys(g.members).length;
  const cls = focus ? "p-invite-focus" : "p-invite-compact";
  if (g.visibility === "publico") {
    return (
      <section className={cls}>
        <div>
          <h2>{focus ? "Publicado en el foro" : "Invitación al pandero"}</h2>
          <p className="j-invite-meta">{n} de {g.capacity} participantes · pandero público</p>
          <p style={{ fontSize: 16, lineHeight: 1.5, color: "var(--j-muted)", marginTop: 6 }}>Cualquier persona puede encontrarlo en el foro de panderos y unirse desde allí.</p>
        </div>
        <button className={"btn btn-secondary" + (focus ? " p-invite-copy" : "")} id="go-forum" onClick={() => router.push("/forum")}><Icon name="globe" />Ver en el foro</button>
      </section>
    );
  }
  return (
    <section className={cls}>
      <div>
        <h2>Invitación al pandero</h2>
        <p className="j-invite-code">{g.code}</p>
        <p className="j-invite-meta">{n} de {g.capacity} lugares ocupados · {g.phase === "reclutando" ? "ingreso abierto" : "ingreso cerrado"}</p>
      </div>
      <button className={"btn " + (focus ? "btn-primary p-invite-copy" : "btn-secondary")} id="copy-code" onClick={() => copyText(inviteText(g), "Invitación copiada")}><Icon name="copy" />Copiar invitación</button>
    </section>
  );
}

function TurnRow({ g, m }: { g: PanderoGroup; m: MemberWithId }) {
  const st = mstatus(g, m);
  const t = g.order ? g.order.indexOf(m.id) + 1 : 0;
  let cls = "p-turn-row";
  if (m.id === "me") cls += " is-me";
  if (g.order && g.phase !== "reclutando" && t === g.round && g.phase !== "espera") cls += " is-current";
  if (g.order && g.payouts[t]) cls += " is-past";
  let detail: string;
  if (g.order) {
    if (g.payouts[t]) detail = "Ya recibió el pozo";
    else if (g.phase !== "terminado" && t === g.round) detail = "Recibe este mes · " + fdate(payoutDate(g, t));
    else detail = "Se deposita el " + fdate(payoutDate(g, t));
  } else detail = "Inscrito el " + fdate(m.joinedAt) + (g.creator === m.id ? " · creó el pandero" : "");
  return (
    <li className={cls}>
      <div className="p-turn-avatar">
        <span className="avatar" aria-hidden="true">{initials(m.name)}</span>
        {t ? <span className="p-turn-num">{t}</span> : null}
      </div>
      <div className="p-turn-main"><b>{m.name}{m.id === "me" ? <span className="you">Tú</span> : null}</b><small>{detail}</small></div>
      <div className="p-turn-side"><PStatusBadge st={st} /></div>
    </li>
  );
}

function TurnSeat({ g }: { g: PanderoGroup }) {
  return (
    <li className="p-turn-row seat">
      <div className="p-turn-avatar"><span className="p-seat-avatar" aria-hidden="true">+</span></div>
      <div className="p-turn-main"><b>Lugar libre</b><small>{g.visibility === "publico" ? "Se ocupa desde el foro de panderos" : "Se ocupa con el código " + g.code}</small></div>
      <div className="p-turn-side"><Badge tone="neutral">Disponible</Badge></div>
    </li>
  );
}

function PTurns({ id, g }: { id: string; g: PanderoGroup }) {
  const f = useAyni((x) => x.s.filter[id]) || "all";
  const setFilter = useAyni.getState().setFilter;
  const useFilters = g.phase === "juego" || g.phase === "terminado";
  const list = useFilters ? filtered(g, f) : mlist(g);
  const rows: ReactNode[] = list.map((m) => <TurnRow key={m.id} g={g} m={m} />);
  if (g.phase === "reclutando") {
    const free = Math.max(0, g.capacity - Object.keys(g.members).length);
    for (let i = 0; i < free; i++) rows.push(<TurnSeat key={"s" + i} g={g} />);
  }
  const shown = rows.slice(0, 8);
  const rest = rows.slice(8);
  return (
    <section className="p-turns-panel">
      <div className="p-turns-head">
        <div>
          <h2>Orden de turnos</h2>
          <p>{g.order ? "Revisa quién recibe el pozo este mes y cómo va cada aporte." : "El orden de turnos aparecerá cuando comience el juego."}</p>
        </div>
      </div>
      {useFilters ? <FilterChips g={g} f={f} onChange={(x) => setFilter(id, x)} /> : null}
      <ul className="p-turn-list">
        {shown.length ? shown : (
          <li className="p-turn-row">
            <div className="p-turn-main" style={{ gridColumn: "1/-1" }}><b>Todavía no hay participantes</b><small>Comparte la invitación para completar el pandero.</small></div>
          </li>
        )}
      </ul>
      {rest.length ? (
        <details className="p-turns-more">
          <summary>Ver más ({rest.length})</summary>
          <ul className="p-turn-list">{rest}</ul>
        </details>
      ) : null}
    </section>
  );
}

function PLedgerRow({ t }: { t: LedgerEntryWithId }) {
  const o = t.type === "out";
  return (
    <li className="p-ledger-row">
      <span className={"lico" + (o ? " out" : "")}><Icon name={o ? "wallet" : "cash"} /></span>
      <div><b>{ledgerHuman(t)}</b><span className="p-ledger-date">{juntaDateTime(t.at)}</span></div>
      <div className={"p-ledger-amount" + (o ? " out" : "")}>{o ? "− " : "+ "}{xlm(t.amount)}</div>
      <details className="j-receipt">
        <summary>Ver comprobante</summary>
        <div className="j-receipt-body">
          <span>{t.method || "Cuenta Ayni"}</span>
          <button className="hash" aria-label="Copiar código de transacción" onClick={() => copyText(t.hash, "Código de transacción copiado")}>tx {short(t.hash)} · copiar</button>
        </div>
      </details>
    </li>
  );
}

function PLedger({ id, g }: { id: string; g: PanderoGroup }) {
  const open = useUi((u) => u.open);
  const L = ledgerList(g);
  if (!L.length)
    return (
      <section className="p-ledger-panel2">
        <div className="panel-head"><div><h2>Registro transparente</h2><p>Todavía no hay movimientos.</p></div></div>
      </section>
    );
  const groups: Record<number, LedgerEntryWithId[]> = {};
  L.forEach((t) => {
    const r = roundNumber(t) || 0;
    (groups[r] ||= []).push(t);
  });
  const order = Object.keys(groups).map(Number).sort((a, b) => b - a);
  return (
    <section className="p-ledger-panel2">
      <div className="panel-head"><div><h2>Registro transparente</h2><p>Cada aporte y cada depósito del pozo quedan registrados.</p></div></div>
      <div className="p-ledger-groups">
        {order.map((r, i) => {
          const items = groups[r];
          const ins = items.filter((t) => t.type === "in").length;
          return (
            <details key={r} className="p-ledger-group" open={i === 0}>
              <summary>
                <div><b>Ronda {r}</b><small>{ins} de {g.capacity} aportes · {juntaDateTime(items[0].at)}</small></div>
                <span className="badge b-neutral">{items.length} mov.</span>
              </summary>
              <ul className="p-ledger-list">{items.map((t) => <PLedgerRow key={t.id} t={t} />)}</ul>
            </details>
          );
        })}
      </div>
      <div className="p-ledger-footer">
        <button className="btn btn-secondary" id="see-ledger" onClick={() => open({ t: "ledger", id })}><Icon name="doc" />Ver los {L.length} movimiento{L.length === 1 ? "" : "s"}</button>
      </div>
    </section>
  );
}

function PArchive({ id, g }: { id: string; g: PanderoGroup }) {
  const archiveAndGo = useArchiveAndGo(id);
  if (g.phase !== "terminado") return null;
  if (g.creator === "me")
    return (
      <section className="p-archived">
        <h2 style={{ fontSize: 24 }}>Pandero finalizado</h2>
        <p style={{ marginTop: 8 }}>Archívalo para quitarlo de “Mis grupos” de todos los participantes. Seguirá disponible en Perfil → Archivados.</p>
        <button className="btn btn-secondary" style={{ marginTop: 16 }} id="arch" onClick={archiveAndGo}><Icon name="doc" />Archivar pandero</button>
      </section>
    );
  return <section className="p-archived"><p>El pandero terminó. Quien lo creó puede archivarlo cuando ya no necesiten verlo en la lista principal.</p></section>;
}
