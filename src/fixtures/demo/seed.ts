/** Datos de ejemplo del modo demo (mismos que el prototipo: 7 grupos + foro + billetera + notificaciones). */
import { addMember, mkJunta, mkPandero, nextName, seedPay } from "@/domain/actions";
import { rid, shuffle, stellarAddr, userCode } from "@/domain/env";
import { led } from "@/domain/model";
import type { AyniState, Ctx, Group } from "@/domain/types";
import { addDays, ago, fdate } from "@/lib/format";

export function emptyState(): AyniState {
  return { me: null, wallet: null, groups: {}, dir: [], notifs: [], agent: {}, filter: {}, nameIdx: 0 };
}

export function seedDemo(ctx: Ctx) {
  const s = ctx.s;
  const me = s.me!;
  const G: Record<string, Group> = {};

  // 1. Junta donde soy tesorero
  const g1 = mkJunta({ name: "Vigilancia Jr. Los Olivos", goal: 1200, capacity: 24, periodo: "Octubre", dueDate: addDays(-2), releaseDate: addDays(1), rule: "fecha", creator: "me", demo: true, createdAt: ago(14) });
  addMember(ctx, g1, "g1", "me", me.name, { at: ago(14), silent: true, code: me.code });
  for (let i = 0; i < 22; i++) {
    const id = "x" + i;
    addMember(ctx, g1, "g1", id, nextName(s), { at: ago(13 - i * 0.3), silent: true });
    const r = i % 5;
    if (r !== 1 && r !== 3) seedPay(g1, id, 10 - i * 0.4);
    if (r === 3) g1.members[id].reminders = 2;
  }
  G.g1 = g1;

  // 2. Junta abierta (unirse con código)
  const g3 = mkJunta({ kind: "promocion", name: "Promoción 5.° B · Santa Rosa", goal: 9600, capacity: 32, periodo: "Setiembre", dueDate: addDays(12), releaseDate: addDays(60), rule: "fecha", code: "AYNI-5B32", creator: "q0", demo: true, createdAt: ago(20) });
  for (let k = 0; k < 27; k++) {
    addMember(ctx, g3, "g3", "q" + k, nextName(s), { at: ago(19 - k * 0.5), silent: true });
    if (k % 4) seedPay(g3, "q" + k, 8 - k * 0.2);
  }
  G.g3 = g3;

  // 3. Junta con ingreso cerrado
  const g4 = mkJunta({ name: "Limpieza Mz. C", goal: 720, capacity: 12, periodo: "Octubre", dueDate: addDays(5), releaseDate: addDays(15), rule: "fecha", code: "AYNI-C7LM", creator: "c0", open: false, demo: true, createdAt: ago(9) });
  for (let c = 0; c < 10; c++) addMember(ctx, g4, "g4", "c" + c, nextName(s), { at: ago(8), silent: true });
  G.g4 = g4;

  // 4. Mi pandero privado, en juego (ronda 1 cobrada)
  const g2 = mkPandero({ name: "Pandero del taller", cuota: 400, capacity: 8, visibility: "privado", creator: "me", creatorName: me.name, demo: true, createdAt: ago(45) });
  addMember(ctx, g2, "g2", "me", me.name, { at: ago(45), silent: true, code: me.code });
  for (let j = 0; j < 7; j++) addMember(ctx, g2, "g2", "p" + j, nextName(s), { at: ago(44 - j), silent: true });
  g2.closedAt = ago(38);
  g2.startDate = addDays(-8);
  g2.phase = "juego";
  g2.round = 1;
  g2.order = ["p3", "p0", "me", "p1", "p6", "p2", "p5", "p4"];
  Object.keys(g2.members).forEach((id) => {
    g2.members[id].paidRound = 1;
    led(g2, "in", 400, "Aporte ronda 1 de " + g2.members[id].name, "Débito automático", ago(8));
  });
  G.g2 = g2;

  // 5. Panderos públicos del foro
  const pubs: { name: string; cuota: number; cap: number; n: number; espera?: number; juego?: number }[] = [
    { name: "Pandero Mercado Caquetá", cuota: 200, cap: 10, n: 7 },
    { name: "Pandero docentes UGEL 02", cuota: 250, cap: 12, n: 11 },
    { name: "Pandero mototaxistas Los Olivos", cuota: 100, cap: 6, n: 6, espera: 12 },
    { name: "Pandero emprendedoras de Comas", cuota: 600, cap: 10, n: 10, juego: 4 },
    { name: "Pandero familia Quispe-Mamani", cuota: 150, cap: 5, n: 2 },
  ];
  pubs.forEach((p, ix) => {
    const gid = "f" + ix, cn = nextName(s);
    const g = mkPandero({ name: p.name, cuota: p.cuota, capacity: p.cap, visibility: "publico", creator: "f" + ix + "m0", creatorName: cn, demo: true, createdAt: ago(30 - ix * 4) });
    for (let q = 0; q < p.n; q++) addMember(ctx, g, gid, gid + "m" + q, q === 0 ? cn : nextName(s), { at: ago(29 - ix * 4 - q * 0.5), silent: true });
    if (p.espera) { g.closedAt = ago(30 - p.espera); g.startDate = addDays(p.espera); }
    if (p.juego) {
      g.phase = "juego";
      g.round = p.juego;
      g.startDate = addDays(-30 * (p.juego - 1) - 3);
      g.order = shuffle(Object.keys(g.members));
      Object.keys(g.members).forEach((id) => (g.members[id].paidRound = p.juego!));
      for (let rr = 1; rr < p.juego; rr++) g.payouts[rr] = true;
    }
    G[gid] = g;
  });

  // 6. Pandero privado para probar el código (no aparece en el foro)
  const g5 = mkPandero({ name: "Pandero de la cuadra 7", cuota: 150, capacity: 6, visibility: "privado", code: "AYNI-P8RV", creator: "v0", creatorName: "", demo: true, createdAt: ago(6) });
  for (let v = 0; v < 4; v++) addMember(ctx, g5, "g5", "v" + v, nextName(s), { at: ago(6 - v), silent: true });
  g5.creatorName = g5.members.v0.name;
  G.g5 = g5;

  // 7. Grupo ya archivado
  const ga = mkJunta({ kind: "promocion", name: "Kermés APAFA 2026", goal: 900, capacity: 10, periodo: "Junio", dueDate: addDays(-80), releaseDate: addDays(-70), rule: "fecha", code: "AYNI-K26A", creator: "me", demo: true, createdAt: ago(100) });
  addMember(ctx, ga, "ga", "me", me.name, { at: ago(100), silent: true, code: me.code });
  seedPay(ga, "me", 85);
  for (let z = 0; z < 9; z++) {
    addMember(ctx, ga, "ga", "k" + z, nextName(s), { at: ago(99), silent: true });
    seedPay(ga, "k" + z, 84 - z);
  }
  ga.status = "liberado";
  ga.releasedAt = ago(70);
  ga.releasedAmount = 900;
  ga.releasedTo = "k2";
  ga.releasedToName = ga.members.k2.name;
  led(ga, "out", 900, "Entregado a " + ga.members.k2.name, "Disposición del tesorero", ago(70));
  ga.archived = true;
  ga.archivedAt = ago(69);
  G.ga = ga;

  s.groups = G;
  s.dir = [];
  for (let u = 0; u < 6; u++) s.dir.push({ id: "u" + u, code: userCode(), name: nextName(s) });
  s.wallet = {
    address: stellarAddr(),
    bal: 350,
    conn: { freighter: { addr: stellarAddr(), at: ago(20) } },
    moves: [
      { id: rid(5), type: "out", amount: 400, desc: "Aporte ronda 1 · Pandero del taller", at: ago(8), hash: rid(32) },
      { id: rid(5), type: "in", amount: 500, desc: "Recarga desde Cavos", at: ago(9), hash: rid(32) },
      { id: rid(5), type: "in", amount: 250, desc: "Recarga desde Freighter", at: ago(15), hash: rid(32) },
    ],
  };
  s.notifs = [
    { key: "s1", type: "debit", title: "Se debitó tu aporte", body: "400.00 XLM de tu billetera para la ronda 1 de Pandero del taller.", gid: "g2", at: ago(8), read: true },
    { key: "s2", type: "start", title: "Empezó Pandero del taller", body: "Por sorteo, tu turno es la ronda 3.", gid: "g2", at: ago(8), read: true },
    { key: "s3", type: "round", title: "Pozo de la ronda 1 listo en Pandero del taller", body: "Se reunieron todos los aportes. Se abonará el " + fdate(addDays(22)) + ", al cumplirse el mes.", gid: "g2", at: ago(7), read: false },
  ];
}
