import { NextResponse } from "next/server";
import { z } from "zod";
import { isSameOrigin } from "@/lib/same-origin";
import { createSupabaseServer, createSupabaseService } from "@/lib/supabase/server";
import { assertHorizonIsTestnet } from "@/services/stellar/horizon";
import { isValidStellarAddress, sendFromTreasury } from "@/services/stellar/treasury";
import { memoForGroup } from "@/services/stellar/verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ groupId: z.string().uuid(), toUserId: z.string().uuid() });
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status });

/**
 * POST /api/stellar/disposal — el TESORERO dispone del fondo: treasury (Testnet) → wallet del destino.
 * Solo procede si el backend confirma que el grupo está en estado "listo" y quien llama es su tesorero.
 * MVP TESTNET ONLY: en producción esto debe ser un contrato/bóveda auditada (ver docs/STELLAR_TESTNET.md).
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json({ ok: false, error: "forbidden_origin" }, 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, error: "bad_request" }, 400);
  const { groupId, toUserId } = parsed.data;

  try {
    const auth = await createSupabaseServer();
    const { data: u } = await auth.auth.getUser();
    if (!u.user) return json({ ok: false, error: "unauthenticated" }, 401);
    const actor = u.user.id;
    const svc = createSupabaseService();

    // 1) validar rol y estado en la base de datos (nunca en el cliente)
    const g = await svc.from("groups").select("id, kind, status").eq("id", groupId).maybeSingle();
    if (!g.data || g.data.kind === "pandero") return json({ ok: false, error: "not_found" }, 404);
    if (g.data.status !== "listo") return json({ ok: false, error: "not_ready", message: "El grupo aún no está listo para disponer del fondo." }, 409);
    const t = await svc.from("group_members").select("role").eq("group_id", groupId).eq("user_id", actor).maybeSingle();
    if (t.data?.role !== "treasurer") return json({ ok: false, error: "forbidden", message: "Solo el tesorero puede disponer del fondo." }, 403);

    // 2) destino y monto (todo lo recaudado)
    const members = await svc.from("group_members").select("user_id, paid_stroops").eq("group_id", groupId);
    const rows = members.data ?? [];
    if (!rows.some((m) => m.user_id === toUserId)) return json({ ok: false, error: "not_member", message: "El destino no pertenece al grupo." }, 422);
    const total = rows.reduce((a, m) => a + BigInt(String(m.paid_stroops)), 0n);
    if (total <= 0n) return json({ ok: false, error: "nothing_to_send" }, 409);
    const dest = await svc.from("wallet_accounts").select("stellar_address").eq("user_id", toUserId).maybeSingle();
    const addr = dest.data?.stellar_address;
    if (!addr || !isValidStellarAddress(addr))
      return json({ ok: false, error: "recipient_wallet_missing", message: "El destino aún no conectó una wallet de Stellar Testnet." }, 422);

    // 3) candado atómico en la BD: impide enviar dos veces el fondo (doble clic / peticiones concurrentes)
    const lock = await svc.rpc("begin_disposal", { p_group: groupId, p_actor: actor });
    const lk = lock.data as { ok: boolean; error?: string } | null;
    if (lock.error || !lk?.ok) {
      const inProgress = lk?.error === "in_progress";
      return json({ ok: false, error: lk?.error ?? "server_error", message: inProgress ? "Ya hay una disposición en curso para este grupo." : "No se pudo iniciar la disposición." }, inProgress ? 409 : 500);
    }

    // 4) enviar desde la treasury (Testnet) y 5) registrar con el hash real
    await assertHorizonIsTestnet();
    let hash: string;
    try {
      hash = await sendFromTreasury({ to: addr, amountStroops: total, memo: memoForGroup(groupId) });
    } catch (e) {
      await svc.rpc("abort_disposal", { p_group: groupId }); // el envío falló: liberamos el candado para reintentar
      throw e;
    }
    let rec = await svc.rpc("record_disposal", { p_group: groupId, p_actor: actor, p_to: toUserId, p_amount: total.toString(), p_tx_hash: hash });
    if (rec.error) rec = await svc.rpc("record_disposal", { p_group: groupId, p_actor: actor, p_to: toUserId, p_amount: total.toString(), p_tx_hash: hash });
    if (rec.error || !(rec.data as { ok: boolean }).ok) {
      // el dinero ya salió de la treasury: devolvemos el hash para conciliación manual
      return json({ ok: false, error: "record_failed", txHash: hash, message: "El envío se realizó pero no pudo registrarse; conserva el hash " + hash }, 500);
    }
    return json({ ok: true, txHash: hash, amountStroops: total.toString() });
  } catch (e) {
    return json({ ok: false, error: "server_error", message: e instanceof Error ? e.message : "Error del servidor" }, 500);
  }
}
