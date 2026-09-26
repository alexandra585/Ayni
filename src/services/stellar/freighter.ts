"use client";
/**
 * Integración con Freighter (extensión de navegador) en Stellar Testnet. MVP TESTNET ONLY.
 * Ayni nunca ve ni guarda claves privadas: Freighter firma y devuelve el XDR firmado.
 */
import { stroopsToXlmString } from "@/lib/money";
import { getSupabase } from "@/lib/supabase/client";
import { TESTNET_PASSPHRASE } from "./verify";

async function api() {
  return import("@stellar/freighter-api");
}

const fail = (e: unknown, fallback: string) => {
  const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
  return new Error(msg || fallback);
};

const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
const WRONG_NETWORK = "Cambia Freighter a Stellar Testnet para usar Ayni.";
const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export async function assertFreighterTestnet(expectedAddress?: string): Promise<void> {
  if (process.env.NEXT_PUBLIC_STELLAR_NETWORK !== "testnet") throw new Error(WRONG_NETWORK);
  const f = await api();
  const net = await f.getNetworkDetails();
  if (net.error || net.networkPassphrase !== TESTNET_PASSPHRASE) throw new Error(WRONG_NETWORK);
  if (expectedAddress) {
    const account = await f.getAddress();
    if (account.error || account.address !== expectedAddress) {
      throw new Error("Selecciona en Freighter la cuenta vinculada a Ayni o vuelve a conectarla desde Billetera.");
    }
  }
}

export async function fetchFreighterBalance(address: string): Promise<number> {
  await assertFreighterTestnet(address);
  const response = await fetch(`${HORIZON_TESTNET}/accounts/${encodeURIComponent(address)}`, { cache: "no-store" });
  if (response.status === 404) return 0;
  if (!response.ok) throw new Error("No se pudo leer el saldo de Freighter.");
  const account = await response.json() as { balances: { asset_type: string; balance: string }[] };
  return Number(account.balances.find((b) => b.asset_type === "native")?.balance ?? 0);
}

/** Pide acceso a Freighter, exige Testnet y registra la dirección pública (solo metadatos) en Supabase. */
export async function connectFreighter(): Promise<string> {
  if (process.env.NEXT_PUBLIC_STELLAR_NETWORK !== "testnet") throw new Error(WRONG_NETWORK);
  const f = await api();
  const conn = await f.isConnected();
  if (!conn.isConnected) throw new Error("No encontramos Freighter. Instala la extensión desde freighter.app y recarga la página.");
  const access = await f.requestAccess();
  if (access.error) throw fail(access.error, "No se autorizó la conexión con Freighter.");
  const { StrKey } = await import("@stellar/stellar-sdk");
  if (!StrKey.isValidEd25519PublicKey(access.address)) throw new Error("Freighter no devolvió una dirección Stellar válida.");
  await assertFreighterTestnet(access.address);

  const supabase = getSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Inicia sesión en Ayni para conectar Freighter.");
  {
    const { error } = await supabase
      .from("wallet_accounts")
      .upsert({ user_id: data.user.id, stellar_address: access.address, network: "TESTNET", provider: "freighter", updated_at: new Date().toISOString() }, { onConflict: "user_id,provider,network" });
    if (error) throw new Error("No se pudo guardar tu wallet: " + error.message);
  }
  return access.address;
}

/** Devuelve la cuenta treasury (pública) que reciben los pagos, desde el servidor. */
export async function fetchTreasury(): Promise<string> {
  const r = await fetch("/api/stellar/config", { cache: "no-store" });
  if (!r.ok) throw new Error("No se pudo leer la configuración de Stellar");
  return ((await r.json()) as { treasury: string }).treasury;
}

/**
 * Construye un pago XLM Testnet → treasury, lo firma con Freighter y lo envía a la red.
 * Devuelve el hash confirmado (aún debe verificarlo el backend antes de registrarse).
 */
export async function signAndSubmitPayment(input: { from: string; to: string; amountStroops: bigint; memo: string }): Promise<string> {
  await assertFreighterTestnet(input.from);
  const [sdk, f] = await Promise.all([import("@stellar/stellar-sdk"), api()]);
  if (!sdk.StrKey.isValidEd25519PublicKey(input.to) || input.amountStroops <= 0n) throw new Error("Pago Testnet inválido.");
  const server = new sdk.Horizon.Server(HORIZON_TESTNET);
  const account = await server.loadAccount(input.from).catch(() => {
    throw new Error("Tu cuenta no existe en Testnet. Fondéala con Friendbot (friendbot.stellar.org) e inténtalo otra vez.");
  });
  const tx = new sdk.TransactionBuilder(account, { fee: sdk.BASE_FEE, networkPassphrase: sdk.Networks.TESTNET })
    .addOperation(sdk.Operation.payment({ destination: input.to, asset: sdk.Asset.native(), amount: stroopsToXlmString(input.amountStroops) }))
    .addMemo(sdk.Memo.text(input.memo))
    .setTimeout(120)
    .build();
  const signed = await f.signTransaction(tx.toXDR(), { networkPassphrase: TESTNET_PASSPHRASE, address: input.from });
  if (signed.error) throw fail(signed.error, "No se firmó la transacción en Freighter.");
  const parsed = sdk.TransactionBuilder.fromXDR(signed.signedTxXdr, TESTNET_PASSPHRASE);
  if (hex(parsed.hash()) !== hex(tx.hash())) throw new Error("Freighter devolvió una transacción distinta al pago solicitado.");
  await assertFreighterTestnet(input.from);
  const hash = hex(parsed.hash());
  try {
    const res = await server.submitTransaction(parsed);
    return res.hash;
  } catch {
    // El envío pudo llegar a Horizon aunque se perdiera la respuesta. Conservar
    // el hash para verificar/registrar; nunca crear otro pago automáticamente.
    return hash;
  }
}
