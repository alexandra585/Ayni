/**
 * Adaptador financiero. La UI nunca habla con Stellar ni con Supabase directamente:
 * usa un `PaymentRail`. Implementaciones:
 *  - DemoPaymentRail  → simulado, en memoria (modo demo).
 *  - StellarTestnetRail → Freighter + verificación en servidor + Supabase (modo supabase). MVP TESTNET ONLY.
 */
import { APP_MODE } from "@/config/app";
import { rid } from "@/domain/env";
import { useAyni } from "@/store/ayni";
import { StellarTestnetRail } from "./stellar/rail";

export interface PaymentRail {
  readonly kind: "demo" | "stellar-testnet";
  /** Pasos que se muestran mientras se procesa un pago. */
  payLabels(amount: string): string[];
  /** ¿Puede pagar? (demo: saldo de la billetera Ayni · stellar: Freighter conectado). */
  canPay(amount: number): { ok: true } | { ok: false; missing: number };
  payContribution(input: { groupId: string; amount: number }): Promise<{ hash: string }>;
  releaseFund(input: { groupId: string; to: string }): Promise<{ hash: string | null }>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const DemoPaymentRail: PaymentRail = {
  kind: "demo",
  payLabels: (amt) => ["Confirmando con tu huella", "Enviando " + amt + " a la bóveda", "Registrado en Stellar"],
  canPay(amount) {
    const bal = useAyni.getState().s.wallet!.bal;
    return bal >= amount - 0.001 ? { ok: true } : { ok: false, missing: Math.round((amount - bal) * 100) / 100 };
  },
  async payContribution({ groupId, amount }) {
    await sleep(3 * 550); // mismo ritmo que el prototipo (3 pasos × 550 ms)
    const hash = rid(32);
    const ok = useAyni.getState().payCuota(groupId, amount, hash);
    if (!ok) throw new Error("Saldo insuficiente");
    return { hash };
  },
  async releaseFund({ groupId, to }) {
    useAyni.getState().dispose(groupId, to);
    return { hash: null };
  },
};

/**
 * Rail activo según el modo de la app. Es síncrono a propósito: la UI nunca debe poder usar el rail
 * equivocado (p. ej. el simulado) mientras el real todavía "carga".
 */
export function getPaymentRail(): PaymentRail {
  return APP_MODE === "supabase" ? StellarTestnetRail : DemoPaymentRail;
}
