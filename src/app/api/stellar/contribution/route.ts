import { NextResponse } from "next/server";
import { z } from "zod";
import { isSameOrigin } from "@/lib/same-origin";
import { createSupabaseServer, createSupabaseService } from "@/lib/supabase/server";
import { assertHorizonIsTestnet, fetchTxAndOps } from "@/services/stellar/horizon";
import { treasuryPublicKey } from "@/services/stellar/treasury";
import { memoForGroup, VERIFY_MESSAGES, verifyPayment } from "@/services/stellar/verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ groupId: z.string().uuid(), txHash: z.string().regex(/^[0-9a-f]{64}$/, "hash inválido") });

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status });

/** GET /api/stellar/contribution?groupId=… — monto exacto (stroops) que debe pagar el usuario, según la base de datos. */
export async function GET(req: Request) {
  const groupId = new URL(req.url).searchParams.get("groupId") ?? "";
  if (!z.string().uuid().safeParse(groupId).success) return json({ ok: false, error: "bad_request" }, 400);
  try {
    const auth = await createSupabaseServer();
    const { data: u } = await auth.auth.getUser();
    if (!u.user) return json({ ok: false, error: "unauthenticated" }, 401);
    const due = await createSupabaseService().rpc("contribution_due", { p_group: groupId, p_user: u.user.id });
    if (due.error || due.data == null || BigInt(String(due.data)) <= 0n) return json({ ok: false, error: "nothing_due", message: VERIFY_MESSAGES.nothing_due }, 409);
    return json({ ok: true, amountStroops: String(due.data) });
  } catch (e) {
    return json({ ok: false, error: "server_error", message: e instanceof Error ? e.message : "Error del servidor" }, 500);
  }
}

/**
 * POST /api/stellar/contribution — registra el pago de una cuota SOLO después de verificarlo en Stellar Testnet.
 * Nunca confía en el navegador: consulta Horizon y compara red, éxito, destino, emisor, monto y memo.
 * MVP TESTNET ONLY.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json({ ok: false, error: "forbidden_origin" }, 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, error: "bad_request" }, 400);
  const { groupId, txHash } = parsed.data;

  try {
    const auth = await createSupabaseServer();
    const { data: u } = await auth.auth.getUser();
    if (!u.user) return json({ ok: false, error: "unauthenticated" }, 401);
    const userId = u.user.id;
    const svc = createSupabaseService();

    // 0) reintento tras un corte de red: si este mismo hash ya quedó registrado para este usuario/grupo → éxito idempotente
    const prev = await svc.from("contributions").select("id").eq("stellar_tx_hash", txHash).eq("user_id", userId).eq("group_id", groupId).maybeSingle();
    if (prev.data) return json({ ok: true, duplicate: true, txHash });

    // 1) ¿cuánto debe pagar este usuario? (lo decide la base de datos, no el cliente)
    const due = await svc.rpc("contribution_due", { p_group: groupId, p_user: userId });
    if (due.error) throw new Error(due.error.message);
    if (due.data == null) return json({ ok: false, error: "not_member", message: VERIFY_MESSAGES.not_member }, 409);
    const amountStroops = BigInt(String(due.data));
    if (amountStroops <= 0n) return json({ ok: false, error: "nothing_due", message: VERIFY_MESSAGES.nothing_due }, 409);

    // 2) wallet registrada del pagador (si existe, el emisor debe coincidir)
    const w = await svc.from("wallet_accounts").select("stellar_address").eq("user_id", userId).maybeSingle();

    // 3) verificar en la red (Testnet) — nunca confiar solo en el hash
    await assertHorizonIsTestnet();
    const found = await fetchTxAndOps(txHash);
    if (!found) return json({ ok: false, error: "tx_not_found", message: "No encontramos la transacción en Stellar Testnet." }, 404);
    const v = verifyPayment(found.tx, found.ops, {
      treasury: treasuryPublicKey(),
      amountStroops,
      memo: memoForGroup(groupId),
      from: w.data?.stellar_address ?? null,
    });
    if (!v.ok) return json({ ok: false, error: v.reason, message: VERIFY_MESSAGES[v.reason] }, 422);

    // 4) registro atómico (contribución + miembro + ledger + notificación); idempotente por hash
    const rec = await svc.rpc("record_contribution", {
      p_group: groupId, p_user: userId, p_amount: amountStroops.toString(), p_tx_hash: txHash, p_idem: "stellar:" + txHash,
    });
    if (rec.error) throw new Error(rec.error.message);
    const r = rec.data as { ok: boolean; error?: string; duplicate?: boolean };
    if (!r.ok) return json({ ok: false, error: r.error, message: VERIFY_MESSAGES[r.error ?? ""] ?? "No se pudo registrar el pago." }, 409);
    return json({ ok: true, duplicate: !!r.duplicate, txHash });
  } catch (e) {
    return json({ ok: false, error: "server_error", message: e instanceof Error ? e.message : "Error del servidor" }, 500);
  }
}
