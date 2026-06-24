/**
 * POST /api/admin/migrate
 *
 * Aplica migraciones idempotentes (ADD COLUMN IF NOT EXISTS) sobre la DB de producción,
 * usando el DATABASE_URL ya configurado en Vercel. Evita necesitar el password localmente.
 * Protegido por INGEST_SECRET.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime     = "nodejs";
export const maxDuration = 60;

const STATEMENTS = [
  `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "categoria" TEXT`,
  `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "velocidadPromedio" DOUBLE PRECISION`,
  `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "velocidadData" JSONB`,
  `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "esNuevo" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "ordenLlegada" INTEGER`,
  `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "listo" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "fechaLlegada" TIMESTAMPTZ`,
  `ALTER TABLE "palanca_logs" ADD COLUMN IF NOT EXISTS "implementado" BOOLEAN NOT NULL DEFAULT false`,
];

export async function POST(req: NextRequest) {
  const secret = process.env.INGEST_SECRET;
  if (!secret) return NextResponse.json({ error: "INGEST_SECRET no configurada." }, { status: 500 });
  if (req.headers.get("x-ingest-secret") !== secret) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const results: string[] = [];
  for (const sql of STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(sql);
      results.push(`OK: ${sql}`);
    } catch (e) {
      results.push(`ERR: ${sql} → ${String(e)}`);
    }
  }
  return NextResponse.json({ success: true, results });
}
