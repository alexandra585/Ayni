import { describe, expect, it } from "vitest";
import { STROOPS_PER_XLM, stroopsToXlm, stroopsToXlmString, xlmToStroops } from "@/lib/money";

describe("dinero en stroops (1 XLM = 10,000,000)", () => {
  it("convierte XLM a stroops sin errores de coma flotante", () => {
    expect(xlmToStroops(50)).toBe(500_000_000n);
    expect(xlmToStroops("50")).toBe(500_000_000n);
    expect(xlmToStroops("0.1")).toBe(1_000_000n);
    expect(xlmToStroops(0.1 + 0.2)).toBe(3_000_000n); // 0.30000000000000004 → 0.3000000 XLM
    expect(xlmToStroops("1234.5678901")).toBe(12_345_678_901n);
  });
  it("rechaza montos inválidos o con más de 7 decimales", () => {
    expect(() => xlmToStroops("-1")).toThrow();
    expect(() => xlmToStroops("1.12345678")).toThrow();
    expect(() => xlmToStroops("abc")).toThrow();
    expect(() => xlmToStroops("")).toThrow();
  });
  it("formatea stroops de forma exacta", () => {
    expect(stroopsToXlmString(500_000_000n)).toBe("50.0000000");
    expect(stroopsToXlmString(1n)).toBe("0.0000001");
    expect(stroopsToXlmString(-15_000_000n)).toBe("-1.5000000");
  });
  it("ida y vuelta para la UI (2 decimales)", () => {
    expect(stroopsToXlm(500_000_000n)).toBe(50);
    expect(stroopsToXlm("12500000")).toBe(1.25);
    expect(STROOPS_PER_XLM).toBe(10_000_000n);
  });
  it("la suma de cuotas en stroops es exacta (24 × 50 XLM)", () => {
    const total = Array.from({ length: 24 }, () => xlmToStroops(50)).reduce((a, b) => a + b, 0n);
    expect(total).toBe(xlmToStroops(1200));
  });
});
