import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as A from "@/domain/actions";
import { cuotaOf, jstats, ledgerList } from "@/domain/model";
import { freezeEnv, junta, makeCtx, type TestCtx } from "../helpers";

let restore: () => void;
let ctx: TestCtx;
beforeEach(() => { restore = freezeEnv(); ctx = makeCtx(); });
afterEach(() => restore());

describe("recálculo de cuotas (panel del tesorero)", () => {
  it("bajar el monto devuelve la diferencia a quienes ya pagaron de más", () => {
    const g = junta(ctx);
    const p = A.preview(g, { goal: 960 }); // 960/24 = 40
    expect(p.oldC).toBe(50);
    expect(p.newC).toBe(40);
    expect(p.refunds).toHaveLength(13);
    expect(p.totalRefund).toBe(130);
    A.applyChange(ctx, "g1", { goal: 960 });
    expect(g.goal).toBe(960);
    expect(cuotaOf(g)).toBe(40);
    expect(jstats(g).total).toBe(13 * 40);
    expect(ledgerList(g).filter((t) => t.method === "Devolución automática")).toHaveLength(13);
  });
  it("subir el monto aumenta lo que deben los demás, sin devoluciones", () => {
    const g = junta(ctx);
    const p = A.preview(g, { goal: 1440 }); // 60
    expect(p.refunds).toHaveLength(0);
    expect(p.more.length).toBeGreaterThan(0);
    A.applyChange(ctx, "g1", { goal: 1440 });
    expect(A.pendingReminders(g).length).toBe(22); // todos deben más (los que pagaron 50 deben 10)
  });
  it("quitar un miembro que pagó le devuelve su abono y elimina su lugar (drop) o lo deja libre (free)", () => {
    const g = junta(ctx);
    const paid = Object.keys(g.members).find((k) => k !== "me" && g.members[k].paid > 0)!;
    const p = A.preview(g, { removeId: paid, capDelta: -1 });
    expect(p.removedRefund).toBe(50);
    expect(p.newCap).toBe(23);
    A.applyChange(ctx, "g1", { removeId: paid, capDelta: -1 });
    expect(g.members[paid]).toBeUndefined();
    expect(g.capacity).toBe(23);
    expect(ledgerList(g)[0]).toMatchObject({ type: "out", amount: 50 });
  });
  it("dejar el lugar libre mantiene la cuota", () => {
    const g = junta(ctx);
    const paid = Object.keys(g.members).find((k) => k !== "me" && g.members[k].paid > 0)!;
    A.applyChange(ctx, "g1", { removeId: paid, capDelta: 0 });
    expect(g.capacity).toBe(24);
    expect(cuotaOf(g)).toBe(50);
    expect(jstats(g).free).toBe(2);
  });
  it("si el tesorero recibe una devolución, se acredita en su billetera y se notifica", () => {
    const g = junta(ctx);
    A.seedPay(g, "me", 1);
    const bal = ctx.s.wallet!.bal;
    A.applyChange(ctx, "g1", { goal: 960 });
    expect(ctx.s.wallet!.bal).toBe(bal + 10);
    expect(ctx.s.notifs[0].type).toBe("refund");
  });
});

describe("agregar miembros por código de usuario", () => {
  it("con lugar libre agrega directo", () => {
    const u = ctx.s.dir[0];
    const r = A.addByCode(ctx, "g1", u.code);
    expect(r).toMatchObject({ ok: true, added: { id: u.id } });
    expect(junta(ctx).members[u.id]).toBeDefined();
  });
  it("acepta el código sin el prefijo USR-", () => {
    const u = ctx.s.dir[1];
    expect(A.addByCode(ctx, "g1", u.code.slice(4).toLowerCase())).toMatchObject({ ok: true });
  });
  it("con el grupo lleno pide recalcular (suma un cupo)", () => {
    A.simJoin(ctx, "g1");
    const r = A.addByCode(ctx, "g1", ctx.s.dir[2].code);
    expect(r).toMatchObject({ ok: true, recalc: { id: ctx.s.dir[2].id } });
    A.applyChange(ctx, "g1", { capDelta: 1, addUser: ctx.s.dir[2] });
    expect(junta(ctx).capacity).toBe(25);
    expect(junta(ctx).members[ctx.s.dir[2].id]).toBeDefined();
  });
  it("errores: código propio, inexistente y ya miembro", () => {
    expect(A.addByCode(ctx, "g1", "USR-TEST")).toEqual({ ok: false, error: "Ese es tu propio código." });
    expect(A.addByCode(ctx, "g1", "USR-NOPE")).toEqual({ ok: false, error: "No existe un usuario con ese código." });
    const u = ctx.s.dir[0];
    A.addByCode(ctx, "g1", u.code);
    expect(A.addByCode(ctx, "g1", u.code)).toMatchObject({ ok: false });
  });
  it("abrir/cerrar el ingreso alterna el estado", () => {
    const g = junta(ctx);
    A.toggleAdmissions(ctx, "g1");
    expect(g.admissionsOpen).toBe(false);
    A.toggleAdmissions(ctx, "g1");
    expect(g.admissionsOpen).toBe(true);
  });
});
