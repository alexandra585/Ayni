import { NextResponse } from "next/server";
import { STELLAR } from "@/config/app";
import { treasuryPublicKey } from "@/services/stellar/treasury";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/stellar/config — datos PÚBLICOS para armar pagos (nunca la secret). MVP TESTNET ONLY. */
export async function GET() {
  try {
    return NextResponse.json({ network: STELLAR.network, horizonUrl: STELLAR.horizonUrl, treasury: treasuryPublicKey() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "config" }, { status: 500 });
  }
}
