// Prueba de humo OPCIONAL contra Stellar TESTNET real (requiere internet):
//   node scripts/stellar-smoke.cjs
// Crea 2 cuentas, las fondea con Friendbot, envía un pago con memo y comprueba que la respuesta REAL de
// Horizon tiene la forma que espera services/stellar/verify.ts. No usa dinero real.
const { Asset, BASE_FEE, Horizon, Keypair, Memo, Networks, Operation, TransactionBuilder } = require("@stellar/stellar-sdk");

const HORIZON = "https://horizon-testnet.stellar.org";
const server = new Horizon.Server(HORIZON);
const fund = async (pk) => {
  const r = await fetch("https://friendbot.stellar.org/?addr=" + pk);
  if (!r.ok) throw new Error("friendbot " + r.status);
};

(async () => {
const payer = Keypair.random();
const treasury = Keypair.random();
await Promise.all([fund(payer.publicKey()), fund(treasury.publicKey())]);

const acct = await server.loadAccount(payer.publicKey());
const memo = "AYNI:0123456789abcdef012345";
const tx = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
  .addOperation(Operation.payment({ destination: treasury.publicKey(), asset: Asset.native(), amount: "50.0000000" }))
  .addMemo(Memo.text(memo)).setTimeout(60).build();
tx.sign(payer);
const { hash } = await server.submitTransaction(tx);

const t = await (await fetch(`${HORIZON}/transactions/${hash}`)).json();
const o = await (await fetch(`${HORIZON}/transactions/${hash}/operations`)).json();
console.log(JSON.stringify({
  hash, successful: t.successful, memo_type: t.memo_type, memo: t.memo, source_account: t.source_account,
  ops: o._embedded.records.map((x) => ({ type: x.type, asset_type: x.asset_type, from: x.from, to: x.to, amount: x.amount })),
  payer: payer.publicKey(), treasury: treasury.publicKey(),
}, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
