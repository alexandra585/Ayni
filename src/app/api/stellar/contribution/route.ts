import { NextResponse } from "next/server";
import { z } from "zod";
import { isSameOrigin } from "@/lib/same-origin";
import { createSupabaseServer, createSupabaseService } from "@/lib/supabase/server";
import { assertHorizonIsTestnet, fetchTxAndOps } from "@/services/stellar/horizon";
import { StrKey } from "@stellar/stellar-sdk";
import { VERIFY_MESSAGES, verifyPayment } from "@/services/stellar/verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ groupId: z.string().uuid(), txHash: z.string().regex(/^[0-9a-f]{64}$/, "hash inválido"), provider: z.enum(["cavos", "freighter"]).default("cavos") }).strict();

const failure = (error: string, status = 500) => json({ ok: false, error, message: VERIFY_MESSAGES[error] ?? VERIFY_MESSAGES.record_failed }, status);

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status });

/** GET /api/stellar/contribution?groupId=… — monto exacto (stroops) que debe pagar el usuario, según la base de datos. */
export async function GET(req: Request) {
  const groupId = new URL(req.url).searchParams.get("groupId") ?? "";
  if (!z.string().uuid().safeParse(groupId).success) return json({ ok: false, error: "bad_request" }, 400);
  try {
    const auth = await createSupabaseServer();
    const { data: u } = await auth.auth.getUser();
    if (!u.user) return failure("unauthenticated", 401);
    const due = await createSupabaseService().rpc("contribution_due", { p_group: groupId, p_user: u.user.id });
    if (due.error || due.data == null || BigInt(String(due.data)) <= 0n) return json({ ok: false, error: "nothing_due", message: VERIFY_MESSAGES.nothing_due }, 409);
    return json({ ok: true, amountStroops: String(due.data) });
  } catch {
    return failure("record_failed");
  }
}

/**
 * POST /api/stellar/contribution — registra el pago de una cuota SOLO después de verificarlo en Stellar Testnet.
 * Consulta Horizon y compara red, éxito, destino, origen de la operación y monto.
 * MVP TESTNET ONLY.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json({ ok: false, error: "forbidden_origin" }, 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, error: "bad_request" }, 400);
  const { groupId, txHash, provider } = parsed.data;

  try {
    const auth = await createSupabaseServer();
    const { data: u } = await auth.auth.getUser();
    if (!u.user) return failure("unauthenticated", 401);
    const userId = u.user.id;
    const svc = createSupabaseService();

    // Buscar el hash globalmente para impedir su reutilización en otro grupo/usuario.
    const recorded = async () => {
      const prev = await svc.from("contributions").select("user_id, group_id").eq("stellar_tx_hash", txHash).maybeSingle();
      if (prev.error) throw new Error("record_lookup_failed");
      if (!prev.data) return null;
      if (prev.data.user_id !== userId || prev.data.group_id !== groupId) return failure("tx_already_used", 409);
      return json({ ok: true, duplicate: true, code: "already_recorded", txHash });
    };
    const previous = await recorded();
    if (previous) return previous;

    const w = await svc.from("wallet_accounts").select("stellar_address, network, provider").eq("user_id", userId).eq("provider", provider).maybeSingle();
    if (w.error) return failure("record_failed");
    if (!w.data || w.data.network !== "TESTNET" || w.data.provider !== provider ||
        !StrKey.isValidEd25519PublicKey(w.data.stellar_address)) return failure("wallet_not_linked", 409);
    const treasury = process.env.NEXT_PUBLIC_STELLAR_TREASURY_PUBLIC;
    if (!treasury || !StrKey.isValidEd25519PublicKey(treasury)) return failure("record_failed");

    // 1) ¿cuánto debe pagar este usuario? (lo decide la base de datos, no el cliente)
    const due = await svc.rpc("contribution_due", { p_group: groupId, p_user: userId });
    if (due.error) throw new Error(due.error.message);
    if (due.data == null) return await recorded() ?? failure("not_member", 409);
    const amountStroops = BigInt(String(due.data));
    if (amountStroops <= 0n) return await recorded() ?? failure("nothing_due", 409);

    // 3) verificar en la red (Testnet) — nunca confiar solo en el hash
    await assertHorizonIsTestnet();
    const found = await fetchTxAndOps(txHash);
    if (!found) return failure("invalid_tx", 404);
    if (found.tx.hash !== txHash) return failure("invalid_tx", 422);
    const v = verifyPayment(found.tx, found.ops, {
      treasury,
      amountStroops,
      from: w.data.stellar_address,
    });
    if (!v.ok) {
      const reason = v.reason === "no_payment_to_treasury" ? "wrong_destination"
        : ["tx_failed", "multiple_payments", "wrong_asset"].includes(v.reason) ? "invalid_tx" : v.reason;
      return failure(reason, 422);
    }

    // 4) registro atómico (contribución + miembro + ledger + notificación); idempotente por hash
    const rec = await svc.rpc("record_contribution", {
      p_group: groupId, p_user: userId, p_amount: amountStroops.toString(), p_tx_hash: txHash, p_idem: "stellar:" + txHash,
    });
    const r = rec.data as { ok?: boolean; error?: string; duplicate?: boolean } | null;
    if (rec.error || !r?.ok) {
      // Otra petición pudo registrar el hash mientras esperábamos Horizon o el RPC.
      const concurrent = await recorded();
      if (concurrent) return concurrent;
      const reason = r?.error === "hash_already_used" ? "tx_already_used"
        : r?.error === "wrong_amount" ? "wrong_amount" : "record_failed";
      return failure(reason, rec.error ? 500 : 409);
    }
    return json({ ok: true, duplicate: !!r.duplicate, ...(r.duplicate ? { code: "already_recorded" } : {}), txHash });
  } catch {
    return failure("record_failed");
  }
}
