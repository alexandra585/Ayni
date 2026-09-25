/**
 * Reglas de negocio de Ayni, portadas del prototipo HTML.
 * Todas las funciones MUTAN `ctx.s` (el store las llama sobre un clon) y son deterministas
 * gracias a `env` (tiempo/azar inyectables). No dependen de React ni de Supabase.
 */
import { addDays, ago, daysTo, fdate, r2, today, xlm } from "@/lib/format";
import { env, genCode, rid, shuffle } from "./env";
import {
  allPaid,
  condMet,
  cuotaOf,
  findUser,
  groupIds,
  isAdmin,
  isMember,
  isP,
  jstats,
  KIND,
  led,
  mlist,
  mstatus,
  myGroupIds,
  normalizeInviteCode,
  isValidInviteCodeFormat,
  owed,
  payoutDate,
} from "./model";
import type {
  AgentMsg,
  AyniState,
  Ctx,
  DirUser,
  Group,
  JuntaGroup,
  Member,
  NotifType,
  PanderoGroup,
  Visibility,
  WalletKey,
  WizardData,
} from "./types";

const nowIso = () => env.now().toISOString();

/* ============ nombres de demo ============ */
export const NAMES = ["Rosa Quispe","Jorge Mamani","Lucía Huamán","Carlos Torres","Ana Flores","Pedro Condori","María Chávez","Luis Ramírez","Carmen Rojas","José Vargas","Elena Castillo","Miguel Sánchez","Sofía Mendoza","Juan Gutiérrez","Patricia Díaz","Raúl Ccori","Gloria Paredes","Víctor Salazar","Teresa Aguilar","Hugo Espinoza","Norma Cruz","Alberto Ríos","Julia Ticona","Óscar Palomino","Diana Llanos","Fernando Soto","Rocío Pinto","Martín Yupanqui","Silvia Cárdenas","Andrés Huaranga","Beatriz Loayza","César Quiroz","Irma Chuquimia","Wilber Nina","Yolanda Apaza","Ronald Mego","Karina Huanca","Edwin Tapia","Maribel Solís","Franco Rengifo","Liz Arévalo","Tomás Chambi","Nancy Barrios","Saúl Ventura","Flor Ayala","Iván Llerena","Mirtha Olivares","Kevin Poma","Eva Mallma","Jaime Arce","Susana Ortiz","Walter Cueva","Pilar Tello","Gustavo Neyra","Delia Zapata","Rubén Pacheco","Olga Villena","Marco Ugarte","Inés Carhuas","Abel Quispe"];

export function nextName(s: AyniState): string {
  const n = NAMES[s.nameIdx % NAMES.length];
  s.nameIdx++;
  return n;
}

/* ============ notificaciones ============ */
export function notify(ctx: Ctx, key: string, type: NotifType, title: string, body: string, gid?: string | null, at?: string) {
  if (ctx.s.notifs.some((n) => n.key === key)) return;
  ctx.s.notifs.unshift({ key, type, title, body, gid: gid || null, at: at || nowIso(), read: false });
  if (!at) ctx.toast(title);
}
export const unreadCount = (s: AyniState) => s.notifs.filter((n) => !n.read).length;

export function checkTimed(ctx: Ctx) {
  const s = ctx.s;
  Object.keys(s.groups).forEach((id) => {
    const g = s.groups[id];
    if (!isMember(g)) return;
    if (!isP(g) && g.status === "custodia" && g.rule === "fecha" && daysTo(g.releaseDate) === 1)
      notify(ctx, "eve-" + id + g.releaseDate, "eve", "Mañana cierra la junta de " + g.name,
        "La recolección cierra el " + fdate(g.releaseDate) + ". " + (owed(g, g.members.me) > 0 ? "Te falta abonar " + xlm(owed(g, g.members.me)) + "." : "Tu cuota está completa."), id);
    if (isP(g) && g.phase === "espera" && g.startDate && daysTo(g.startDate) === 1)
      notify(ctx, "eve-" + id + g.startDate, "eve", "Mañana empieza " + g.name, "Se debitarán " + xlm(g.cuota) + " de tu billetera. Revisa que tengas saldo.", id);
  });
}

