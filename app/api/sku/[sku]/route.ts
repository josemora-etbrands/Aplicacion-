import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sku: string }> },
) {
  const { sku } = await params;

  const product = await prisma.product.findUnique({
    where: { sku },
    include: {
      weeklySales: { orderBy: [{ year: "asc" }, { week: "asc" }] },
      palancaLogs: { orderBy: { fechaInicio: "asc" } },
    },
  });

  if (!product) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    product: {
      sku:              product.sku,
      nombre:           product.nombre,
      margenPct:        product.margenPct,
      stock:            product.stock,
      velocidadInicial: product.velocidadInicial,
      velocidadMadura:  product.velocidadMadura,
      publicidad:       product.publicidad,
      ingresos:         product.ingresos,
      ventas:           product.ventas,
      acos:             product.acos,
    },
    weeklySales: product.weeklySales.map(w => ({
      year: w.year, week: w.week, value: w.value,
    })),
    palancaLogs: product.palancaLogs.map(l => ({
      id:          l.id,
      tipoPalanca: l.tipoPalanca,
      fechaInicio: l.fechaInicio.toISOString(),
      comentario:  l.comentario,
      createdAt:   l.createdAt.toISOString(),
    })),
  });
}
