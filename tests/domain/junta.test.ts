import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as A from "@/domain/actions";
import { condMet, cuotaOf, filtered, isAdmin, jstats, ledgerList, mstatus, owed } from "@/domain/model";
import { freezeEnv, junta, makeCtx, type TestCtx } from "../helpers";

let restore: () => void;
let ctx: TestCtx;
beforeEach(() => { restore = freezeEnv(); ctx = makeCtx(); });
afterEach(() => restore());

describe("estado inicial de la junta demo (Vigilancia Jr. Los Olivos)", () => {
  it("13 de 24 pagaron, 650 de 1,200 XLM (54%) y la cuota es 50 XLM", () => {
    const g = junta(ctx);
    const s = jstats(g);
    expect(s.paid).toBe(13);
    expect(s.total).toBe(650);
    expect(s.pct).toBe(54);
    expect(s.free).toBe(1);
    expect(cuotaOf(g)).toBe(50);
    expect(owed(g, g.members.me)).toBe(50);
  });
  it("el creador es tesorero; en otro grupo no lo es", () => {
    expect(isAdmin(junta(ctx))).toBe(true);
    expect(isAdmin(junta(ctx, "g3"))).toBe(false);
  });
});

describe("filtros de miembros", () => {
  it("Pagó / Pendiente / Atrasado / Todos y búsqueda por nombre", () => {
    const g = junta(ctx);
    // la fecha límite (dueDate) ya venció → quien no pagó está "atrasado"
    expect(filtered(g, "all")).toHaveLength(23);
    expect(filtered(g, "paid")).toHaveLength(13);
    expect(filtered(g, "late")).toHaveLength(10);
    expect(filtered(g, "pending")).toHaveLength(0);
    expect(mstatus(g, g.members.me)).toBe("late");
    const rosa = filtered(g, "all", "rosa");
    expect(rosa.length).toBeGreaterThan(0);
    expect(rosa.every((m) => m.name.toLowerCase().includes("rosa"))).toBe(true);
  });
  it("con fecha límite futura los que no pagaron figuran como Pendiente", () => {
    const g = junta(ctx, "g3");
    expect(filtered(g, "pending").length).toBeGreaterThan(0);
    expect(filtered(g, "late")).toHaveLength(0);
  });
});

describe("modo demo — fondo común", () => {
  it("'Simular que alguien se une' agrega un miembro y llena el cupo libre", () => {
    const g = junta(ctx);
    A.simJoin(ctx, "g1");
    expect(Object.keys(g.members)).toHaveLength(24);
    expect(jstats(g).free).toBe(0);
    expect(ctx.toasts.at(-1)).toMatch(/se unió con el código/);
    // al llegar a la capacidad máxima se notifica al miembro
    expect(ctx.s.notifs.some((n) => n.type === "full")).toBe(true);
  });
  it("'Simular pago de otro miembro' cobra el saldo, registra en el ledger y sube el progreso", () => {
    const g = junta(ctx);
    const before = jstats(g);
    const ledgerBefore = ledgerList(g).length;
    expect(A.simPay(ctx, "g1")).toBe(true);
    const after = jstats(g);
    expect(after.paid).toBe(before.paid + 1);
    expect(after.total).toBe(before.total + 50);
    expect(ledgerList(g)).toHaveLength(ledgerBefore + 1);
    expect(ledgerList(g)[0]).toMatchObject({ type: "in", amount: 50, method: "Cuenta Ayni" });
  });
  it("'Simular pago' nunca paga por el propio usuario", () => {
    const g = junta(ctx);
    for (let i = 0; i < 30; i++) A.simPay(ctx, "g1");
    expect(g.members.me.paid).toBe(0);
    expect(A.simPay(ctx, "g1")).toBe(false); // ya no quedan otros pendientes
  });
  it("'Simular que llegó la fecha de cierre' cumple la condición y pasa a 'listo para disponer'", () => {
    const g = junta(ctx, "g3");
    expect(condMet(g)).toBe(false);
    A.simDate(ctx, "g3");
    expect(condMet(g)).toBe(true);
    expect(A.releasable(ctx.s)).toContain("g3");
    A.markReady(ctx, "g3");
    expect(g.status).toBe("listo");
  });
  it("con regla 'meta' cierra solo cuando todos completaron su cuota", () => {
    const g = junta(ctx, "g4");
    g.rule = "meta";
    expect(condMet(g)).toBe(false);
    Object.keys(g.members).forEach((k) => A.seedPay(g, k, 1));
    expect(condMet(g)).toBe(false); // faltan 2 cupos por ocupar
    g.capacity = Object.keys(g.members).length; // 10 cupos → la cuota sube a 72
    expect(condMet(g)).toBe(false); // todos deben la diferencia
    Object.keys(g.members).forEach((k) => A.seedPay(g, k, 1));
    expect(condMet(g)).toBe(true);
  });
});

