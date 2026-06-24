/**
 * Auth ligera y segura: sesión firmada (JWT HS256 vía jose) en cookie httpOnly.
 * La clave de firma es NEXTAUTH_SECRET (ya configurada en Vercel).
 * Compatible con el middleware (edge) y con las rutas Node.
 */
import { SignJWT, jwtVerify } from "jose";

export const COOKIE = "etb_session";
const DURACION = 60 * 60 * 24 * 7; // 7 días

function key(): Uint8Array {
  const s = process.env.NEXTAUTH_SECRET || "dev-insecure-secret-change-me";
  return new TextEncoder().encode(s);
}

export interface Sesion { sub: string; email: string }

export async function crearSesion(s: Sesion): Promise<string> {
  return new SignJWT({ email: s.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.sub)
    .setIssuedAt()
    .setExpirationTime(`${DURACION}s`)
    .sign(key());
}

export async function verificarSesion(token: string | undefined): Promise<Sesion | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return { sub: String(payload.sub), email: String(payload.email ?? "") };
  } catch {
    return null;
  }
}

export const cookieOpts = {
  httpOnly: true as const,
  secure: true as const,
  sameSite: "lax" as const,
  path: "/",
  maxAge: DURACION,
};
