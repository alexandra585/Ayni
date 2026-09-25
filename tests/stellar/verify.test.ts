// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertTestnetUrl } from "@/services/stellar/horizon";
import { assertTestnetPassphrase, memoForGroup, verifyPayment, type HorizonOp, type HorizonTx } from "@/services/stellar/verify";
import { xlmToStroops } from "@/lib/money";

/**
 * Fixture REAL: respuesta de Horizon Testnet capturada con scripts/stellar-smoke.cjs
 * (pago de 50 XLM con memo de texto). Comprueba que la verificación entiende el formato real.
 */
const REAL_TX: HorizonTx = {
  hash: "da0630b33724645df3f752d2bb31f422e4726446a6e74ee9874c34fb53351886",
  successful: true,
  memo_type: "text",
  memo: "AYNI:0123456789abcdef012345",
  source_account: "GADXNY75NNRZGSBIIRGFEOA4U7BQY3QD2DYCNLRYH5KJEGPW327CERUM",
};
const REAL_OPS: HorizonOp[] = [
  {
    type: "payment",
    asset_type: "native",
    from: "GADXNY75NNRZGSBIIRGFEOA4U7BQY3QD2DYCNLRYH5KJEGPW327CERUM",
    to: "GCMR6O5UDYXWQYYCXONT4E7IMY7URDQNB5HCIBIFGOR4SI2BGLBCZAJX",
    amount: "50.0000000",
  },
];
const TREASURY = "GCMR6O5UDYXWQYYCXONT4E7IMY7URDQNB5HCIBIFGOR4SI2BGLBCZAJX";
const PAYER = "GADXNY75NNRZGSBIIRGFEOA4U7BQY3QD2DYCNLRYH5KJEGPW327CERUM";
const expected = { treasury: TREASURY, amountStroops: xlmToStroops(50), memo: "AYNI:0123456789abcdef012345", from: PAYER };

describe("verifyPayment (respuesta real de Horizon Testnet)", () => {
  it("acepta el pago correcto y devuelve emisor y monto", () => {
    expect(verifyPayment(REAL_TX, REAL_OPS, expected)).toEqual({ ok: true, from: PAYER, amountStroops: 500_000_000n });
  });
  it("acepta si el usuario aún no registró wallet (from no exigido)", () => {
    expect(verifyPayment(REAL_TX, REAL_OPS, { ...expected, from: null })).toMatchObject({ ok: true });
  });
  it("rechaza transacciones fallidas", () => {
    expect(verifyPayment({ ...REAL_TX, successful: false }, REAL_OPS, expected)).toEqual({ ok: false, reason: "tx_failed" });
  });
  it("rechaza si el memo no liga la transacción a ESTE grupo (replay entre grupos)", () => {
    expect(verifyPayment({ ...REAL_TX, memo: "AYNI:ffffffffffffffffffffff" }, REAL_OPS, expected)).toEqual({ ok: false, reason: "wrong_memo" });
    expect(verifyPayment({ ...REAL_TX, memo_type: "none", memo: undefined }, REAL_OPS, expected)).toEqual({ ok: false, reason: "wrong_memo" });
    expect(verifyPayment({ ...REAL_TX, memo_type: "hash" }, REAL_OPS, expected)).toEqual({ ok: false, reason: "wrong_memo" });
  });
  it("rechaza si el destino no es la treasury", () => {
    const ops = [{ ...REAL_OPS[0], to: PAYER }];
    expect(verifyPayment(REAL_TX, ops, expected)).toEqual({ ok: false, reason: "no_payment_to_treasury" });
    expect(verifyPayment(REAL_TX, [], expected)).toEqual({ ok: false, reason: "no_payment_to_treasury" });
    expect(verifyPayment(REAL_TX, [{ type: "create_account", to: TREASURY }], expected)).toEqual({ ok: false, reason: "no_payment_to_treasury" });
  });
  it("rechaza montos distintos (menos o más) aunque el pago exista", () => {
    expect(verifyPayment(REAL_TX, [{ ...REAL_OPS[0], amount: "49.9999999" }], expected)).toEqual({ ok: false, reason: "wrong_amount" });
    expect(verifyPayment(REAL_TX, [{ ...REAL_OPS[0], amount: "50.0000001" }], expected)).toEqual({ ok: false, reason: "wrong_amount" });
    expect(verifyPayment(REAL_TX, [{ ...REAL_OPS[0], amount: "abc" }], expected)).toEqual({ ok: false, reason: "wrong_amount" });
  });
  it("rechaza activos que no sean XLM nativo", () => {
    expect(verifyPayment(REAL_TX, [{ ...REAL_OPS[0], asset_type: "credit_alphanum4" }], expected)).toEqual({ ok: false, reason: "wrong_asset" });
  });
  it("rechaza pagos partidos en varias operaciones a la treasury", () => {
    const half = { ...REAL_OPS[0], amount: "25.0000000" };
    expect(verifyPayment(REAL_TX, [half, half], expected)).toEqual({ ok: false, reason: "multiple_payments" });
  });
  it("rechaza si el emisor no es la wallet registrada del usuario", () => {
    const other = "GBSQ2CGNHOT3B7RXMBWXEYOMPY2LWFFU4IDT7ZZIOM4N5GXM5TN2V5YM";
    expect(verifyPayment(REAL_TX, [{ ...REAL_OPS[0], from: other }], expected)).toEqual({ ok: false, reason: "wrong_source" });
  });
});

describe("memo y red", () => {
  it("memoForGroup cabe en un memo de texto (≤ 28 bytes) y es determinista por grupo", () => {
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(memoForGroup(id)).toBe("AYNI:aaaaaaaaaaaa4aaa8aaaaa");
    expect(Buffer.byteLength(memoForGroup(id))).toBeLessThanOrEqual(28);
    expect(memoForGroup(id)).not.toBe(memoForGroup("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"));
  });
  it("solo acepta la passphrase de Testnet", () => {
    expect(() => assertTestnetPassphrase("Test SDF Network ; September 2015")).not.toThrow();
    expect(() => assertTestnetPassphrase("Public Global Stellar Network ; September 2015")).toThrow("wrong_network");
  });
  it("Horizon de Mainnet queda bloqueado", () => {
    expect(() => assertTestnetUrl("https://horizon.stellar.org")).toThrow(/Testnet/);
    expect(() => assertTestnetUrl("https://horizon-testnet.stellar.org")).not.toThrow();
  });
});
