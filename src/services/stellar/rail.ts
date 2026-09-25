"use client";
/**
 * StellarTestnetRail — pagos reales en Stellar TESTNET con Freighter. MVP TESTNET ONLY.
 *
 *   Pagar → (1) el servidor dice cuánto se debe (DB) → (2) Freighter firma y se envía a Testnet →
 *   (3) el servidor VERIFICA la transacción en Horizon → (4) Supabase registra (ledger) → (5) UI se actualiza.
 */
import { currentUserId, refreshSnapshot } from "@/repositories/supabase";
import { useAyni } from "@/store/ayni";
import type { PaymentRail } from "../payment-rail";
import { connectFreighter, fetchTreasury, signAndSubmitPayment } from "./freighter";
import { memoForGroup } from "./verify";

async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const body = (await r.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string; amountStroops?: string; txHash?: string };
  return { r, body };
}

export const StellarTestnetRail: PaymentRail = {
  kind: "stellar-testnet",
  payLabels: () => ["Firmando con Freighter", "Enviando a Stellar Testnet", "Verificando y registrando"],
  canPay: () => ({ ok: true }),

  async payContribution({ groupId }) {
    // 1) monto exacto según la base de datos (evita pagar un monto que luego no se acepte)
    const due = await api("/api/stellar/contribution?groupId=" + groupId);
    if (!due.body.ok) throw new Error(due.body.message || "No tienes cuota pendiente.");
    const amountStroops = BigInt(due.body.amountStroops!);

    // 2) wallet + firma + envío a Testnet
    const conn = useAyni.getState().s.wallet?.conn.freighter;
    const from = conn?.addr ?? (await connectFreighter());
    const treasury = await fetchTreasury();
    const hash = await signAndSubmitPayment({ from, to: treasury, amountStroops, memo: memoForGroup(groupId) });

    // 3) verificación en el servidor (nunca solo el hash del navegador) + registro
    const ver = await api("/api/stellar/contribution", { method: "POST", body: JSON.stringify({ groupId, txHash: hash }) });
    if (!ver.body.ok) throw new Error((ver.body.message || "No se pudo verificar el pago") + " (tx " + hash + ")");
    await refreshSnapshot();
    return { hash };
  },

  async releaseFund({ groupId, to }) {
    const toUserId = to === "me" ? await currentUserId() : to;
    const res = await api("/api/stellar/disposal", { method: "POST", body: JSON.stringify({ groupId, toUserId }) });
    if (!res.body.ok) throw new Error(res.body.message || "No se pudo disponer del fondo");
    await refreshSnapshot();
    return { hash: res.body.txHash ?? null };
  },
};
