/**
 * Defensa CSRF para los endpoints que usan la sesión por cookies: si el navegador envía `Origin`,
 * debe coincidir con el host de la petición. (Las cookies de Supabase además son SameSite=Lax.)
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // peticiones no-navegador (curl, server-to-server) no llevan Origin
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}
