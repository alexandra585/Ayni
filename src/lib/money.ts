/**
 * Dinero para persistencia y Stellar: enteros en stroops (1 XLM = 10,000,000 stroops).
 * La UI/demo trabaja en XLM con 2 decimales; la base de datos y las verificaciones
 * on-chain NUNCA usan `number` como fuente de verdad.
 */
export const STROOPS_PER_XLM = 10_000_000n;

/** "50" | "50.25" | 50 → 500000000n. Máximo 7 decimales (precisión de Stellar). */
export function xlmToStroops(xlm: number | string): bigint {
  const s = typeof xlm === "number" ? xlm.toFixed(7) : String(xlm).trim();
  if (!/^\d+(\.\d{1,7})?$/.test(s)) throw new Error(`Monto XLM inválido: ${String(xlm)}`);
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole) * STROOPS_PER_XLM + BigInt(frac.padEnd(7, "0"));
}

/** 500000000n → "50.0000000" (representación exacta, sin flotantes). */
export function stroopsToXlmString(stroops: bigint): string {
  const neg = stroops < 0n;
  const abs = neg ? -stroops : stroops;
  const whole = abs / STROOPS_PER_XLM;
  const frac = (abs % STROOPS_PER_XLM).toString().padStart(7, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

/** Para mostrar en la UI (2 decimales). */
export function stroopsToXlm(stroops: bigint | number | string): number {
  return Number(BigInt(stroops)) / Number(STROOPS_PER_XLM);
}