/* ============ billetera (solo XLM) ============ */
export function credit(s: AyniState, amt: number, desc: string, hash?: string) {
  const w = s.wallet!;
  w.bal = r2(w.bal + amt);
  w.moves.unshift({ id: rid(5), type: "in", amount: r2(amt), desc, at: nowIso(), hash: hash || rid(32) });
}
export function debit(s: AyniState, amt: number, desc: string, hash?: string): boolean {
  const w = s.wallet!;
  if (w.bal < amt - 0.001) return false;
  w.bal = r2(w.bal - amt);
  w.moves.unshift({ id: rid(5), type: "out", amount: r2(amt), desc, at: nowIso(), hash: hash || rid(32) });
  return true;
}
export const canAfford = (s: AyniState, a: number) => !!s.wallet && s.wallet.bal >= a - 0.001;

/* ============ creación de grupos ============ */
export function mkJunta(o: Partial<JuntaGroup> & { name: string; goal: number; capacity: number; dueDate: string; releaseDate: string; rule: "fecha" | "meta"; creator: string; open?: boolean }): JuntaGroup {
  return {
    kind: o.kind || "junta", nature: o.nature || "", name: o.name, goal: o.goal, capacity: o.capacity, periodo: o.periodo || "",
    dueDate: o.dueDate, releaseDate: o.releaseDate, rule: o.rule, code: o.code || genCode(), status: "custodia",
    admissionsOpen: o.open !== false, createdAt: o.createdAt || nowIso(), creator: o.creator, members: {}, ledger: {}, demo: !!o.demo,
  };
}
export function mkPandero(o: { name: string; cuota: number; capacity: number; visibility: Visibility; creator: string; creatorName?: string; code?: string; createdAt?: string; demo?: boolean }): PanderoGroup {
  return {
    kind: "pandero", name: o.name, cuota: o.cuota, capacity: o.capacity, visibility: o.visibility,
    code: o.visibility === "privado" ? o.code || genCode() : null, phase: "reclutando", round: 0, order: null, payouts: {},
    createdAt: o.createdAt || nowIso(), creator: o.creator, creatorName: o.creatorName || "", members: {}, ledger: {}, demo: !!o.demo, broke: {},
  };
}
export function seedPay(g: Group, id: string, daysAgo: number) {
  const m = g.members[id];
  m.paid = cuotaOf(g);
  m.paidAt = ago(daysAgo);
  led(g, "in", m.paid, "Cuota de " + m.name, "Cuenta Ayni", m.paidAt);
}

/* ============ miembros / capacidad ============ */
export function addMember(ctx: Ctx, g: Group, gid: string, id: string, name: string, opts: { at?: string; silent?: boolean; code?: string | null } = {}) {
  const m: Member = {
    name, order: Object.keys(g.members).length, joinedAt: opts.at || nowIso(), paid: 0, paidAt: null, reminders: 0, paidRound: 0, code: opts.code || null,
  };
  g.members[id] = m;
  const n = Object.keys(g.members).length;
  if (n >= g.capacity) {
    if (isP(g) && g.phase === "reclutando") {
      g.phase = "espera";
      g.closedAt = opts.at || nowIso();
      g.startDate = addDays(30, g.closedAt);
      if (isMember(g) && !opts.silent)
        notify(ctx, "full-" + gid, "full", "Se completó " + g.name,
          "Llegaron los " + g.capacity + " participantes y se cerró el ingreso. El juego empieza el " + fdate(g.startDate) + ": ese día se debitarán " + xlm(g.cuota) + " de tu billetera.", gid);
    } else if (!isP(g) && isMember(g) && !opts.silent) {
      notify(ctx, "full-" + gid + "-" + g.capacity, "full", g.name + " llegó a su capacidad máxima",
        n + " de " + g.capacity + " miembros. Nadie más puede unirse con el código" + (isAdmin(g) ? " salvo que agregues un cupo." : "."), gid);
    }
  }
}

export type JoinResult =
  | { ok: true; id: string; kind: "joined" | "already" | "needs-terms" }
  | { ok: false; error: string };

