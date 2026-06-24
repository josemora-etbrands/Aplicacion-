/**
 * GET /api/admin/export-palancas  (protegido por x-ingest-secret)
 * Devuelve TODAS las palancas registradas con su producto, para exportar a Excel.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (req.headers.get("x-ingest-secret") !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const logs = await prisma.palancaLog.findMany({
    orderBy: [{ tipoPalanca: "asc" }, { fechaInicio: "desc" }],
    include: { product: { select: { sku: true, nombre: true, categoria: true } } },
  });
  return NextResponse.json({
    total: logs.length,
    palancas: logs.map(l => ({
      sku: l.product.sku,
      nombre: l.product.nombre,
      categoria: l.product.categoria ?? "",
      palanca: l.tipoPalanca,
      fechaInicio: l.fechaInicio.toISOString().slice(0, 10),
      comentario: l.comentario ?? "",
      implementado: l.implementado ? "Sí" : "No",
      registrada: l.createdAt.toISOString().slice(0, 10),
    })),
  });
}
