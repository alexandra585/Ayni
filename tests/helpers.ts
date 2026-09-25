import { setEnv } from "@/domain/env";
import type { AyniState, Ctx, JuntaGroup, PanderoGroup } from "@/domain/types";
import { emptyState, seedDemo } from "@/fixtures/demo/seed";

export const FIXED_NOW = new Date("2026-09-24T15:00:00Z");

/** Reloj fijo + azar determinista (secuencia pseudoaleatoria reproducible). */
export function freezeEnv() {
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  return setEnv({
    now: () => new Date(FIXED_NOW),
    rnd,
    bytes: (n) => Uint8Array.from({ length: n }, () => Math.floor(rnd() * 256)),
  });
}

export interface TestCtx extends Ctx {
  toasts: string[];
}

/** Estado demo ya sembrado + contexto que registra los toasts. */
export function makeCtx(): TestCtx {
  const s: AyniState = emptyState();
  s.me = { name: "Rosa Quispe", email: "rosa@correo.com", phone: "", address: "", since: FIXED_NOW.toISOString(), code: "USR-TEST" };
  const toasts: string[] = [];
  const ctx: TestCtx = { s, toast: (m) => toasts.push(m), toasts };
  seedDemo(ctx);
  toasts.length = 0;
  return ctx;
}

export const junta = (c: Ctx, id = "g1") => c.s.groups[id] as JuntaGroup;
export const pandero = (c: Ctx, id = "g2") => c.s.groups[id] as PanderoGroup;
