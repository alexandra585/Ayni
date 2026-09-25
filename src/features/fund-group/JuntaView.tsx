"use client";
import { Badge } from "@/components/ui/Badge";
import { Icon, type IconName } from "@/components/ui/Icon";
import { pendingReminders } from "@/domain/actions";
import { cuotaOf, filtered, isAdmin, jstats, KIND, ledgerList, mstatus, owed, inviteText } from "@/domain/model";
import type { JuntaGroup, LedgerEntryWithId, MemberWithId } from "@/domain/types";
import { APP_MODE } from "@/config/app";
import { copyText } from "@/lib/clipboard";
import { daysTo, fdate, fmt, initials, juntaDateTime, juntaDayKey, juntaDayLabel, short, xlm } from "@/lib/format";
import { useAyni } from "@/store/ayni";
import { useUi } from "@/store/ui";
import { FilterChips, StatusBadge, downloadReport } from "@/features/ledger/shared";
import { JuntaDemoPanel } from "@/features/demo/DemoPanels";
import { useArchiveAndGo } from "@/features/groups/nav";

/** Vista del grupo con fondo común (tesorero / participante). Diseño V10/V11 del prototipo. */
export function JuntaView({ id }: { id: string }) {
  const st = useAyni((x) => x.s);
  const store = useAyni.getState;
  const open = useUi((u) => u.open);
  const archiveAndGo = useArchiveAndGo(id);
  const g = st.groups[id] as JuntaGroup;
  const s = jstats(g);
  const k = KIND[g.kind];
  const lib = g.status === "liberado";
  const me = g.members.me;
  const dRel = daysTo(g.releaseDate);
  const c = cuotaOf(g);
  const o = owed(g, me);
  const admin = isAdmin(g);
  const pend = pendingReminders(g);
  const ag = st.agent[id] || {};
  const f = st.filter[id] || "all";

  const role = (g.nature || k.label) + (admin ? " · Eres tesorero" : "") + (g.demo ? " · Ejemplo" : "");
  const unit = g.nature ? "participante" : k.unit;

  let closeText: string;
  if (lib) closeText = "Ciclo cerrado · " + fdate(g.releasedAt);
  else if (g.rule === "meta") closeText = "Cierra cuando todos completen su cuota";
  else if (g.dateReached || dRel < 0) closeText = "Fecha de cierre cumplida · " + fdate(g.releaseDate);
  else if (dRel === 0) closeText = "Cierra hoy · " + fdate(g.releaseDate);
  else if (dRel === 1) closeText = "Cierra en 1 día · " + fdate(g.releaseDate);
  else closeText = "Cierra en " + dRel + " días · " + fdate(g.releaseDate);

  const closeHelp = lib
    ? "El fondo ya fue entregado y el movimiento quedó registrado."
    : g.status === "listo"
      ? admin ? "Ya puedes decidir qué hacer con el fondo." : "El tesorero decidirá qué hacer con el fondo."
      : admin ? "Después del cierre, tú eliges qué hacer con el fondo." : "Después del cierre, el tesorero elige qué hacer con el fondo.";

  const list = filtered(g, f);
  const shown = list.slice(0, 6);
  const rest = list.slice(6);
  const L = ledgerList(g);
  const shownL = L.slice(0, 8);

  return (
    <div className="junta-page">
      <header className="ghead">
        <div>
          <span className="j-role-chip"><Icon name={admin ? "key" : "users"} />{role}</span>
          <h1>{g.name}</h1>
          <p className="muted">
            {g.periodo ? g.periodo + " · " : ""}cuota de {xlm(c)} por {unit} · vence el {fdate(g.dueDate)}
          </p>
        </div>
        <div className="row">
          <button className="btn btn-secondary" id="dl-report" onClick={() => downloadReport(g)}><Icon name="doc" />Descargar reporte</button>
        </div>
      </header>

      <div className="j-toptools">
        <section className="j-invite">
          <div>
            <h2>Invitación al grupo</h2>
            <p className="j-invite-code">{g.code}</p>
            <p className="j-invite-meta">{s.n} de {s.cap} lugares ocupados · {g.admissionsOpen ? "ingreso abierto" : "ingreso cerrado"}</p>
          </div>
          <button className="btn btn-secondary" id="copy-code" onClick={() => copyText(inviteText(g), "Invitación copiada")}><Icon name="copy" />Copiar invitación</button>
        </section>
        {admin && g.status === "custodia" ? (
          <button className="j-settings-launch" id="open-settings" aria-label="Abrir panel del tesorero" onClick={() => open({ t: "settings", id })}>
            <Icon name="gear" /><span>Panel del tesorero</span>
          </button>
        ) : null}
      </div>

      <section className="vault j-status-card" aria-label="Estado del fondo">
        <div className="j-status-top">
          <div>
            <p className="j-status-label">Fondo reunido</p>
            <p className="j-vault-amount">{fmt(lib ? g.releasedAmount : s.total)}<span className="j-vault-unit">XLM</span></p>
            <p className="j-goal">de {xlm(g.goal)}</p>
          </div>
          {g.status === "listo" ? <Badge tone="pending" icon="check">Listo para disponer</Badge> : null}
        </div>
        <div className="j-progress" role="progressbar" aria-label="Recaudado" aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.pct}>
          <span style={{ width: s.pct + "%" }} />
        </div>
        <div className="j-progress-meta"><span>{s.paid} de {s.cap} ya pagaron</span><strong>{s.pct}%</strong></div>
        <div className="j-protection">
          {lib ? (<><Icon name="check" /><span><b>Fondo entregado.</b> Consulta el registro para ver el movimiento.</span></>)
            : g.status === "listo" ? (<><Icon name="check" /><span><b>Fondo listo para disponer.</b> Se cumplió la condición de cierre.</span></>)
            : (<><Icon name="lock" /><span><b>Fondo protegido:</b> nadie puede retirarlo antes del cierre.</span></>)}
        </div>
        <div>
          <div className="j-close-row"><span className="j-countdown"><Icon name="clock" />{closeText}</span></div>
          <p className="j-close-help" style={{ marginTop: 10 }}>{closeHelp}</p>
        </div>

        {admin && g.status === "custodia" ? (
          <button className="btn btn-primary j-reminder-btn" id="agent-run" disabled={!(pend.length && !ag.busy)} onClick={() => store().runAgent(id)}>
            <Icon name="bell" />{ag.busy ? "Preparando recordatorios…" : "Recordar a los que faltan (" + pend.length + ")"}
          </button>
        ) : null}

        {ag.msgs && ag.msgs.length ? (
          <div className="j-agent-results">
            <p><b>Recordatorios preparados.</b> Revisa el mensaje antes de enviarlo.</p>
            <div className="j-agent-actions"><button className="btn btn-secondary" id="agent-log" onClick={() => store().logAgent(id)}>Marcar como enviados</button></div>
            {ag.msgs.slice(0, 4).map((x, i) => (
              <div className="msg" key={x.id + i}>
                <header><b>Para {x.name}</b><button className="btn btn-ghost" data-copy={i} onClick={() => copyText(x.text, "Mensaje copiado")}><Icon name="copy" />Copiar</button></header>
                <p>{x.text}</p>
              </div>
            ))}
            {ag.msgs.length > 4 ? <p>Hay {ag.msgs.length - 4} recordatorios más preparados.</p> : null}
          </div>
        ) : ag.note ? (
          <div className="j-agent-results"><p>{ag.note}</p></div>
        ) : null}

        {lib || g.status === "listo" ? null : (
          <div className="j-mypay">
            {o <= 0 ? (
              <>
                <div><b>Tu cuota está completa</b><p>Abonaste {xlm(me.paid)}.</p></div>
                <StatusBadge st="paid" />
              </>
            ) : (
              <>
                <div>
                  <b>{me.paid > 0 ? "Te falta " + xlm(o) : "Tu cuota: " + xlm(c)}</b>
                  <p>{me.paid > 0 ? "Ya abonaste " + xlm(me.paid) + " · " : ""}{mstatus(g, me) === "late" ? "Venció el " : "Vence el "}{fdate(g.dueDate)}</p>
                </div>
                <button className="btn btn-secondary" id="pay-mine" onClick={() => open({ t: "pay", gid: id })}><Icon name="finger" />{me.paid > 0 ? "Completar pago" : "Pagar mi cuota"}</button>
              </>
            )}
          </div>
        )}

        {admin && g.status === "listo" ? (
          <div className="j-close-actions">
            <div>
              <h2>¿Qué quieres hacer con el fondo?</h2>
              <p>Monto reunido: <b style={{ color: "#fff" }}>{xlm(s.total)}</b>. La decisión quedará en el registro y se notificará al grupo.</p>
            </div>
            <div className="row">
              <button className="btn btn-primary" id="dp-me" onClick={() => open({ t: "confirmDispose", id, to: "me" })}><Icon name="wallet" />Recolectar en mi wallet</button>
              <button className="btn btn-secondary" id="dp-other" onClick={() => open({ t: "dispose", id })}><Icon name="users" />Enviar a un participante</button>
            </div>
          </div>
        ) : null}
        {lib && admin ? (
          <div className="j-close-actions">
            <div><h2>Ciclo finalizado</h2><p>Puedes archivar este grupo o iniciar un nuevo ciclo.</p></div>
            <div className="row">
              <button className="btn btn-secondary" id="arch" onClick={archiveAndGo}><Icon name="doc" />Archivar grupo</button>
              <button className="btn btn-primary" id="new-cycle" onClick={() => store().newCycle(id)}>Iniciar nuevo ciclo</button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel j-members-panel">
        <div className="j-members-head">
          <div><h2>Miembros</h2><p className="j-members-count">{s.n} de {g.capacity} personas</p></div>
        </div>
        <FilterChips g={g} f={f} onChange={(x) => store().setFilter(id, x)} />
        {admin ? (
          <p className="j-members-help"><Icon name="alert" /><span>Como tesorero puedes quitar participantes. Ayni te mostrará el efecto en la cuota antes de confirmar.</span></p>
        ) : null}
        <ul className="j-member-list">
          {shown.length ? shown.map((m) => <JuntaMemberRow key={m.id} g={g} m={m} admin={admin} onRemove={(mid) => open({ t: "remove", id, mid })} />) : (
            <li className="j-member-row">
              <div className="j-member-main" style={{ gridColumn: "1/-1" }}><b>Nadie en este estado</b><small>Prueba otro filtro para ver a los demás miembros.</small></div>
            </li>
          )}
        </ul>
        {rest.length ? (
          <details className="j-members-more">
            <summary>Ver más ({rest.length})</summary>
            <ul className="j-member-list">
              {rest.map((m) => <JuntaMemberRow key={m.id} g={g} m={m} admin={admin} onRemove={(mid) => open({ t: "remove", id, mid })} />)}
            </ul>
          </details>
        ) : null}
      </section>

      <section className="panel j-ledger-panel">
        <div className="panel-head"><div><h2>Registro transparente</h2><p className="caption">Cada movimiento queda registrado y se puede comprobar.</p></div></div>
        {L.length ? (
          <ul className="j-ledger-list">
            {shownL.map((t, i) => (
              <LedgerItems key={t.id} t={t} prev={shownL[i - 1]} />
            ))}
          </ul>
        ) : <p className="muted">Todavía no hay movimientos.</p>}
        <div className="j-ledger-footer">
          <button className="btn btn-secondary" id="see-ledger" disabled={!L.length} onClick={() => open({ t: "ledger", id })}><Icon name="doc" />Ver registro completo</button>
        </div>
      </section>

      {g.status === "custodia" && APP_MODE === "demo" ? <JuntaDemoPanel id={id} /> : null}
    </div>
  );
}

function JuntaMemberRow({ g, m, admin, onRemove }: { g: JuntaGroup; m: MemberWithId; admin: boolean; onRemove: (id: string) => void }) {
  const st = mstatus(g, m);
  const o = owed(g, m);
  let sub: string;
  if (m.paidAt && o <= 0) sub = "Pagó el " + fdate(m.paidAt);
  else sub = (m.paid > 0 ? "Abonó " + xlm(m.paid) + " · falta " + xlm(o) : "Debe " + xlm(o)) + " · " + (st === "late" ? "venció" : "vence") + " el " + fdate(g.dueDate) + (m.reminders ? " · " + m.reminders + " recordatorio" + (m.reminders > 1 ? "s" : "") : "");
  if (g.creator === m.id) sub += " · tesorero";
  return (
    <li className="j-member-row">
      <span className="avatar" aria-hidden="true">{initials(m.name)}</span>
      <div className="j-member-main">
        <b>{m.name}{m.id === "me" ? <span className="you">Tú</span> : null}</b>
        <small>{sub}</small>
      </div>
      <div className="j-member-actions">
        <StatusBadge st={st} g={g} />
        {admin && m.id !== "me" && g.status !== "liberado" ? (
          <button className="btn j-remove" aria-label={"Quitar a " + m.name + " del grupo"} onClick={() => onRemove(m.id)}>Quitar</button>
        ) : null}
      </div>
    </li>
  );
}

function juntaLedgerHuman(t: LedgerEntryWithId): string {
  const d = String(t.desc || "");
  if (t.type === "in" && d.indexOf("Cuota de ") === 0) return d.slice(9) + " pagó su cuota";
  if (t.type === "out" && d.indexOf("Devolución a ") === 0) return d.replace("Devolución a ", "Devolución para ");
  return d;
}

function LedgerItems({ t, prev }: { t: LedgerEntryWithId; prev?: LedgerEntryWithId }) {
  const o = t.type === "out";
  const newDay = !prev || juntaDayKey(prev.at) !== juntaDayKey(t.at);
  return (
    <>
      {newDay ? <li className="j-ledger-day">{juntaDayLabel(t.at)}</li> : null}
      <li className="j-ledger-row">
        <span className={"lico" + (o ? " out" : "")}><Icon name={(t.method === "Devolución automática" ? "refund" : o ? "out" : "cash") as IconName} /></span>
        <div className="j-ledger-main"><b>{juntaLedgerHuman(t)}</b><span className="j-ledger-date">{juntaDateTime(t.at)}</span></div>
        <div className={"j-ledger-amount" + (o ? " out" : "")}>{o ? "− " : "+ "}{xlm(t.amount)}</div>
        <details className="j-receipt">
          <summary>Ver comprobante</summary>
          <div className="j-receipt-body">
            <span>{t.method || "Cuenta Ayni"}</span>
            <button className="hash" aria-label="Copiar código de transacción" onClick={() => copyText(t.hash, "Código de transacción copiado")}>tx {short(t.hash)} · copiar</button>
          </div>
        </details>
      </li>
    </>
  );
}
