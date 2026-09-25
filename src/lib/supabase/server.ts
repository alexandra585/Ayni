/** Clientes de Supabase SOLO para servidor (route handlers, proxy). */
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/** Cliente con la sesión del usuario (cookies). Respeta RLS. */
export async function createSupabaseServer(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (all) => {
        try {
          all.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* en Server Components las cookies son de solo lectura; el proxy las refresca */
        }
      },
    },
  });
}

/**
 * Cliente con service-role: OMITE RLS. Solo para registrar pagos ya verificados en Stellar.
 * La clave vive únicamente en SUPABASE_SERVICE_ROLE_KEY (jamás NEXT_PUBLIC_*).
 */
export function createSupabaseService(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
