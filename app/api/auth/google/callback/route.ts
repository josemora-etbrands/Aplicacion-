import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { crearSesion, COOKIE, cookieOpts } from "@/app/lib/auth";

export const runtime = "nodejs";

const APP_ORIGIN = "https://aplicacion-neon.vercel.app";
const DOMINIO = "@etbrands.cl";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const fail = (m: string) => NextResponse.redirect(`${APP_ORIGIN}/login?error=${encodeURIComponent(m)}`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const saved = req.cookies.get("g_state")?.value;
  if (!code || !state || state !== saved) return fail("Sesión de Google inválida, reintenta.");

  const cid = process.env.GOOGLE_CLIENT_ID, cs = process.env.GOOGLE_CLIENT_SECRET;
  if (!cid || !cs) return fail("Google no está configurado en el servidor.");

  try {
    // 1) intercambiar el code por tokens
    const tok = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: cid, client_secret: cs,
        redirect_uri: `${APP_ORIGIN}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    }).then(r => r.json()) as { access_token?: string };
    if (!tok.access_token) return fail("No se pudo autenticar con Google.");

    // 2) obtener el perfil
    const info = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    }).then(r => r.json()) as { email?: string; email_verified?: boolean; name?: string };

    const email = (info.email ?? "").toLowerCase();
    if (!info.email_verified || !email.endsWith(DOMINIO)) {
      return fail(`Debes ingresar con tu correo ${DOMINIO}`);
    }

    // 3) crear/identificar usuario y abrir sesión
    const user = await prisma.user.upsert({
      where:  { email },
      update: { name: info.name ?? undefined },
      create: { email, name: info.name ?? null },
    });
    const token = await crearSesion({ sub: user.id, email: user.email });
    const res = NextResponse.redirect(`${APP_ORIGIN}/`);
    res.cookies.set(COOKIE, token, cookieOpts);
    res.cookies.delete("g_state");
    return res;
  } catch {
    return fail("Error al conectar con Google. Intenta de nuevo.");
  }
}
