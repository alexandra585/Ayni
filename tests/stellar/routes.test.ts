// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { xlmToStroops } from "@/lib/money";
import { GET, POST } from "@/app/api/stellar/contribution/route";

/**
 * Pruebas de los route handlers de Stellar con Supabase y Horizon simulados:
 * el servidor NUNCA debe registrar un pago que no verificó en la red.
 */
const GROUP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "11111111-1111-4111-8111-111111111111";
const TREASURY = "GCMR6O5UDYXWQYYCXONT4E7IMY7URDQNB5HCIBIFGOR4SI2BGLBCZAJX";
const PAYER = "GADXNY75NNRZGSBIIRGFEOA4U7BQY3QD2DYCNLRYH5KJEGPW327CERUM";
const HASH = "da0630b33724645df3f752d2bb31f422e4726446a6e74ee9874c34fb53351886";

const state = {
  user: { id: USER } as { id: string } | null,
  rpc: vi.fn(),
  wallet: null as { user_id: string; stellar_address: string; provider: string; network: string } | null,
  previous: null as { user_id: string; group_id: string } | null,
  horizon: null as null | { tx: unknown; ops: unknown[] },
};

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServer: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
  createSupabaseService: () => ({
    rpc: (fn: string, args: unknown) => state.rpc(fn, args),
    from: (table: string) => ({
      select: () => {
        const chain = { eq: () => chain, maybeSingle: async () => ({ data: table === "contributions" ? state.previous : state.wallet }) };
        return chain;
      },
    }),
  }),
}));
vi.mock("@/services/stellar/horizon", () => ({
  assertHorizonIsTestnet: async () => undefined,
  fetchTxAndOps: async () => state.horizon,
}));

const goodHorizon = () => ({
  tx: { hash: HASH, successful: true, memo_type: "none", source_account: TREASURY },
  ops: [{ type: "payment", asset_type: "native", from: PAYER, to: TREASURY, amount: "50.0000000" }],
});

const post = async (body: unknown) => {
  const res = await POST(new Request("http://x/api/stellar/contribution", { method: "POST", body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_STELLAR_TREASURY_PUBLIC", TREASURY);
  state.previous = null;
  state.user = { id: USER };
  state.wallet = { user_id: USER, stellar_address: PAYER, provider: "cavos", network: "TESTNET" };
  state.horizon = goodHorizon();
  state.rpc = vi.fn(async (fn: string) => {
    if (fn === "contribution_due") return { data: String(xlmToStroops(50)), error: null };
    if (fn === "record_contribution") return { data: { ok: true, contribution_id: "c1" }, error: null };
    return { data: null, error: { message: "unexpected " + fn } };
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/stellar/contribution", () => {
  it("verifica en Stellar y registra el pago (una sola vez, con clave idempotente por hash)", async () => {
    const r = await post({ groupId: GROUP, txHash: HASH });
    expect(r).toMatchObject({ status: 200, json: { ok: true, txHash: HASH } });
    const rec = state.rpc.mock.calls.find((c) => c[0] === "record_contribution")!;
    expect(rec[1]).toEqual({ p_group: GROUP, p_user: USER, p_amount: "500000000", p_tx_hash: HASH, p_idem: "stellar:" + HASH });
  });

  it("reintento del MISMO hash ya registrado (p. ej. tras un corte de red) → éxito idempotente, sin volver a verificar ni registrar", async () => {
    state.previous = { user_id: USER, group_id: GROUP };
    const r = await post({ groupId: GROUP, txHash: HASH });
    expect(r).toMatchObject({ status: 200, json: { ok: true, duplicate: true, code: "already_recorded" } });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("sin sesión → 401 y no toca la base de datos", async () => {
    state.user = null;
    expect((await post({ groupId: GROUP, txHash: HASH })).status).toBe(401);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("rechaza cuerpos inválidos (uuid o hash mal formados)", async () => {
    expect((await post({ groupId: "no-uuid", txHash: HASH })).status).toBe(400);
    expect((await post({ groupId: GROUP, txHash: "abc" })).status).toBe(400);
    expect((await post(null)).status).toBe(400);
  });

  it("un hash falsificado o que no existe en la red NO se registra", async () => {
    state.horizon = null;
    const r = await post({ groupId: GROUP, txHash: HASH });
    expect(r.status).toBe(404);
    expect(state.rpc.mock.calls.some((c) => c[0] === "record_contribution")).toBe(false);
  });

  it.each([
    ["monto menor", { ops: [{ ...goodHorizon().ops[0], amount: "10.0000000" }] }, "wrong_amount"],
    ["destino distinto a la treasury", { ops: [{ ...goodHorizon().ops[0], to: PAYER }] }, "wrong_destination"],
    ["transacción fallida", { tx: { ...goodHorizon().tx, successful: false } }, "invalid_tx"],
    ["emisor distinto a mi wallet", { ops: [{ ...goodHorizon().ops[0], from: "GBSQ2CGNHOT3B7RXMBWXEYOMPY2LWFFU4IDT7ZZIOM4N5GXM5TN2V5YM" }] }, "wrong_source"],
  ])("%s → 422 y no registra", async (_name, patch, reason) => {
    state.horizon = { ...goodHorizon(), ...patch };
    const r = await post({ groupId: GROUP, txHash: HASH });
    expect(r).toMatchObject({ status: 422, json: { ok: false, error: reason } });
    expect(state.rpc.mock.calls.some((c) => c[0] === "record_contribution")).toBe(false);
  });

  it("acepta un memo ajeno al grupo porque Cavos no exige memo", async () => {
    state.horizon = { ...goodHorizon(), tx: { ...goodHorizon().tx, memo_type: "text", memo: "AYNI:bbbbbbbbbbbb4bbb8bbbbb" } };
    expect(await post({ groupId: GROUP, txHash: HASH })).toMatchObject({ status: 200, json: { ok: true, txHash: HASH } });
    expect(state.rpc.mock.calls.filter((c) => c[0] === "record_contribution")).toHaveLength(1);
  });

  it("si la BD dice que el hash ya se usó (replay) → 409", async () => {
    state.rpc = vi.fn(async (fn: string) =>
      fn === "contribution_due" ? { data: String(xlmToStroops(50)), error: null } : { data: { ok: false, error: "hash_already_used" }, error: null });
    const r = await post({ groupId: GROUP, txHash: HASH });
    expect(r).toMatchObject({ status: 409, json: { ok: false, error: "tx_already_used" } });
  });

  it("si no hay cuota pendiente o no es miembro → 409 sin consultar Stellar", async () => {
    state.rpc = vi.fn(async () => ({ data: "0", error: null }));
    expect((await post({ groupId: GROUP, txHash: HASH })).status).toBe(409);
    state.rpc = vi.fn(async () => ({ data: null, error: null }));
    expect((await post({ groupId: GROUP, txHash: HASH })).status).toBe(409);
  });

  it("rechaza peticiones con Origin de otro sitio (CSRF) sin consultar nada", async () => {
    const res = await POST(new Request("http://app.test/api/stellar/contribution", {
      method: "POST", headers: { origin: "https://evil.example" }, body: JSON.stringify({ groupId: GROUP, txHash: HASH }),
    }));
    expect(res.status).toBe(403);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("GET devuelve el monto exacto que decide la BD (para que el cliente pague lo correcto)", async () => {
    const res = await GET(new Request("http://x/api/stellar/contribution?groupId=" + GROUP));
    expect(await res.json()).toEqual({ ok: true, amountStroops: "500000000" });
  });
});
