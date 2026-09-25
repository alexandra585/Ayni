/**
 * Convierte filas de Supabase (dinero en stroops, ids uuid) al `AyniState` que consume la UI
 * (XLM con 2 decimales, el usuario actual como "me"). Es una función pura y está probada.
 */
import type { AyniState, JuntaGroup, LedgerEntry, Member, Notif, PanderoGroup, WalletMove, WalletState } from "@/domain/types";
import { stroopsToXlm } from "@/lib/money";

export interface ProfileRow { id: string; name: string; email: string; phone: string; address: string; user_code: string; created_at: string }
export interface GroupRow {
  id: string; kind: "junta" | "promocion" | "pandero"; name: string; code: string | null; capacity: number; creator_id: string;
  archived: boolean; archived_at: string | null; created_at: string;
  nature: string | null; goal_stroops: string | number | null; due_date: string | null; release_date: string | null;
  rule: "fecha" | "meta" | null; status: "custodia" | "listo" | "liberado" | null; admissions_open: boolean; date_reached: boolean;
  ready_at: string | null; released_at: string | null; released_amount_stroops: string | number | null; released_to: string | null;
  cuota_stroops: string | number | null; visibility: "publico" | "privado" | null;
  phase: "reclutando" | "espera" | "juego" | "terminado" | null; round: number; start_date: string | null;
}
export interface MemberRow {
  group_id: string; user_id: string; role: "treasurer" | "member"; position: number; joined_at: string;
  paid_stroops: string | number; paid_at: string | null; reminders: number; paid_round: number;
}
export interface LedgerRow {
  id: string; group_id: string; direction: "in" | "out"; amount_stroops: string | number; description: string;
  method: string | null; tx_hash: string | null; actor_id: string | null; created_at: string;
}
export interface NotificationRow {
  id: string; group_id: string | null; key: string; type: Notif["type"]; title: string; body: string; read: boolean; created_at: string;
}
export interface PublicPanderoRow {
  id: string; name: string; cuota_stroops: string | number; capacity: number; phase: "reclutando" | "espera" | "juego" | "terminado";
  round: number; start_date: string | null; created_at: string; creator_name: string; member_count: number; is_member: boolean;
}
export interface WalletRow { stellar_address: string; provider: "freighter" | "cavos" | "privy"; created_at: string }
export interface TurnRow { group_id: string; user_id: string; turn: number }
export interface RoundRow { group_id: string; round: number; paid_out: boolean }

export interface SnapshotInput {
  uid: string;
  profile: ProfileRow;
  profilesById: Record<string, Pick<ProfileRow, "name" | "user_code">>;
  groups: GroupRow[];
  members: MemberRow[];
  ledger: LedgerRow[];
  notifications: NotificationRow[];
  publicPanderos: PublicPanderoRow[];
  wallet: WalletRow | null;
  /** Saldo XLM de la wallet en Stellar Testnet (Horizon), 0 si no hay wallet. */
  testnetBalance: number;
  turns?: TurnRow[];
  rounds?: RoundRow[];
}

const x = (v: string | number | null | undefined) => stroopsToXlm(v == null ? 0 : v);
const day = (iso: string | null) => (iso ? String(iso).slice(0, 10) : "");

