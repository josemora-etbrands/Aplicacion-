import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verificarSesion, COOKIE } from "@/app/lib/auth";

// Páginas públicas (sin sesión)
const PAGINAS_PUBLICAS = ["/login", "/registro"];
// APIs públicas: auth + endpoints máquina protegidos por su propio secreto
const API_PUBLICA = ["/api/auth/", "/api/ingest-velocities", "/api/ingest-finance", "/api/cron/", "/api/admin/"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (API_PUBLICA.some(p => pathname.startsWith(p))) return NextResponse.next();
  if (PAGINAS_PUBLICAS.includes(pathname)) return NextResponse.next();

  const sesion = await verificarSesion(req.cookies.get(COOKIE)?.value);
  if (!sesion) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autorizado. Inicia sesión." }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?from=${encodeURIComponent(pathname)}` : "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Protege todo salvo internos de Next y archivos estáticos
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|ico|webp)$).*)"],
};