/** Unirse con código AYNI-XXXX (equivale a la RPC `join_group_by_code`). */
export function joinByCode(ctx: Ctx, raw: string): JoinResult {
  const s = ctx.s;
  const c = normalizeInviteCode(raw);
  if (c.length !== 9) return { ok: false, error: "El código debe tener 9 caracteres, por ejemplo AYNI-5B32." };
  if (!isValidInviteCodeFormat(c)) return { ok: false, error: "El código debe tener el formato AYNI-XXXX, por ejemplo AYNI-5B32." };
  const id = groupIds(s).find((k) => s.groups[k].code && s.groups[k].code === c);
  if (!id) return { ok: false, error: "No encontramos un grupo con ese código. Revisa que esté bien escrito." };
  const g = s.groups[id];
  if (isMember(g)) return { ok: true, id, kind: "already" };
  if (isP(g)) {
    if (g.phase !== "reclutando") return { ok: false, error: "Este pandero ya completó sus participantes." };
    return { ok: true, id, kind: "needs-terms" };
  }
  if (!g.admissionsOpen) return { ok: false, error: "El tesorero cerró el ingreso a este grupo. Pídele que te agregue con tu código de usuario: " + s.me!.code + "." };
  if (Object.keys(g.members).length >= g.capacity) return { ok: false, error: "Este grupo ya está completo." };
  joinGroup(ctx, id);
  return { ok: true, id, kind: "joined" };
}

export function joinGroup(ctx: Ctx, id: string) {
  const g = ctx.s.groups[id];
  addMember(ctx, g, id, "me", ctx.s.me!.name, { code: ctx.s.me!.code });
  ctx.toast("Te uniste a " + g.name);
}

/** Confirmación de términos del pandero → unirse (con verificación de cupo). Devuelve false si ya se completó. */
export function joinPanderoAfterTerms(ctx: Ctx, id: string): boolean {
  const g = ctx.s.groups[id];
  if (!isP(g) || g.phase !== "reclutando" || Object.keys(g.members).length >= g.capacity) {
    ctx.toast("Este pandero ya se completó");
    return false;
  }
  joinGroup(ctx, id);
  return true;
}

/* ============ recálculo (tesorero) ============ */
export interface Change { removeId?: string; goal?: number; capDelta?: number; addUser?: DirUser }
export interface Preview {
  oldGoal: number; newGoal: number; oldCap: number; newCap: number; oldC: number; newC: number;
  more: { id: string; name: string; amt: number; owe: number }[];
  refunds: { id: string; name: string; amt: number }[];
  me: { ref: number; owe: number; before: number } | null;
  removed: Member | null; removedRefund: number; totalRefund: number;
}
export function preview(g: JuntaGroup, ch: Change): Preview {
  const removed = ch.removeId ? g.members[ch.removeId] : null;
  const newGoal = ch.goal != null ? ch.goal : g.goal;
  const newCap = g.capacity + (ch.capDelta || 0);
  const oldC = cuotaOf(g), newC = r2(newGoal / newCap);
  const more: Preview["more"] = [], refunds: Preview["refunds"] = [];
  let me: Preview["me"] = null;
  Object.keys(g.members).forEach((k) => {
    if (k === ch.removeId) return;
    const m = g.members[k], p = m.paid || 0;
    const before = r2(Math.max(0, oldC - p)), after = r2(Math.max(0, newC - p));
    const ref = p > newC + 0.004 ? r2(p - newC) : 0;
    if (ref) refunds.push({ id: k, name: m.name, amt: ref });
    else if (after > before) more.push({ id: k, name: m.name, amt: r2(after - before), owe: after });
    if (k === "me") me = { ref, owe: after, before };
  });
  if (ch.addUser) more.push({ id: "new", name: ch.addUser.name, amt: newC, owe: newC });
  return {
    oldGoal: g.goal, newGoal, oldCap: g.capacity, newCap, oldC, newC, more, refunds, me, removed,
    removedRefund: removed ? r2(removed.paid || 0) : 0,
    totalRefund: r2(refunds.reduce((a, x) => a + x.amt, 0)),
  };
}

