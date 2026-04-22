import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { diagnosticar } from "@/app/lib/diagnostico";

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      orderBy: [{ sku: "asc" }],
      include: { weeklySales: { orderBy: [{ year: "asc" }, { week: "asc" }] } },
    });

    const diagnosticos = products.map(p =>
      diagnosticar({
        sku: p.sku, nombre: p.nombre,
        weekHistory: p.weeklySales.map(ws => ({ year: ws.year, week: ws.week, value: ws.value })),
        velocidadInicial: p.velocidadInicial, velocidadMadura: p.velocidadMadura,
        margenPct: p.margenPct, acos: p.acos,
        publicidad: p.publicidad, ventas: p.ventas, ingresos: p.ingresos,
        stock: p.stock, nota: p.nota,
      })
    );

    return NextResponse.json({
      resumen: {
        total:    diagnosticos.length,
        criticos: diagnosticos.filter(d => d.status === "ROJO").length,
        alertas:  diagnosticos.filter(d => d.status === "AMARILLO").length,
        optimos:  diagnosticos.filter(d => d.status === "VERDE").length,
      },
      umbral: { velocidadInicial: "Meta Inicial (mínimo)", velocidadMadura: "Meta Madura (objetivo)" },
      productos: diagnosticos,
    });
  } catch (error) {
    console.error("[GET /api/diagnostico]", error);
    return NextResponse.json({ error: "Error al obtener diagnóstico" }, { status: 500 });
  }
}
