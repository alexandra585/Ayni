/** Fuentes de azar y de tiempo, sustituibles en pruebas para que el dominio sea determinista. */

export interface Env {
  now(): Date;
  /** Bytes aleatorios (0..255). */
  bytes(n: number): Uint8Array;
  /** Número aleatorio en [0,1). */
  rnd(): number;
}

export const env: Env = {
  now: () => new Date(),
  bytes: (n) => {
    const a = new Uint8Array(n);
    globalThis.crypto.getRandomValues(a);
    return a;
  },
  rnd: () => Math.random(),
};

export function setEnv(patch: Partial<Env>): () => void {
  const prev = { ...env };
  Object.assign(env, patch);
  return () => Object.assign(env, prev);
}

export function rid(n = 8): string {
  return Array.from(env.bytes(n), (b) => b.toString(16).padStart(2, "0")).join("");
}

const ALPH = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function code4(): string {
  const a = env.bytes(4);
  let s = "";
  for (let i = 0; i < 4; i++) s += ALPH[a[i] % ALPH.length];
  return s;
}
export const genCode = () => "AYNI-" + code4();
export const userCode = () => "USR-" + code4();

export function stellarAddr(): string {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const a = env.bytes(55);
  let s = "G";
  for (let i = 0; i < 55; i++) s += A[a[i] % 32];
  return s;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(env.rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
