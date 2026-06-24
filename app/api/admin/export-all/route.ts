/**
 * GET /api/admin/export-all (x-ingest-secret) — vuelca productos + palancas para embeber en código.
 * TEMPORAL: se usa una vez para generar demoData.ts y luego se elimina junto con la DB.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (req.headers.get("x-ingest-secret") !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const products = await prisma.product.findMany({
    orderBy: { sku: "asc" },
    select: {
      sku: true, nombre: true, categoria: true, velocidadInicial: true, velocidadMadura: true,
      velocidadPromedio: true, stock: true, esNuevo: true, ordenLlegada: true, fechaLlegada: true,
      velocidadData: true,
    },
  });
  const palancas = await prisma.palancaLog.findMany({
    orderBy: { fechaInicio: "desc" },
    include: { product: { select: { sku: true, nombre: true } } },
  });
  return NextResponse.json({
    products: products.map(p => ({ ...p, fechaLlegada: p.fechaLlegada ? p.fechaLlegada.toISOString() : null })),
    palancas: palancas.map(l => ({
      id: l.id, sku: l.product.sku, nombre: l.product.nombre, tipoPalanca: l.tipoPalanca,
      fechaInicio: l.fechaInicio.toISOString().slice(0, 10), comentario: l.comentario, implementado: l.implementado,
    })),
  });
}
