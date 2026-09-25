/** Configuración de la app. `NEXT_PUBLIC_AYNI_MODE` = "demo" (por defecto) | "supabase". */
export type AppMode = "demo" | "supabase";
export const APP_MODE: AppMode = process.env.NEXT_PUBLIC_AYNI_MODE === "supabase" ? "supabase" : "demo";
export const isDemoMode = APP_MODE === "demo";

export const STELLAR = {
  network: "TESTNET" as const,
  networkPassphrase: "Test SDF Network ; September 2015",
  horizonUrl: process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org",
  treasuryPublic: process.env.NEXT_PUBLIC_STELLAR_TREASURY_PUBLIC || "",
};
