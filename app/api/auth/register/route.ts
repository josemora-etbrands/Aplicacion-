import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { crearSesion, COOKIE, cookieOpts } from "@/app/lib/auth";

export const runtime = "nodejs";

const DOMINIO = "@etbrands.cl";

export async function POST(req: NextRequest) {
  const { email, password, name } = await req.json().catch(() => ({})) as { email?: string; password?: string; name?: string };
  const e = (email ?? "").trim().toLowerCase();

  if (!e.endsWith(DOMINIO)) {
    return NextResponse.json({ error: `Solo se permiten correos ${DOMINIO}` }, { status: 403 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: e } });
  if (existing?.password) {
    return NextResponse.json({ error: "Ya existe una cuenta con ese correo. Inicia sesión." }, { status: 409 });
  }

  const hash = await bcrypt.hash(password, 10);
  const user = existing
    ? await prisma.user.update({ where: { email: e }, data: { password: hash, name: name?.trim() || existing.name } })
    : await prisma.user.create({ data: { email: e, password: hash, name: name?.trim() || null } });

  const token = await crearSesion({ sub: user.id, email: user.email });
  (await cookies()).set(COOKIE, token, cookieOpts);
  return NextResponse.json({ success: true, email: user.email });
}
