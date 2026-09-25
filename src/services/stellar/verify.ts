/**
 * Verificación de pagos en Stellar Testnet. MVP TESTNET ONLY.
 *
 * Nunca se confía en el hash que envía el navegador: el servidor consulta Horizon y comprueba
 * red, éxito, destino, emisor, monto, memo (vínculo con el grupo) y que el hash sea nuevo.
 * Estas funciones son puras (reciben las respuestas de Horizon) para poder probarlas sin red.
 */
import { xlmToStroops } from "@/lib/money";

export const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

export interface HorizonTx {
  hash: string;
  successful: boolean;
  memo_type?: string;
  memo?: string;
  source_account: string;
}
export interface HorizonOp {
  type: string;
  asset_type?: string;
  from?: string;
  to?: string;
  amount?: string;
  source_account?: string;
}

export interface Expectation {
  /** Dirección pública de la treasury (derivada en el servidor de STELLAR_TREASURY_SECRET). */
  treasury: string;
  amountStroops: bigint;
  /** Memo de texto que liga la transacción al grupo (ver memoForGroup). */
  memo: string;
  /** Wallet registrada del pagador; si existe, el emisor debe coincidir. */
  from?: string | null;
}

export type VerifyFailure =
  | "wrong_network"
  | "tx_failed"
  | "wrong_memo"
  | "no_payment_to_treasury"
  | "multiple_payments"
  | "wrong_asset"
  | "wrong_amount"
  | "wrong_source";

export type VerifyResult = { ok: true; from: string; amountStroops: bigint } | { ok: false; reason: VerifyFailure };

/** Memo (≤ 28 bytes) que relaciona el pago con el grupo: AYNI: + primeros 22 hex del uuid. */
export function memoForGroup(groupId: string): string {
  return "AYNI:" + groupId.replace(/-/g, "").slice(0, 22);
}

/** Rechaza cualquier red distinta de Testnet (protección contra Mainnet por error de configuración). */
export function assertTestnetPassphrase(passphrase: string): void {
  if (passphrase !== TESTNET_PASSPHRASE) throw new Error("wrong_network");
}

export function verifyPayment(tx: HorizonTx, ops: HorizonOp[], expected: Expectation): VerifyResult {
  if (!tx.successful) return { ok: false, reason: "tx_failed" };
  if (tx.memo_type !== "text" || tx.memo !== expected.memo) return { ok: false, reason: "wrong_memo" };

  const toTreasury = ops.filter((o) => o.type === "payment" && o.to === expected.treasury);
  if (toTreasury.length === 0) return { ok: false, reason: "no_payment_to_treasury" };
  if (toTreasury.length > 1) return { ok: false, reason: "multiple_payments" };
  const op = toTreasury[0];
  if (op.asset_type !== "native") return { ok: false, reason: "wrong_asset" };

  let paid: bigint;
  try {
    paid = xlmToStroops(op.amount ?? "");
  } catch {
    return { ok: false, reason: "wrong_amount" };
  }
  if (paid !== expected.amountStroops) return { ok: false, reason: "wrong_amount" };

  const from = op.from ?? op.source_account ?? tx.source_account;
  if (expected.from && from !== expected.from) return { ok: false, reason: "wrong_source" };
  return { ok: true, from, amountStroops: paid };
}

export const VERIFY_MESSAGES: Record<VerifyFailure | string, string> = {
  wrong_network: "La transacción no es de Stellar Testnet.",
  tx_failed: "La transacción falló en la red Stellar.",
  wrong_memo: "La transacción no corresponde a este grupo (memo distinto).",
  no_payment_to_treasury: "La transacción no paga a la cuenta de Ayni.",
  multiple_payments: "La transacción contiene más de un pago a la cuenta de Ayni.",
  wrong_asset: "Solo se aceptan pagos en XLM.",
  wrong_amount: "El monto pagado no coincide con la cuota.",
  wrong_source: "La transacción no salió de tu wallet registrada.",
  hash_already_used: "Esta transacción ya fue registrada.",
  nothing_due: "No tienes cuota pendiente en este grupo.",
  not_in_custody: "El grupo ya no está recibiendo cuotas.",
  not_member: "No perteneces a este grupo.",
};
