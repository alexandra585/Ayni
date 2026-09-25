import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (antes "middleware"): refresca la sesión de Supabase en cada petición (cookies SSR) y
 * protege las rutas del portal cuando la app corre en modo `supabase`. En modo demo no hace nada.
 */
const PORTAL = ["/groups", "/forum", "/wallet", "/notifications", "/profile"];

export async function proxy(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_AYNI_MODE !== "supabase") return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (all) => {
        all.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        all.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() valida el JWT contra Supabase Auth (no confiar en getSession() en el servidor).
  // Si Supabase no responde, fallamos CERRADO: se trata como sin sesión (nunca se abre el portal por error).
  let signedIn = false;
  try {
    signedIn = !!(await supabase.auth.getUser()).data.user;
  } catch {
    signedIn = false;
  }
  const path = request.nextUrl.pathname;
  if (!signedIn && PORTAL.some((p) => path === p || path.startsWith(p + "/"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?next=" + encodeURIComponent(path);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
