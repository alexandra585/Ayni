// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/** El servidor solo envía fondos de la treasury si el grupo está 'listo' y quien llama es su tesorero. */
const GROUP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TREASURER = "11111111-1111-4111-8111-111111111111";
const JORGE = "22222222-2222-4222-8222-222222222222";
const DEST = "GBSQ2CGNHOT3B7RXMBWXEYOMPY2LWFFU4IDT7ZZIOM4N5GXM5TN2V5YM";

const st = {
  user: { id: TREASURER } as { id: string } | null,
  group: { id: GROUP, kind: "junta", status: "listo" } as Record<string, unknown> | null,
  role: "treasurer" as string | null,
  members: [
    { user_id: TREASURER, paid_stroops: "500000000" },
    { user_id: JORGE, paid_stroops: "500000000" },
  ],
  wallet: { stellar_address: DEST } as { stellar_address: string } | null,
  rpc: vi.fn(),
  send: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServer: async () => ({ auth: { getUser: async () => ({ data: { user: st.user } }) } }),
  createSupabaseService: () => ({
    rpc: (fn: string, args: unknown) => st.rpc(fn, args),
    from: (table: string) => ({
      select: () => {
        const chain = {
          eq: () => chain,
          maybeSingle: async () => ({ data: table === "groups" ? st.group : table === "group_members" ? (st.role ? { role: st.role } : null) : st.wallet }),
          then: (res: (v: unknown) => void) => res({ data: table === "group_members" ? st.members : [] }),
        };
        return chain;
      },
    }),
  }),
}));
vi.mock("@/services/stellar/horizon", () => ({ assertHorizonIsTestnet: async () => undefined }));
vi.mock("@/services/stellar/treasury", () => ({
  isValidStellarAddress: (a: string) => /^G[A-Z2-7]{55}$/.test(a),
  sendFromTreasury: (i: unknown) => st.send(i),
}));

const call = async (body: unknown) => {
  const { POST } = await import("@/app/api/stellar/disposal/route");
  const res = await POST(new Request("http://x/api/stellar/disposal", { method: "POST", body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
};

beforeEach(() => {
  st.user = { id: TREASURER };
  st.group = { id: GROUP, kind: "junta", status: "listo" };
  st.role = "treasurer";
  st.wallet = { stellar_address: DEST };
  st.rpc = vi.fn(async () => ({ data: { ok: true, amount: 1e9 }, error: null }));
  st.send = vi.fn(async () => "f".repeat(64));
});

describe("POST /api/stellar/disposal", () => {
  it("envía TODO lo recaudado (100 XLM) desde la treasury al destino y registra el hash", async () => {
    const r = await call({ groupId: GROUP, toUserId: JORGE });
    expect(r).toMatchObject({ status: 200, json: { ok: true, txHash: "f".repeat(64), amountStroops: "1000000000" } });
    expect(st.send).toHaveBeenCalledWith({ to: DEST, amountStroops: 1_000_000_000n, memo: "AYNI:aaaaaaaaaaaa4aaa8aaaaa" });
    expect(st.rpc).toHaveBeenCalledWith("record_disposal", { p_group: GROUP, p_actor: TREASURER, p_to: JORGE, p_amount: "1000000000", p_tx_hash: "f".repeat(64) });
  });
  it("un participante que no es tesorero recibe 403 y no se mueve dinero", async () => {
    st.role = "member";
    const r = await call({ groupId: GROUP, toUserId: JORGE });
    expect(r.status).toBe(403);
    expect(st.send).not.toHaveBeenCalled();
  });
  it("sin sesión → 401; cuerpo inválido → 400", async () => {
    st.user = null;
    expect((await call({ groupId: GROUP, toUserId: JORGE })).status).toBe(401);
    expect((await call({ groupId: "x", toUserId: JORGE })).status).toBe(400);
    expect(st.send).not.toHaveBeenCalled();
  });
  it("mientras el grupo siga en custodia (aún no 'listo') no se dispone del fondo", async () => {
    st.group = { id: GROUP, kind: "junta", status: "custodia" };
    const r = await call({ groupId: GROUP, toUserId: JORGE });
    expect(r).toMatchObject({ status: 409, json: { error: "not_ready" } });
    expect(st.send).not.toHaveBeenCalled();
  });
  it("los panderos no tienen disposición del tesorero", async () => {
    st.group = { id: GROUP, kind: "pandero", status: null };
    expect((await call({ groupId: GROUP, toUserId: JORGE })).status).toBe(404);
    expect(st.send).not.toHaveBeenCalled();
  });
  it("el destino debe ser miembro y tener wallet de Testnet", async () => {
    expect((await call({ groupId: GROUP, toUserId: "33333333-3333-4333-8333-333333333333" })).status).toBe(422);
    st.wallet = null;
    expect(await call({ groupId: GROUP, toUserId: JORGE })).toMatchObject({ status: 422, json: { error: "recipient_wallet_missing" } });
    expect(st.send).not.toHaveBeenCalled();
  });
  it("si el envío salió pero el registro falla, devuelve el hash para conciliar (y reintenta el registro)", async () => {
    st.rpc = vi.fn(async (fn: string) => (fn === "begin_disposal" ? { data: { ok: true }, error: null } : { data: null, error: { message: "db down" } }));
    const r = await call({ groupId: GROUP, toUserId: JORGE });
    expect(r).toMatchObject({ status: 500, json: { error: "record_failed", txHash: "f".repeat(64) } });
    expect(st.rpc.mock.calls.filter((c) => c[0] === "record_disposal")).toHaveLength(2);
  });
  it("toma el candado ANTES de enviar y una segunda petición simultánea recibe 409 sin mover dinero", async () => {
    st.rpc = vi.fn(async (fn: string) => (fn === "begin_disposal" ? { data: { ok: false, error: "in_progress" }, error: null } : { data: { ok: true }, error: null }));
    const r = await call({ groupId: GROUP, toUserId: JORGE });
    expect(r).toMatchObject({ status: 409, json: { error: "in_progress" } });
    expect(st.send).not.toHaveBeenCalled();
    expect(st.rpc.mock.calls.some((c) => c[0] === "record_disposal")).toBe(false);
  });
  it("si el envío a Stellar falla, libera el candado para poder reintentar", async () => {
    st.send = vi.fn(async () => { throw new Error("tx_bad_seq"); });
    const r = await call({ groupId: GROUP, toUserId: JORGE });
    expect(r).toMatchObject({ status: 500, json: { error: "server_error" } });
    expect(st.rpc).toHaveBeenCalledWith("abort_disposal", { p_group: GROUP });
    expect(st.rpc.mock.calls.some((c) => c[0] === "record_disposal")).toBe(false);
  });
  it("rechaza peticiones de otro origen (CSRF)", async () => {
    const { POST } = await import("@/app/api/stellar/disposal/route");
    const res = await POST(new Request("http://app.test/api/stellar/disposal", {
      method: "POST", headers: { origin: "https://evil.example" }, body: JSON.stringify({ groupId: GROUP, toUserId: JORGE }),
    }));
    expect(res.status).toBe(403);
    expect(st.send).not.toHaveBeenCalled();
  });
});