export function applyChange(ctx: Ctx, id: string, ch: Change) {
  const s = ctx.s;
  const g = s.groups[id] as JuntaGroup, at = nowIso();
  if (ch.removeId) {
    const rm = g.members[ch.removeId];
    if (rm.paid > 0) led(g, "out", rm.paid, "Devolución a " + rm.name + " (eliminado)", "Devolución automática", at);
    delete g.members[ch.removeId];
    Object.keys(g.members).map((k) => g.members[k]).sort((a, b) => a.order - b.order).forEach((m, i) => (m.order = i));
  }
  if (ch.goal != null) g.goal = ch.goal;
  g.capacity += ch.capDelta || 0;
  const c = cuotaOf(g);
  Object.keys(g.members).forEach((k) => {
    const m = g.members[k];
    if ((m.paid || 0) > c + 0.004) {
      const r = r2(m.paid - c);
      m.paid = c;
      const h = led(g, "out", r, "Devolución a " + m.name, "Devolución automática", at);
      if (k === "me") {
        credit(s, r, "Devolución · " + g.name, h);
        notify(ctx, "refund-" + id + at, "refund", "Recibiste una devolución de " + xlm(r), "La cuota de " + g.name + " bajó a " + xlm(c) + ". Te devolvimos la diferencia a tu billetera.", id);
      }
    } else if (k === "me" && owed(g, m) > 0 && m.paid > 0) {
      notify(ctx, "owe-" + id + at, "owe", "Tu cuota en " + g.name + " cambió", "Ahora es " + xlm(c) + ". Ya abonaste " + xlm(m.paid) + "; te falta " + xlm(owed(g, m)) + ".", id);
    }
  });
  if (ch.addUser) addMember(ctx, g, id, ch.addUser.id, ch.addUser.name, { code: ch.addUser.code });
  ctx.toast(ch.removeId ? "Miembro eliminado y cuotas recalculadas" : ch.addUser ? ch.addUser.name + " agregado; cuotas recalculadas" : "Monto objetivo actualizado");
}

export function toggleAdmissions(ctx: Ctx, id: string) {
  const g = ctx.s.groups[id] as JuntaGroup;
  g.admissionsOpen = !g.admissionsOpen;
  ctx.toast(g.admissionsOpen ? "Ingreso abierto: el código vuelve a funcionar" : "Ingreso cerrado: solo tú puedes agregar miembros");
}

export type AddByCodeResult = { ok: false; error: string } | { ok: true; added: DirUser } | { ok: true; recalc: DirUser };
export function addByCode(ctx: Ctx, id: string, raw: string): AddByCodeResult {
  const s = ctx.s, g = s.groups[id] as JuntaGroup;
  let c = raw.trim().toUpperCase();
  if (/^[A-Z0-9]{4}$/.test(c)) c = "USR-" + c;
  if (c === s.me!.code) return { ok: false, error: "Ese es tu propio código." };
  const u = findUser(s, c);
  if (!u) return { ok: false, error: "No existe un usuario con ese código." };
  if (g.members[u.id]) return { ok: false, error: u.name + " ya es miembro." };
  if (Object.keys(g.members).length < g.capacity) {
    addMember(ctx, g, id, u.id, u.name, { code: u.code });
    ctx.toast(u.name + " fue agregado al grupo");
    return { ok: true, added: u };
  }
  return { ok: true, recalc: u };
}

/* ============ pagos y disposición (fondo común) ============ */
export function payCuota(ctx: Ctx, gid: string, due: number, hash: string): boolean {
  const s = ctx.s, g = s.groups[gid] as JuntaGroup;
  if (!debit(s, due, "Cuota · " + g.name, hash)) return false;
  const at = nowIso(), m = g.members.me;
  m.paid = r2((m.paid || 0) + due);
  m.paidAt = at;
  led(g, "in", due, "Cuota de " + s.me!.name, "Cuenta Ayni", at, hash);
  return true;
}

/** Ids de grupos con condición de cierre cumplida que aún no pasaron a "listo". */
export function releasable(s: AyniState): string[] {
  return groupIds(s).filter((id) => {
    const g = s.groups[id];
    return !isP(g) && g.status === "custodia" && condMet(g);
  });
}
export function markReady(ctx: Ctx, id: string) {
  const g = ctx.s.groups[id];
  if (isP(g) || g.status !== "custodia") return;
  const s = jstats(g);
  g.status = "listo";
  g.readyAt = nowIso();
  if (isMember(g))
    notify(ctx, "ready-" + id + g.readyAt, "closed", "Cerró la recolección de " + g.name,
      isAdmin(g) ? "Se reunieron " + xlm(s.total) + ". Como tesorero, recolecta el monto en tu wallet o envíalo a un participante." : "Se reunieron " + xlm(s.total) + ". El tesorero decidirá el destino del fondo.", id);
}