describe("pago de la propia cuota", () => {
  it("debita la billetera, marca como pagado y registra el ledger con el mismo hash", () => {
    const g = junta(ctx);
    const bal = ctx.s.wallet!.bal;
    expect(A.payCuota(ctx, "g1", 50, "a".repeat(64))).toBe(true);
    expect(ctx.s.wallet!.bal).toBe(bal - 50);
    expect(mstatus(g, g.members.me)).toBe("paid");
    expect(ledgerList(g)[0].hash).toBe("a".repeat(64));
    expect(ctx.s.wallet!.moves[0]).toMatchObject({ type: "out", amount: 50 });
  });
  it("no paga con saldo insuficiente y no altera nada", () => {
    ctx.s.wallet!.bal = 10;
    const g = junta(ctx);
    expect(A.payCuota(ctx, "g1", 50, "b".repeat(64))).toBe(false);
    expect(ctx.s.wallet!.bal).toBe(10);
    expect(g.members.me.paid).toBe(0);
  });
});

describe("disposición del fondo", () => {
  function ready(id = "g1") {
    const g = junta(ctx, id);
    g.dateReached = true;
    A.markReady(ctx, id);
    return g;
  }
  it("el tesorero recolecta en su wallet: acredita el saldo, registra salida y notifica", () => {
    const g = ready();
    const total = jstats(g).total;
    const bal = ctx.s.wallet!.bal;
    A.dispose(ctx, "g1", "me");
    expect(g.status).toBe("liberado");
    expect(g.releasedAmount).toBe(total);
    expect(ctx.s.wallet!.bal).toBe(bal + total);
    expect(ledgerList(g)[0]).toMatchObject({ type: "out", amount: total, method: "Disposición del tesorero" });
  });
  it("puede enviarlo a un participante sin tocar su billetera", () => {
    const g = ready();
    const bal = ctx.s.wallet!.bal;
    A.dispose(ctx, "g1", "x0");
    expect(ctx.s.wallet!.bal).toBe(bal);
    expect(g.releasedToName).toBe(g.members.x0.name);
  });
  it("nuevo ciclo reinicia pagos y fechas; archivar oculta el grupo", () => {
    const g = ready();
    A.dispose(ctx, "g1", "me");
    A.newCycle(ctx, "g1");
    expect(g.status).toBe("custodia");
    expect(jstats(g).total).toBe(0);
    A.archive(ctx, "g1");
    expect(g.archived).toBe(true);
  });
});

describe("agente de recordatorios", () => {
  it("prepara un mensaje por cada miembro con saldo (sin incluir al tesorero) y al marcarlos suma recordatorios", () => {
    const g = junta(ctx);
    const msgs = A.agentMessages(g);
    expect(msgs).toHaveLength(9);
    expect(msgs[0].text).toContain("bloqueado en la bóveda");
    ctx.s.agent.g1 = { msgs };
    const before = g.members[msgs[0].id].reminders;
    A.logAgent(ctx, "g1");
    expect(g.members[msgs[0].id].reminders).toBe(before + 1);
    expect(ctx.s.agent.g1).toEqual({});
  });
});
