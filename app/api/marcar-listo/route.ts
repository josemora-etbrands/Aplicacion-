/**
 * POST /api/marcar-listo  { sku, listo }
 * Marca/desmarca un SKU como "Listo" (revisado). Persiste en products.listo.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { sku?: string; listo?: boolean };
  const sku = body.sku?.toString().trim();
  if (!sku) return NextResponse.json({ error: "SKU requerido." }, { status: 400 });

  const r = await prisma.product.updateMany({ where: { sku }, data: { listo: !!body.listo } });
  if (r.count === 0) return NextResponse.json({ error: `SKU no encontrado: ${sku}` }, { status: 404 });
  return NextResponse.json({ success: true, sku, listo: !!body.listo });
}