export function dispose(ctx: Ctx, id: string, to: string) {
  const s = ctx.s, g = s.groups[id] as JuntaGroup, st = jstats(g), at = nowIso(), name = g.members[to].name;
  g.status = "liberado";
  g.releasedAt = at;
  g.releasedAmount = st.total;
  g.releasedTo = to;
  g.releasedToName = name;
  const h = led(g, "out", st.total, to === g.creator ? "Recolectado por el tesorero (" + name + ")" : "Entregado a " + name, "Disposición del tesorero", at);
  if (to === "me") {
    credit(s, st.total, "Fondo recolectado · " + g.name, h);
    notify(ctx, "got-" + id + at, "pot", "Recibiste " + xlm(st.total), "Recolectaste el fondo de " + g.name + " en tu wallet.", id);
  } else {
    notify(ctx, "sent-" + id + at, "closed", "Fondo de " + g.name + " entregado", "Se enviaron " + xlm(st.total) + " a " + name + ". El proceso terminó; ya puedes archivar el grupo.", id);
  }
}

export function newCycle(ctx: Ctx, id: string) {
  const g = ctx.s.groups[id] as JuntaGroup;
  g.status = "custodia";
  g.releasedAt = null; g.releasedAmount = null; g.releasedTo = null; g.releasedToName = null;
  g.dateReached = false;
  g.dueDate = addDays(7);
  g.releaseDate = addDays(30);
  Object.keys(g.members).forEach((k) => {
    g.members[k].paid = 0; g.members[k].paidAt = null; g.members[k].reminders = 0;
  });
  ctx.toast("Nuevo ciclo iniciado");
}

export function archive(ctx: Ctx, id: string) {
  const g = ctx.s.groups[id];
  g.archived = true;
  g.archivedAt = nowIso();
  ctx.toast(g.name + " se archivó para todos los miembros");
}

/* ============ demo: fondo común ============ */
export function simJoin(ctx: Ctx, id: string) {
  const g = ctx.s.groups[id];
  const mid = "j" + rid(3);
  addMember(ctx, g, id, mid, nextName(ctx.s));
  ctx.toast(g.members[mid].name + " se unió con el código");
}
export function simPay(ctx: Ctx, id: string): boolean {
  const g = ctx.s.groups[id] as JuntaGroup;
  const p = mlist(g).filter((m) => owed(g, m) > 0 && m.id !== "me");
  if (!p.length) return false;
  const m = p[Math.floor(env.rnd() * p.length)], amt = owed(g, m), at = nowIso();
  g.members[m.id].paid = r2((m.paid || 0) + amt);
  g.members[m.id].paidAt = at;
  led(g, "in", amt, "Cuota de " + m.name, "Cuenta Ayni", at);
  ctx.toast(m.name + " abonó " + xlm(amt));
  return true;
}
export function simDate(ctx: Ctx, id: string) {
  (ctx.s.groups[id] as JuntaGroup).dateReached = true;
}

/* ============ agente de recordatorios ============ */
export function reminderText(g: JuntaGroup, m: Member): string {
  const o = owed(g, m);
  return "Hola " + m.name.split(" ")[0] + ', te saluda Ayni, el tesorero de "' + g.name + '". ' +
    (m.paid > 0 ? "La cuota se actualizó a " + xlm(cuotaOf(g)) + "; te falta abonar " + xlm(o) + "."
      : mstatus(g, m) === "late" ? "Tu cuota de " + xlm(o) + " venció el " + fdate(g.dueDate) + "."
      : "Te recordamos tu cuota de " + xlm(o) + ", que vence el " + fdate(g.dueDate) + ".") +
    " El dinero queda bloqueado en la bóveda y nadie puede retirarlo. ¡Gracias!";
}
export function pendingReminders(g: JuntaGroup) {
  return mlist(g).filter((m) => owed(g, m) > 0 && m.id !== "me");
}
export function agentMessages(g: JuntaGroup): AgentMsg[] {
  return pendingReminders(g).map((m) => ({ id: m.id, name: m.name, text: reminderText(g, m) }));
}
export function logAgent(ctx: Ctx, id: string) {
  const g = ctx.s.groups[id], a = ctx.s.agent[id];
  if (!a || !a.msgs) return;
  a.msgs.forEach((x) => {
    const m = g.members[x.id];
    if (m) m.reminders = (m.reminders || 0) + 1;
  });
  ctx.s.agent[id] = {};
  ctx.toast("Recordatorios registrados");
}

