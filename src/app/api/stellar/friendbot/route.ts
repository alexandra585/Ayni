import { StrKey } from "@stellar/stellar-sdk";
import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/same-origin";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const failure = (message: string, status: number) => NextResponse.json({ ok: false, message }, { status });

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return failure("Origen no permitido.", 403);
  try {
    const supabase = await createSupabaseServer();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return failure("Inicia sesión para fondear tu wallet.", 401);
    if (process.env.NEXT_PUBLIC_STELLAR_NETWORK !== "testnet") {
      return failure("Friendbot solo está disponible en Stellar Testnet.", 403);
    }

    // La dirección procede únicamente de la wallet vinculada al usuario autenticado.
    const { data: account, error: lookupError } = await supabase.from("wallet_accounts")
      .select("stellar_address, provider, network").eq("user_id", user.id).maybeSingle();
    if (lookupError) return failure("No se pudo consultar tu wallet vinculada.", 500);
    if (!account || account.provider !== "cavos" || account.network !== "TESTNET" ||
        typeof account.stellar_address !== "string" || !account.stellar_address.startsWith("G") ||
        !StrKey.isValidEd25519PublicKey(account.stellar_address)) {
      return failure("Vincula una wallet Cavos válida de Stellar Testnet.", 409);
    }

    const response = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(account.stellar_address)}`, {
      cache: "no-store", signal: AbortSignal.timeout(30_000),
    });
    const result = await response.json().catch(() => null);
    const detail = typeof result?.detail === "string" ? result.detail : "";
    const alreadyActive = !response.ok && response.status === 400 &&
      /(?:account\s+already\s+exists|already\s+funded|account\s+has\s+enough\s+balance|op_already_exists)/i.test(detail);
    if (!response.ok && !alreadyActive) return failure("No se pudo fondear con Friendbot. Puedes intentarlo más tarde.", 502);
    return NextResponse.json({
      ok: true,
      message: alreadyActive ? "La wallet ya está activa en Testnet." : "Wallet fondeada en Stellar Testnet",
    });
  } catch {
    return failure("No se pudo completar el fondeo. Refresca el saldo antes de volver a intentarlo.", 502);
  }
}
