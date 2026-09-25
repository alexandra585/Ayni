import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as A from "@/domain/actions";
import { allPaid, jstats, ledgerList, mlist, mstatus } from "@/domain/model";
import { freezeEnv, makeCtx, pandero, type TestCtx } from "../helpers";

let restore: () => void;
let ctx: TestCtx;
beforeEach(() => { restore = freezeEnv(); ctx = makeCtx(); });
afterEach(() => restore());

describe("pandero — reclutamiento y espera", () => {
  it("'Simular que alguien se une' llena cupos; al completarse cierra el ingreso y pasa a espera (inicio en 30 días)", () => {
    const g = pandero(ctx, "g5"); // 4 de 6 inscritos
    expect(g.phase).toBe("reclutando");
    A.psJoin(ctx, "g5");
    expect(g.phase).toBe("reclutando");
    expect(ctx.toasts.at(-1)).toBe("Alguien se unió al pandero");
    A.psJoin(ctx, "g5");
    expect(g.phase).toBe("espera");
    expect(g.startDate).toBe("2026-10-24");
  });
  it("si el usuario ya está dentro, al completarse se le notifica que el juego empieza y se debitará su aporte", () => {
    const g = pandero(ctx, "g5");
    g.members.me = { ...g.members.v0, name: "Rosa Quispe", code: "USR-TEST" }; // 5 de 6
    A.psJoin(ctx, "g5");
    expect(g.phase).toBe("espera");
    expect(ctx.s.notifs[0]).toMatchObject({ type: "full", title: "Se completó Pandero de la cuadra 7" });
  });
  it("estado 'espera': avisa la víspera si el saldo es bajo y permite recargar", () => {
    const g = pandero(ctx, "g5");
    g.members.me = { ...g.members.v0, name: "Rosa Quispe" };
    g.phase = "espera";
    g.startDate = "2026-09-25";
    A.checkTimed(ctx);
    expect(ctx.s.notifs[0].title).toContain("Mañana empieza");
    expect(A.canAfford(ctx.s, g.cuota)).toBe(true);
    ctx.s.wallet!.bal = 10;
    expect(A.canAfford(ctx.s, g.cuota)).toBe(false);
  });
});

describe("pandero — juego (Pandero del taller, ronda 1 de 8)", () => {
  it("estado inicial: todos aportaron la ronda 1 y el turno del usuario es el 3", () => {
    const g = pandero(ctx);
    expect(g.round).toBe(1);
    expect(allPaid(g)).toBe(true);
    expect(g.order!.indexOf("me") + 1).toBe(3);
    expect(mstatus(g, g.members.me)).toBe("paid");
  });
  it("'Simular fin de mes' abona el pozo, avanza de ronda y cobra automáticamente (uno queda sin saldo)", () => {
    const g = pandero(ctx);
    ctx.s.wallet!.bal = 1000;
    const bal = ctx.s.wallet!.bal;
    A.monthEnd(ctx, "g2");
    expect(g.payouts[1]).toBe(true);
    expect(g.round).toBe(2);
    expect(ledgerList(g).some((t) => t.type === "out" && t.amount === 3200)).toBe(true);
    // el usuario paga su aporte de la ronda 2 desde la billetera
    expect(ctx.s.wallet!.bal).toBe(bal - 400);
    expect(g.members.me.paidRound).toBe(2);
    // uno de los demás participantes queda "sin saldo" (fallo simulado)
    const broke = mlist(g).filter((m) => mstatus(g, m) === "nofunds");
    expect(broke).toHaveLength(1);
    expect(allPaid(g)).toBe(false);
  });
  it("con el saldo demo (350 XLM) el usuario no alcanza el aporte de 400 y queda 'sin saldo' (estado D)", () => {
    const g = pandero(ctx);
    A.monthEnd(ctx, "g2");
    expect(ctx.s.wallet!.bal).toBe(350);
    expect(mstatus(g, g.members.me)).toBe("nofunds");
    expect(ctx.s.notifs.some((n) => n.type === "nofunds")).toBe(true);
  });
  it("no se abona el pozo mientras falten aportes", () => {
    const g = pandero(ctx);
    ctx.s.wallet!.bal = 1000;
    A.monthEnd(ctx, "g2");
    A.monthEnd(ctx, "g2");
    expect(g.round).toBe(2);
    expect(ctx.toasts.at(-1)).toContain("Aún faltan aportes");
  });
  it("'Simular que X recarga' completa la ronda y avisa que el pozo está listo", () => {
    const g = pandero(ctx);
    ctx.s.wallet!.bal = 1000;
    A.monthEnd(ctx, "g2");
    A.psPay(ctx, "g2");
    expect(allPaid(g)).toBe(true);
    expect(ctx.s.notifs.some((n) => n.title.startsWith("Pozo de la ronda 2 listo"))).toBe(true);
  });
  it("si el usuario no tiene saldo queda 'sin saldo'; al recargar se cobra automáticamente", () => {
    const g = pandero(ctx);
    ctx.s.wallet!.bal = 100;
    A.monthEnd(ctx, "g2");
    expect(mstatus(g, g.members.me)).toBe("nofunds");
    expect(ctx.s.notifs.some((n) => n.type === "nofunds")).toBe(true);
    A.applyTopup(ctx, "Freighter", 500);
    expect(mstatus(g, g.members.me)).toBe("paid");
    expect(ctx.s.wallet!.bal).toBe(200);
  });
  it("juega las 8 rondas completas hasta 'terminado' y el usuario recibe su pozo en la ronda 3", () => {
    const g = pandero(ctx);
    ctx.s.wallet!.bal = 100_000;
    let potReceived = 0;
    for (let guard = 0; guard < 40 && g.phase !== "terminado"; guard++) {
      if (!allPaid(g)) A.psPay(ctx, "g2");
      const balBefore = ctx.s.wallet!.bal;
      const round = g.round;
      A.monthEnd(ctx, "g2");
      if (round === 3) potReceived = ctx.s.wallet!.bal - balBefore;
    }
    expect(g.phase).toBe("terminado");
    expect(Object.keys(g.payouts)).toHaveLength(8);
    expect(potReceived).toBe(3200 - 400); // recibe el pozo y paga su aporte de la ronda 4
    expect(ctx.s.notifs.some((n) => n.type === "pot")).toBe(true);
    expect(ctx.s.notifs.some((n) => n.title.startsWith("Terminó"))).toBe(true);
  });
  it("el creador NO tiene privilegios financieros: no es tesorero del pandero", async () => {
    const { isAdmin } = await import("@/domain/model");
    expect(pandero(ctx).creator).toBe("me");
    expect(isAdmin(pandero(ctx))).toBe(false);
  });
});

describe("pandero — inicio del juego", () => {
  it("'Simular que pasó el mes' sortea el orden, cobra la ronda 1 y notifica el turno", () => {
    const g = pandero(ctx, "g5");
    g.members.me = { ...g.members.v0, name: "Rosa Quispe" };
    A.psJoin(ctx, "g5");
    expect(g.phase).toBe("espera");
    const bal = ctx.s.wallet!.bal;
    A.startGame(ctx, "g5");
    expect(g.phase).toBe("juego");
    expect(new Set(g.order).size).toBe(6);
    expect(ctx.s.wallet!.bal).toBe(bal - 150);
    expect(jstats(g).n).toBe(6);
  });
});