/* ============ pandero ============ */
export function chargeMe(ctx: Ctx, id: string): boolean {
  const s = ctx.s, g = s.groups[id] as PanderoGroup, m = g.members.me;
  if (!m || (m.paidRound || 0) >= g.round) return true;
  const h = rid(32);
  if (debit(s, g.cuota, "Aporte ronda " + g.round + " · " + g.name, h)) {
    m.paidRound = g.round;
    led(g, "in", g.cuota, "Aporte ronda " + g.round + " de " + m.name, "Débito automático", null, h);
    notify(ctx, "debit-" + id + "-" + g.round, "debit", "Se debitó tu aporte de " + xlm(g.cuota), "Ronda " + g.round + " de " + g.name + " · débito automático en XLM, según los términos que aceptaste.", id);
    return true;
  }
  notify(ctx, "nofunds-" + id + "-" + g.round, "nofunds", "Saldo insuficiente en " + g.name, "No pudimos debitar " + xlm(g.cuota) + " de la ronda " + g.round + ". Tu estado es “Sin saldo”: recarga y el cobro se hará automáticamente.", id);
  return false;
}

export function tryPayout(ctx: Ctx, id: string) {
  const g = ctx.s.groups[id] as PanderoGroup;
  if (g.phase !== "juego" || !allPaid(g) || !isMember(g)) return;
  const w = g.members[g.order![g.round - 1]];
  notify(ctx, "ready-" + id + "-" + g.round, "round", "Pozo de la ronda " + g.round + " listo en " + g.name,
    "Se reunieron todos los aportes. Se abonará " + (g.order![g.round - 1] === "me" ? "a tu billetera" : "a " + w.name) + " el " + fdate(payoutDate(g, g.round)) + ", al cumplirse el mes.", id);
}

export function collectRound(ctx: Ctx, id: string) {
  const g = ctx.s.groups[id] as PanderoGroup;
  const broke = g.order![(g.round + 2) % g.capacity];
  Object.keys(g.members).forEach((k) => {
    const m = g.members[k];
    if ((m.paidRound || 0) >= g.round) return;
    if (k === "me") { chargeMe(ctx, id); return; }
    if (k === broke && g.demo !== false && g.round <= g.capacity && !g.broke[g.round]) { g.broke[g.round] = true; return; }
    m.paidRound = g.round;
    led(g, "in", g.cuota, "Aporte ronda " + g.round + " de " + m.name, "Débito automático");
  });
  tryPayout(ctx, id);
}

export function startGame(ctx: Ctx, id: string) {
  const g = ctx.s.groups[id] as PanderoGroup;
  g.phase = "juego"; g.round = 1; g.startDate = today(); g.closedAt = ago(30);
  g.order = shuffle(Object.keys(g.members));
  const t = g.order.indexOf("me") + 1;
  if (isMember(g))
    notify(ctx, "start-" + id, "start", "Empezó " + g.name, "Se cobra el aporte de la ronda 1. Por sorteo, tu turno es la ronda " + t + ": el pozo se te abonará el " + fdate(payoutDate(g, t)) + ".", id);
  collectRound(ctx, id);
}

export function monthEnd(ctx: Ctx, id: string) {
  const s = ctx.s, g = s.groups[id] as PanderoGroup;
  if (!allPaid(g)) { ctx.toast("Aún faltan aportes: el pozo se abona cuando la ronda esté completa."); return; }
  const wid = g.order![g.round - 1], w = g.members[wid], pot = g.cuota * g.capacity;
  g.payouts[g.round] = true;
  const h = led(g, "out", pot, "Pozo ronda " + g.round + " para " + w.name, "Abono mensual automático");
  if (wid === "me") {
    credit(s, pot, "Pozo ronda " + g.round + " · " + g.name, h);
    notify(ctx, "pot-" + id + "-" + g.round, "pot", "¡Se te abonó el pozo de " + xlm(pot) + "!", "Se cumplió el mes de la ronda " + g.round + " de " + g.name + ". Ya está en tu billetera.", id);
  } else {
    notify(ctx, "paid-" + id + "-" + g.round, "round", "Se abonó el pozo de la ronda " + g.round, "Se cumplió el mes y " + w.name + " recibió " + xlm(pot) + " en " + g.name + ".", id);
  }
  if (g.round >= g.capacity) {
    g.phase = "terminado";
    notify(ctx, "end-" + id, "closed", "Terminó " + g.name, "Se completaron las " + g.capacity + " rondas." + (g.creator === "me" ? " Ya puedes archivarlo." : ""), id);
    return;
  }
  g.round++;
  notify(ctx, "rnd-" + id + "-" + g.round, "start", "Empezó la ronda " + g.round + " de " + g.name, "Se cobra el aporte del mes. El pozo se abonará el " + fdate(payoutDate(g, g.round)) + ".", id);
  collectRound(ctx, id);
}

