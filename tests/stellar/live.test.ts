// @vitest-environment node
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { fetchTxAndOps } from "@/services/stellar/horizon";
import { sendFromTreasury, treasuryPublicKey } from "@/services/stellar/treasury";
import { memoForGroup, verifyPayment } from "@/services/stellar/verify";
import { xlmToStroops } from "@/lib/money";

/**
 * Prueba de integración CONTRA STELLAR TESTNET REAL (opt-in): STELLAR_LIVE=1 pnpm test tests/stellar/live
 * Usa cuentas nuevas fondeadas por Friendbot. No usa dinero real.
 */
const require = createRequire(import.meta.url);

describe.skipIf(!process.env.STELLAR_LIVE)("Stellar Testnet en vivo", () => {
  it("pago usuario→treasury verificado; disposición treasury→destino con sendFromTreasury", async () => {
    const sdk = require("@stellar/stellar-sdk");
    const payer = sdk.Keypair.random();
    const treasury = sdk.Keypair.random();
    const dest = sdk.Keypair.random();
    await Promise.all([payer, treasury, dest].map(async (k) => {
      const r = await fetch("https://friendbot.stellar.org/?addr=" + k.publicKey());
      if (!r.ok) throw new Error("friendbot " + r.status);
    }));
    process.env.STELLAR_TREASURY_SECRET = treasury.secret();
    expect(treasuryPublicKey()).toBe(treasury.publicKey());

    // 1) el "cliente" paga 50 XLM a la treasury con memo del grupo
    const groupId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const server = new sdk.Horizon.Server("https://horizon-testnet.stellar.org");
    const acct = await server.loadAccount(payer.publicKey());
    const tx = new sdk.TransactionBuilder(acct, { fee: sdk.BASE_FEE, networkPassphrase: sdk.Networks.TESTNET })
      .addOperation(sdk.Operation.payment({ destination: treasury.publicKey(), asset: sdk.Asset.native(), amount: "50.0000000" }))
      .addMemo(sdk.Memo.text(memoForGroup(groupId))).setTimeout(60).build();
    tx.sign(payer);
    const { hash } = await server.submitTransaction(tx);

    // 2) el servidor lo verifica con datos REALES de Horizon
    const found = await fetchTxAndOps(hash);
    expect(found).not.toBeNull();
    const v = verifyPayment(found!.tx, found!.ops, { treasury: treasury.publicKey(), amountStroops: xlmToStroops(50), memo: memoForGroup(groupId), from: payer.publicKey() });
    expect(v).toEqual({ ok: true, from: payer.publicKey(), amountStroops: 500_000_000n });
    // el mismo pago NO vale para otro grupo
    expect(verifyPayment(found!.tx, found!.ops, { treasury: treasury.publicKey(), amountStroops: xlmToStroops(50), memo: memoForGroup("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb") })).toEqual({ ok: false, reason: "wrong_memo" });

    // 3) disposición: la treasury envía 10 XLM al destino
    const outHash = await sendFromTreasury({ to: dest.publicKey(), amountStroops: xlmToStroops(10), memo: memoForGroup(groupId) });
    expect(outHash).toMatch(/^[0-9a-f]{64}$/);
    const out = await fetchTxAndOps(outHash);
    expect(out!.tx.successful).toBe(true);
    expect(out!.ops[0]).toMatchObject({ type: "payment", from: treasury.publicKey(), to: dest.publicKey(), amount: "10.0000000" });
  }, 120_000);
});
