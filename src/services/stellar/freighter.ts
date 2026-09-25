"use client";
/**
 * Integración con Freighter (extensión de navegador) en Stellar Testnet. MVP TESTNET ONLY.
 * Ayni nunca ve ni guarda claves privadas: Freighter firma y devuelve el XDR firmado.
 */
import { STELLAR } from "@/config/app";
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

/** Pide acceso a Freighter, exige Testnet y registra la dirección pública (solo metadatos) en Supabase. */
export async function connectFreighter(): Promise<string> {
  const f = await api();
  const conn = await f.isConnected();
  if (!conn.isConnected) throw new Error("No encontramos Freighter. Instala la extensión desde freighter.app y recarga la página.");
  const access = await f.requestAccess();
  if (access.error) throw fail(access.error, "No se autorizó la conexión con Freighter.");
  const net = await f.getNetworkDetails();
  if (net.error || net.networkPassphrase !== TESTNET_PASSPHRASE)
    throw new Error("Freighter está en otra red. Cambia a Testnet (Ajustes → Red) e inténtalo de nuevo.");

  const supabase = getSupabase();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    const { error } = await supabase
      .from("wallet_accounts")
      .upsert({ user_id: data.user.id, stellar_address: access.address, network: "TESTNET", provider: "freighter", updated_at: new Date().toISOString() });
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
  const [sdk, f] = await Promise.all([import("@stellar/stellar-sdk"), api()]);
  const server = new sdk.Horizon.Server(STELLAR.horizonUrl);
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
  const res = await server.submitTransaction(parsed);
  return res.hash;
}
