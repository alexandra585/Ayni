import { addDays, daysTo, fdate, r2, xlm } from "@/lib/format";
import { env } from "./env";
import type {
  AyniState,
  DirUser,
  Group,
  JuntaGroup,
  LedgerEntry,
  LedgerEntryWithId,
  Member,
  MemberFilter,
  MemberStatus,
  MemberWithId,
  PanderoGroup,
} from "./types";
import { rid } from "./env";

export const KIND = {
  junta: { label: "Junta Vecinal", ico: "home", unit: "casa" },
  promocion: { label: "Comité Escolar", ico: "cap", unit: "familia" },
  pandero: { label: "Pandero", ico: "users", unit: "persona" },
} as const;

export const NATURES = [
  "Comités escolares",
  "Juntas vecinales",
  "Condominios pequeños",
  "Equipos / clubes",
  "Grupos de trabajadores",
] as const;

export const isP = (g: Group): g is PanderoGroup => g.kind === "pandero";
export const isJunta = (g: Group): g is JuntaGroup => g.kind !== "pandero";
export const isMember = (g: Group | undefined | null): boolean => !!(g && g.members && g.members.me);
export const isAdmin = (g: Group): boolean => !isP(g) && g.creator === "me";
export const cuotaOf = (g: Group): number => (isP(g) ? g.cuota : r2(g.goal / g.capacity));
export const owed = (g: Group, m: Member): number => r2(Math.max(0, cuotaOf(g) - (m.paid || 0)));

export function mstatus(g: Group, m: Member): MemberStatus {
  if (isP(g)) {
    if (g.phase === "juego" || g.phase === "terminado") return (m.paidRound || 0) >= g.round ? "paid" : "nofunds";
    return "wait";
  }
  if (owed(g, m) <= 0.004) return "paid";
  return daysTo(g.dueDate) < 0 ? "late" : "pending";
}

export function mlist(g: Group): MemberWithId[] {
  const ms = Object.keys(g.members).map((k) => ({ id: k, ...g.members[k] }));
  if (isP(g) && g.order) {
    const pos: Record<string, number> = {};
    g.order.forEach((id, i) => (pos[id] = i));
    return ms.sort((a, b) => pos[a.id] - pos[b.id]);
  }
  return ms.sort((a, b) => {
    if (a.id === "me") return -1;
    if (b.id === "me") return 1;
    return a.order - b.order;
  });
}

export function jstats(g: Group) {
  const ms = mlist(g);
  const total = r2(ms.reduce((a, m) => a + (m.paid || 0), 0));
  const paid = ms.filter((m) => mstatus(g, m) === "paid").length;
  const goal = isP(g) ? 0 : g.goal;
  return {
    ms,
    n: ms.length,
    cap: g.capacity,
    free: Math.max(0, g.capacity - ms.length),
    paid,
    total,
    goal,
    pct: goal ? Math.min(100, Math.round((total / goal) * 100)) : 0,
  };
}

export function condMet(g: JuntaGroup): boolean {
  const s = jstats(g);
  if (g.rule === "meta") return s.n === s.cap && s.paid === s.cap;
  return daysTo(g.releaseDate) <= 0 || !!g.dateReached;
}

export function ledgerList(g: Group): LedgerEntryWithId[] {
  return Object.keys(g.ledger)
    .map((k) => ({ id: k, ...g.ledger[k] }))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

/** Registra un movimiento en el ledger del grupo y devuelve el hash. */
export function led(
  g: Group,
  type: "in" | "out",
  amount: number,
  desc: string,
  method?: string,
  at?: string | null,
  hash?: string,
): string {
  const h = hash || rid(32);
  const entry: LedgerEntry = {
    type,
    amount: r2(amount),
    desc,
    hash: h,
    at: at || env.now().toISOString(),
    method,
  };
  g.ledger["t" + rid(6)] = entry;
  return h;
}

export const groupIds = (s: AyniState) => Object.keys(s.groups);
export const myGroupIds = (s: AyniState) =>
  groupIds(s)
    .filter((id) => isMember(s.groups[id]) && !s.groups[id].archived)
    .sort((a, b) => (s.groups[b].createdAt > s.groups[a].createdAt ? 1 : -1));
export const findUser = (s: AyniState, code: string): DirUser | undefined => s.dir.find((u) => u.code === code);
export const freeUsers = (s: AyniState, g: Group): DirUser[] => s.dir.filter((u) => !g.members[u.id]);

/* pandero */
export const payoutDate = (g: PanderoGroup, r: number) => addDays(30 * r, g.startDate);
export const allPaid = (g: PanderoGroup) =>
  Object.keys(g.members).every((k) => (g.members[k].paidRound || 0) >= g.round);

/* filtros de miembros */
export function filtersFor(g: Group): [MemberFilter, string][] | null {
  if (isP(g)) return g.phase === "juego" || g.phase === "terminado" ? [["all", "Todos"], ["paid", "Aportó"], ["nofunds", "Sin saldo"]] : null;
  return [["all", "Todos"], ["paid", "Pagó"], ["pending", "Pendiente"], ["late", "Atrasado"]];
}
export function filtered(g: Group, f: MemberFilter, q?: string): MemberWithId[] {
  return mlist(g).filter(
    (m) => (f === "all" || mstatus(g, m) === f) && (!q || m.name.toLowerCase().indexOf(q.toLowerCase()) >= 0),
  );
}

export function groupStatusText(g: Group): string {
  const me = g.members.me;
  if (isP(g)) {
    const n = Object.keys(g.members).length;
    return {
      reclutando: "Reclutando " + n + "/" + g.capacity,
      espera: "Empieza el " + fdate(g.startDate),
      juego: "Ronda " + g.round + " de " + g.capacity + (mstatus(g, me) === "nofunds" ? " · sin saldo" : ""),
      terminado: "Terminado",
    }[g.phase];
  }
  if (g.status === "liberado") return "Finalizado";
  if (g.status === "listo") return "Recolección cerrada";
  return owed(g, me) > 0 ? "Te falta " + xlm(owed(g, me)) : "Cuota completa";
}

export function inviteText(g: Group): string {
  const xlmFmt = xlm;
  return isP(g)
    ? 'Únete a "' + g.name + '" en Ayni: pandero privado de ' + g.capacity + " personas, aporte mensual de " + xlmFmt(g.cuota) + ". Código: " + g.code + "."
    : 'Únete a "' + g.name + '" en Ayni. Monto a reunir: ' + xlmFmt(g.goal) + ". Código del grupo: " + g.code + ". El dinero queda bloqueado en la bóveda y nadie puede retirarlo.";
}

/** Valida el código de invitación AYNI-XXXX: exactamente 9 caracteres, incluido el guion. */
export function normalizeInviteCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s/g, "");
}
export function isValidInviteCodeFormat(code: string): boolean {
  return code.length === 9 && /^AYNI-[A-Z0-9]{4}$/.test(code);
}