export function retryDebits(ctx: Ctx) {
  myGroupIds(ctx.s).forEach((id) => {
    const g = ctx.s.groups[id];
    if (isP(g) && g.phase === "juego" && (g.members.me.paidRound || 0) < g.round) {
      if (chargeMe(ctx, id)) tryPayout(ctx, id);
    }
  });
}

export function psJoin(ctx: Ctx, id: string) {
  const g = ctx.s.groups[id] as PanderoGroup;
  addMember(ctx, g, id, "j" + rid(3), nextName(ctx.s));
  if (g.phase === "reclutando") ctx.toast("Alguien se unió al pandero");
}
export function psPay(ctx: Ctx, id: string) {
  const g = ctx.s.groups[id] as PanderoGroup;
  const m = mlist(g).find((x) => x.id !== "me" && mstatus(g, x) === "nofunds");
  if (!m) return;
  g.members[m.id].paidRound = g.round;
  led(g, "in", g.cuota, "Aporte ronda " + g.round + " de " + m.name, "Débito automático");
  tryPayout(ctx, id);
}

export function termsList(g: { cuota: number; capacity: number }, live = false): string[] {
  return [
    "Aportarás " + xlm(g.cuota) + " cada mes durante " + g.capacity + " meses: una ronda por participante.",
    "El pandero solo empieza cuando se completan los " + g.capacity + " participantes. En ese momento se cierra el ingreso.",
    "El juego inicia un mes después del cierre de participantes; ese mes es el periodo para reunir tu aporte.",
    "Al iniciar cada ronda, Ayni debita tu aporte de tu billetera de forma automática e inmediata en XLM. Recibirás una notificación de cada operación.",
    "Si no tienes saldo, tu estado será “Sin saldo”, el pozo de esa ronda espera y el cobro se reintenta en cuanto recargues.",
    "El orden de turnos se sortea al iniciar el juego y queda en el registro público.",
    "Aunque todos aporten antes, el pozo se abona al participante del turno solo al cumplirse el mes de su ronda: un abono por mes.",
    "Los aportes quedan bloqueados en la bóveda. Nadie, ni quien creó el pandero, puede retirarlos, cambiar el aporte ni eliminar participantes.",
    "Si recibes el pozo antes de tu última ronda, sigues obligado a aportar hasta el final.",
    live
      ? "Todas las operaciones son en Stellar Lumens (XLM) de la red de pruebas (Testnet): no se mueve dinero real."
      : "Todas las operaciones son en Stellar Lumens (XLM). Los pagos de esta demo son simulados.",
  ];
}

/* ============ billetera: conexión y recarga ============ */
export const WALLETS: { k: WalletKey; t: string; type: string; d: string; kind: "ext" | "emb" }[] = [
  { k: "freighter", t: "Freighter", type: "Extensión", d: "Extensión de navegador de la Stellar Development Foundation", kind: "ext" },
  { k: "cavos", t: "Cavos", type: "Wallet embebida", d: "Entras con tu correo o redes sociales; sin extensión", kind: "emb" },
  { k: "privy", t: "Privy", type: "Wallet embebida", d: "Entras con correo, Google o SMS; sin extensión", kind: "emb" },
];
export const walletInfo = (k: WalletKey) => WALLETS.find((x) => x.k === k)!;
export const connectedWallets = (s: AyniState) => WALLETS.filter((x) => (s.wallet!.conn || {})[x.k]);