export function buildSnapshot(inp: SnapshotInput): AyniState {
  const { uid } = inp;
  const key = (id: string) => (id === uid ? "me" : id);
  const s: AyniState = { me: null, wallet: null, groups: {}, dir: [], notifs: [], agent: {}, filter: {}, nameIdx: 0 };

  s.me = {
    name: inp.profile.name, email: inp.profile.email, phone: inp.profile.phone, address: inp.profile.address,
    since: inp.profile.created_at, code: inp.profile.user_code,
  };

  const ledgerByGroup: Record<string, Record<string, LedgerEntry>> = {};
  for (const l of inp.ledger) {
    (ledgerByGroup[l.group_id] ||= {})[l.id] = {
      type: l.direction, amount: x(l.amount_stroops), desc: l.description, hash: l.tx_hash || "", at: l.created_at, method: l.method || undefined,
    };
  }
  const membersByGroup: Record<string, Record<string, Member>> = {};
  for (const m of inp.members) {
    const p = inp.profilesById[m.user_id];
    (membersByGroup[m.group_id] ||= {})[key(m.user_id)] = {
      name: p?.name || "Participante", order: m.position, joinedAt: m.joined_at, paid: x(m.paid_stroops), paidAt: m.paid_at,
      reminders: m.reminders, paidRound: m.paid_round, code: m.user_id === uid ? inp.profile.user_code : null,
    };
  }
  const turnsByGroup: Record<string, string[]> = {};
  for (const t of [...(inp.turns || [])].sort((a, b) => a.turn - b.turn)) (turnsByGroup[t.group_id] ||= []).push(key(t.user_id));
  const payouts: Record<string, Record<number, boolean>> = {};
  for (const r of inp.rounds || []) if (r.paid_out) (payouts[r.group_id] ||= {})[r.round] = true;

  const creatorName = (g: GroupRow) => inp.profilesById[g.creator_id]?.name || "";

  for (const g of inp.groups) {
    const members = membersByGroup[g.id] || {};
    const base = {
      name: g.name, code: g.code, capacity: g.capacity, createdAt: g.created_at, creator: key(g.creator_id),
      members, ledger: ledgerByGroup[g.id] || {}, demo: false, archived: g.archived || undefined, archivedAt: g.archived_at || undefined,
    };
    if (g.kind === "pandero") {
      const order = turnsByGroup[g.id];
      const grp: PanderoGroup = {
        ...base, kind: "pandero", cuota: x(g.cuota_stroops), visibility: g.visibility || "privado", phase: g.phase || "reclutando",
        round: g.round, order: order && order.length ? order : null, payouts: payouts[g.id] || {}, creatorName: creatorName(g),
        startDate: day(g.start_date) || undefined, broke: {},
      };
      s.groups[g.id] = grp;
    } else {
      const grp: JuntaGroup = {
        ...base, kind: g.kind, nature: g.nature || "", goal: x(g.goal_stroops), periodo: "", dueDate: day(g.due_date), releaseDate: day(g.release_date),
        rule: g.rule || "fecha", status: g.status || "custodia", admissionsOpen: g.admissions_open, dateReached: g.date_reached || undefined,
        readyAt: g.ready_at || undefined, releasedAt: g.released_at, releasedAmount: g.released_amount_stroops == null ? null : x(g.released_amount_stroops),
        releasedTo: g.released_to ? key(g.released_to) : null,
        releasedToName: g.released_to ? inp.profilesById[g.released_to]?.name || null : null,
      };
      s.groups[g.id] = grp;
    }
  }

  // Panderos públicos que aún no integro: se muestran en el foro (solo cifras; sin exponer miembros).
  for (const p of inp.publicPanderos) {
    if (s.groups[p.id]) continue;
    const members: Record<string, Member> = {};
    for (let i = 0; i < p.member_count; i++)
      members["pub" + i] = { name: "Participante", order: i, joinedAt: p.created_at, paid: 0, paidAt: null, reminders: 0, paidRound: 0, code: null };
    s.groups[p.id] = {
      kind: "pandero", name: p.name, code: null, capacity: p.capacity, createdAt: p.created_at, creator: "pub-creator", members, ledger: {}, demo: false,
      cuota: x(p.cuota_stroops), visibility: "publico", phase: p.phase, round: p.round, order: null, payouts: {}, creatorName: p.creator_name,
      startDate: day(p.start_date) || undefined, broke: {},
    } as PanderoGroup;
  }

  s.notifs = inp.notifications.map((n) => ({ key: n.key, type: n.type, title: n.title, body: n.body, gid: n.group_id, at: n.created_at, read: n.read }));

  // Movimientos de mi wallet = mis cuotas pagadas (salida) + fondos que recibí como destino (entrada).
  const moves: WalletMove[] = [];
  for (const g of inp.groups) {
    for (const l of inp.ledger.filter((e) => e.group_id === g.id)) {
      const mine = l.direction === "in" && l.actor_id === uid && /^Cuota de /.test(l.description);
      const received = l.direction === "out" && g.released_to === uid && /Entregado a|Recolectado por/.test(l.description);
      if (mine || received) moves.push({ id: l.id, type: mine ? "out" : "in", amount: x(l.amount_stroops), desc: (mine ? "Cuota · " : "Fondo recibido · ") + g.name, at: l.created_at, hash: l.tx_hash || "" });
    }
  }
  moves.sort((a, b) => (a.at < b.at ? 1 : -1));
  const wallet: WalletState = {
    address: inp.wallet?.stellar_address || "",
    bal: inp.testnetBalance,
    conn: inp.wallet ? { [inp.wallet.provider]: { addr: inp.wallet.stellar_address, at: inp.wallet.created_at } } : {},
    moves,
  };
  s.wallet = wallet;
  return s;
}
