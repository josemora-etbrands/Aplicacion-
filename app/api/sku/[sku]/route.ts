import { NextResponse } from "next/server";
import { PRODUCTOS_DEMO } from "@/app/lib/demoData";

export const dynamic = "force-static";

export async function GET(_req: Request, { params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const p = PRODUCTOS_DEMO.find(x => x.sku === sku);
  if (!p) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const d = (p.velocidadData ?? {}) as { detalle?: unknown };
  return NextResponse.json({
    product: {
      sku: p.sku, nombre: p.nombre, categoria: p.categoria,
      velocidadInicial: p.velocidadInicial, velocidadMadura: p.velocidadMadura,
      velocidadPromedio: p.velocidadPromedio, stock: p.stock,
      // campos heredados que el modal tolera ausentes/0
      margenPct: 0, publicidad: 0, ingresos: 0, ventas: 0, acos: 0,
      fechaLlegada: p.fechaLlegada,
    },
    detalle: d.detalle ?? null,
    // Las palancas viven en el navegador (store local) en modo demo.
    palancaLogs: [],
  });
}