export function connectWallet(s: AyniState, k: WalletKey, addr: string) {
  s.wallet!.conn = s.wallet!.conn || {};
  s.wallet!.conn[k] = { addr, at: nowIso() };
}
export function disconnectWallet(ctx: Ctx, k: WalletKey) {
  delete ctx.s.wallet!.conn[k];
  ctx.toast(walletInfo(k).t + " desconectada");
}
export function applyTopup(ctx: Ctx, walletName: string, amt: number, hash?: string) {
  credit(ctx.s, amt, "Recarga desde " + walletName, hash);
  retryDebits(ctx);
}

/* ============ reporte CSV ============ */
export const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function csv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map((c) => { const x = String(c == null ? "" : c); return /[",\n;]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(",")).join("\n");
}
export function buildReport(g: Group): { filename: string; content: string } {
  const rows: (string | number | null | undefined)[][] = [
    ["Grupo", g.name], ["Código", g.code || "Público (sin código)"],
    ["Tipo", isP(g) ? "Pandero " + g.visibility : (g as JuntaGroup).nature || KIND[g.kind].label], ["Moneda", "XLM (Stellar Lumens)"],
  ];
  const lab: Record<string, string> = { paid: "pagó", pending: "pendiente", late: "atrasado", nofunds: "sin saldo", wait: "inscrito" };
  if (isP(g)) {
    rows.push(["Aporte mensual", g.cuota], ["Participantes", g.capacity], ["Visibilidad", g.visibility], ["Fase", g.phase], ["Ronda", g.round], [], ["Turno", "Participante", "Estado"]);
    mlist(g).forEach((m) => rows.push([g.order ? g.order.indexOf(m.id) + 1 : "", m.name, lab[mstatus(g, m)]]));
  } else {
    const st = jstats(g);
    rows.push(["Monto objetivo", g.goal], ["Cupos", g.capacity], ["Cuota por miembro", cuotaOf(g)], ["Recaudado", st.total], ["Estado", g.status], ["Entregado a", g.releasedToName || "—"], [], ["Miembro", "Abonado", "Falta", "Estado"]);
    st.ms.forEach((m) => rows.push([m.name, m.paid || 0, owed(g, m), lab[mstatus(g, m)]]));
  }
  rows.push([], ["Movimiento", "Tipo", "Monto (XLM)", "Fecha", "Código de transacción"]);
  Object.keys(g.ledger).map((k) => g.ledger[k]).sort((a, b) => (a.at < b.at ? 1 : -1))
    .forEach((t) => rows.push([t.desc, t.type === "out" ? "salida" : "entrada", t.amount, t.at, t.hash]));
  return { filename: "ayni-" + slug(g.name) + ".csv", content: csv(rows) };
}

/* ============ wizard: crear grupo ============ */
export function newWizard(kind: "junta" | "pandero" = "junta"): WizardData {
  return {
    step: 0, kind, nature: "Juntas vecinales", name: "", goal: "1200", cuota: "200", periodo: "", dueDate: addDays(7),
    releaseDate: addDays(21), rule: "fecha", capacity: "", visibility: "publico", accept: false, error: "",
  };
}
export const wizSteps = (w: Pick<WizardData, "kind">) => (w.kind === "pandero" ? 3 : 4);

export function createGroupFromWizard(ctx: Ctx, w: WizardData): string {
  const s = ctx.s, P = w.kind === "pandero", n = parseInt(w.capacity, 10);
  const id = "g" + rid(4);
  const g: Group = P
    ? mkPandero({ name: w.name.trim().slice(0, 60), cuota: r2(parseFloat(w.cuota)), capacity: n, visibility: w.visibility, creator: "me", creatorName: s.me!.name })
    : mkJunta({ kind: "junta", nature: w.nature, name: w.name.trim().slice(0, 60), goal: r2(parseFloat(w.goal)), capacity: n, periodo: "", dueDate: w.dueDate, releaseDate: w.rule === "fecha" ? w.releaseDate : w.dueDate, rule: w.rule, creator: "me" });
  s.groups[id] = g;
  addMember(ctx, g, id, "me", s.me!.name, { code: s.me!.code, silent: true });
  return id;
}

/** Copia sin referencias compartidas (los mutadores del dominio actúan sobre el clon). */
export const cloneState = (s: AyniState): AyniState => structuredClone(s);
