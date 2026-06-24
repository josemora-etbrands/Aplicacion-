import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const APP_ORIGIN = "https://aplicacion-neon.vercel.app";

export async function GET(req: NextRequest) {
  const cid = process.env.GOOGLE_CLIENT_ID;
  if (!cid) {
    return NextResponse.redirect(`${APP_ORIGIN}/login?error=${encodeURIComponent("Google aún no está configurado.")}`);
  }
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: cid,
    redirect_uri: `${APP_ORIGIN}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    hd: "etbrands.cl",            // sugiere el dominio en la pantalla de Google
    prompt: "select_account",
    access_type: "online",
    state,
  });
  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  res.cookies.set("g_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
