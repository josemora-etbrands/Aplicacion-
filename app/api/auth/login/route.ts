import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { crearSesion, COOKIE, cookieOpts } from "@/app/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({})) as { email?: string; password?: string };
  const e = (email ?? "").trim().toLowerCase();
  if (!e || !password) {
    return NextResponse.json({ error: "Correo y contraseña requeridos." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: e } });
  // Mensaje genérico para no revelar si el correo existe (anti enumeración).
  if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
    return NextResponse.json({ error: "Correo o contraseña incorrectos." }, { status: 401 });
  }

  const token = await crearSesion({ sub: user.id, email: user.email });
  (await cookies()).set(COOKIE, token, cookieOpts);
  return NextResponse.json({ success: true, email: user.email });
}
