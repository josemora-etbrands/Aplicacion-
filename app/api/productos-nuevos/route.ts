/**
 * Gestión del filtro "Producto nuevo" (persistido en la DB).
 *   GET            → lista de SKUs marcados como nuevos (con su orden de llegada).
 *   POST {sku}     → marca un SKU como nuevo (orden de llegada = último + 1).
 *   POST {seed:true} → siembra los 69 iniciales desde el código (idempotente).
 *   DELETE ?sku=   → quita un SKU del filtro.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PRODUCTOS_NUEVOS } from "@/app/lib/productosNuevos";

export const runtime = "nodejs";

export async function GET() {
  const items = await prisma.product.findMany({
    where:  { esNuevo: true },
    select: { sku: true, nombre: true, ordenLlegada: true },
    orderBy: { ordenLlegada: "asc" },
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { sku?: string; seed?: boolean };

  // ── Seed inicial: marca los 69 del código con su orden ──────────
  if (body.seed) {
    let ok = 0, missing = 0;
    for (let i = 0; i < PRODUCTOS_NUEVOS.length; i++) {
      const sku = PRODUCTOS_NUEVOS[i];
      const r = await prisma.product.updateMany({ where: { sku }, data: { esNuevo: true, ordenLlegada: i } });
      if (r.count > 0) ok++; else missing++;
    }
    return NextResponse.json({ success: true, seeded: ok, noEncontrados: missing });
  }

  // ── Agregar un SKU ──────────────────────────────────────────────
  const sku = body.sku?.toString().trim();
  if (!sku) return NextResponse.json({ error: "SKU requerido." }, { status: 400 });

  const product = await prisma.product.findUnique({ where: { sku }, select: { id: true, esNuevo: true } });
  if (!product) return NextResponse.json({ error: `SKU no encontrado en el catálogo: ${sku}` }, { status: 404 });
  if (product.esNuevo) return NextResponse.json({ success: true, sku, yaEstaba: true });

  const last = await prisma.product.aggregate({ _max: { ordenLlegada: true } });
  const orden = (last._max.ordenLlegada ?? -1) + 1;
  await prisma.product.update({ where: { id: product.id }, data: { esNuevo: true, ordenLlegada: orden } });
  return NextResponse.json({ success: true, sku, ordenLlegada: orden });
}

export async function DELETE(req: NextRequest) {
  const sku = new URL(req.url).searchParams.get("sku")?.trim();
  if (!sku) return NextResponse.json({ error: "SKU requerido." }, { status: 400 });
  await prisma.product.updateMany({ where: { sku }, data: { esNuevo: false, ordenLlegada: null } });
  return NextResponse.json({ success: true, sku });
}
