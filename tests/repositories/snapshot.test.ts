import { describe, expect, it } from "vitest";
import { isAdmin, isP, jstats, mstatus } from "@/domain/model";
import type { JuntaGroup, PanderoGroup } from "@/domain/types";
import { buildSnapshot, type SnapshotInput } from "@/repositories/snapshot";

const ME = "11111111-1111-4111-8111-111111111111";
const JORGE = "22222222-2222-4222-8222-222222222222";
const G1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const G2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const input = (): SnapshotInput => ({
  uid: ME,
  profile: { id: ME, name: "Rosa Quispe", email: "rosa@ayni.demo", phone: "", address: "", user_code: "USR-ROSA", created_at: "2026-09-01T00:00:00Z" },
  profilesById: { [ME]: { name: "Rosa Quispe", user_code: "USR-ROSA" }, [JORGE]: { name: "Jorge Mamani", user_code: "USR-JORG" } },
  groups: [
    {
      id: G1, kind: "junta", name: "Vigilancia", code: "AYNI-DEMO", capacity: 3, creator_id: ME, archived: false, archived_at: null, created_at: "2026-09-02T00:00:00Z",
      nature: "Juntas vecinales", goal_stroops: "1500000000", due_date: "2099-01-01", release_date: "2099-02-01", rule: "fecha", status: "custodia",
      admissions_open: true, date_reached: false, ready_at: null, released_at: null, released_amount_stroops: null, released_to: null,
      cuota_stroops: null, visibility: null, phase: null, round: 0, start_date: null,
    },
  ],
  members: [
    { group_id: G1, user_id: ME, role: "treasurer", position: 0, joined_at: "2026-09-02T00:00:00Z", paid_stroops: "0", paid_at: null, reminders: 0, paid_round: 0 },
    { group_id: G1, user_id: JORGE, role: "member", position: 1, joined_at: "2026-09-03T00:00:00Z", paid_stroops: "500000000", paid_at: "2026-09-04T00:00:00Z", reminders: 0, paid_round: 0 },
  ],
  ledger: [
    { id: "l1", group_id: G1, direction: "in", amount_stroops: "500000000", description: "Cuota de Jorge Mamani", method: "Stellar Testnet", tx_hash: "a".repeat(64), actor_id: JORGE, created_at: "2026-09-04T00:00:00Z" },
    { id: "l2", group_id: G1, direction: "in", amount_stroops: "500000000", description: "Cuota de Rosa Quispe", method: "Stellar Testnet", tx_hash: "b".repeat(64), actor_id: ME, created_at: "2026-09-05T00:00:00Z" },
  ],
  notifications: [{ id: "n1", group_id: G1, key: "k1", type: "debit", title: "Pago registrado", body: "…", read: false, created_at: "2026-09-04T00:00:00Z" }],
  publicPanderos: [
    { id: G2, name: "Pandero Mercado Caquetá", cuota_stroops: "2000000000", capacity: 10, phase: "reclutando", round: 0, start_date: null, created_at: "2026-09-05T00:00:00Z", creator_name: "Lucía Huamán", member_count: 4, is_member: false },
  ],
  wallet: { stellar_address: "G" + "A".repeat(55), provider: "freighter", created_at: "2026-09-06T00:00:00Z" },
  testnetBalance: 9999.5,
});

describe("buildSnapshot (Supabase → estado de la UI)", () => {
  it("convierte stroops a XLM, mapea al usuario como 'me' y reconoce al tesorero", () => {
    const s = buildSnapshot(input());
    expect(s.me).toMatchObject({ name: "Rosa Quispe", code: "USR-ROSA" });
    const g = s.groups[G1] as JuntaGroup;
    expect(g.goal).toBe(150);
    expect(g.creator).toBe("me");
    expect(isAdmin(g)).toBe(true);
    expect(Object.keys(g.members).sort()).toEqual([JORGE, "me"].sort());
    expect(g.members[JORGE]).toMatchObject({ name: "Jorge Mamani", paid: 50 });
    const st = jstats(g);
    expect(st.total).toBe(50);
    expect(st.paid).toBe(1);
    expect(mstatus(g, g.members.me)).toBe("pending");
  });
  it("trae el registro transparente con hash y método", () => {
    const g = buildSnapshot(input()).groups[G1];
    expect(g.ledger.l1).toEqual({ type: "in", amount: 50, desc: "Cuota de Jorge Mamani", hash: "a".repeat(64), at: "2026-09-04T00:00:00Z", method: "Stellar Testnet" });
    expect(Object.keys(g.ledger)).toHaveLength(2);
  });
  it("mis movimientos de wallet son solo las cuotas que YO pagué (por actor, no por nombre)", () => {
    const s = buildSnapshot(input());
    expect(s.wallet!.moves).toEqual([
      { id: "l2", type: "out", amount: 50, desc: "Cuota · Vigilancia", at: "2026-09-05T00:00:00Z", hash: "b".repeat(64) },
    ]);
  });
  it("el foro incluye panderos públicos ajenos solo con cifras (sin exponer miembros)", () => {
    const g = buildSnapshot(input()).groups[G2] as PanderoGroup;
    expect(isP(g)).toBe(true);
    expect(g).toMatchObject({ visibility: "publico", cuota: 200, creatorName: "Lucía Huamán", code: null });
    expect(Object.keys(g.members)).toHaveLength(4);
    expect(Object.values(g.members).every((m) => m.name === "Participante")).toBe(true);
    expect(g.members.me).toBeUndefined(); // no soy miembro
  });
  it("la wallet usa el saldo de Testnet y la dirección registrada; notificaciones con su estado de lectura", () => {
    const s = buildSnapshot(input());
    expect(s.wallet).toMatchObject({ bal: 9999.5, address: "G" + "A".repeat(55) });
    expect(s.wallet!.conn.freighter).toBeDefined();
    expect(s.notifs[0]).toMatchObject({ key: "k1", read: false, gid: G1 });
  });
  it("sin wallet registrada, saldo 0 y sin conexiones", () => {
    const i = input();
    i.wallet = null;
    i.testnetBalance = 0;
    expect(buildSnapshot(i).wallet).toMatchObject({ address: "", bal: 0, conn: {} });
  });
});
