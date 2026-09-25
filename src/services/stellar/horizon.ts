/** Lectura de Horizon (Testnet). Funciona en servidor y en navegador. MVP TESTNET ONLY. */
import { STELLAR } from "@/config/app";
import { TESTNET_PASSPHRASE, type HorizonOp, type HorizonTx } from "./verify";

const base = () => STELLAR.horizonUrl.replace(/\/$/, "");

/** Refuse to run against anything that is not the public Testnet Horizon. */
export function assertTestnetUrl(url = base()): void {
  if (!/testnet/i.test(url) && !/localhost|127\.0\.0\.1/.test(url)) throw new Error("Solo Stellar Testnet está permitido en este MVP");
}

async function getJson<T>(path: string): Promise<{ status: number; body: T | null }> {
  assertTestnetUrl();
  const res = await fetch(base() + path, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (res.status === 404) return { status: 404, body: null };
  if (!res.ok) throw new Error("Horizon respondió " + res.status);
  return { status: res.status, body: (await res.json()) as T };
}

/** Confirma que el Horizon configurado sirve la red de pruebas (network_passphrase). */
export async function assertHorizonIsTestnet(): Promise<void> {
  const { body } = await getJson<{ network_passphrase: string }>("/");
  if (!body || body.network_passphrase !== TESTNET_PASSPHRASE) throw new Error("wrong_network");
}

/** Espera (con reintentos) a que Horizon indexe la transacción recién enviada. */
export async function fetchTxAndOps(hash: string, attempts = 6, delayMs = 1000): Promise<{ tx: HorizonTx; ops: HorizonOp[] } | null> {
  for (let i = 0; i < attempts; i++) {
    const t = await getJson<HorizonTx>("/transactions/" + hash);
    if (t.body) {
      const o = await getJson<{ _embedded: { records: HorizonOp[] } }>("/transactions/" + hash + "/operations?limit=200");
      return { tx: t.body, ops: o.body?._embedded.records ?? [] };
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

/** Saldo nativo (XLM) de una cuenta de Testnet; 0 si la cuenta no existe todavía. */
export async function fetchXlmBalance(address: string): Promise<number> {
  if (!address) return 0;
  const a = await getJson<{ balances: { asset_type: string; balance: string }[] }>("/accounts/" + address);
  const n = a.body?.balances.find((b) => b.asset_type === "native");
  return n ? Number(n.balance) : 0;
}
