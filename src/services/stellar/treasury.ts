/**
 * Cuenta treasury de DEMO (Stellar Testnet). SOLO SERVIDOR.
 * La secret vive en STELLAR_TREASURY_SECRET (variable privada; jamás NEXT_PUBLIC_*).
 * MVP TESTNET ONLY: no es custodia de producción. Ver docs/STELLAR_TESTNET.md.
 */
import { Asset, BASE_FEE, Horizon, Keypair, Memo, Networks, Operation, StrKey, TransactionBuilder } from "@stellar/stellar-sdk";
import { STELLAR } from "@/config/app";
import { stroopsToXlmString } from "@/lib/money";
import { assertTestnetUrl } from "./horizon";

function keypair(): Keypair {
  const secret = process.env.STELLAR_TREASURY_SECRET;
  if (!secret) throw new Error("Falta STELLAR_TREASURY_SECRET en el servidor");
  return Keypair.fromSecret(secret);
}

/** Dirección pública autoritativa de la treasury (derivada de la secret del servidor). */
export function treasuryPublicKey(): string {
  return keypair().publicKey();
}

export const isValidStellarAddress = (a: string) => StrKey.isValidEd25519PublicKey(a);

/** Envía XLM de la treasury a `to` (disposición del fondo). Devuelve el hash de la transacción. */
export async function sendFromTreasury(input: { to: string; amountStroops: bigint; memo: string }): Promise<string> {
  assertTestnetUrl();
  if (!isValidStellarAddress(input.to)) throw new Error("invalid_destination");
  const kp = keypair();
  const server = new Horizon.Server(STELLAR.horizonUrl);
  const account = await server.loadAccount(kp.publicKey());
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.payment({ destination: input.to, asset: Asset.native(), amount: stroopsToXlmString(input.amountStroops) }))
    .addMemo(Memo.text(input.memo))
    .setTimeout(60)
    .build();
  tx.sign(kp);
  const res = await server.submitTransaction(tx);
  return res.hash;
}
