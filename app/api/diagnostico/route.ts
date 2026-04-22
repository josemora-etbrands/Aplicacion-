import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { diagnosticar } from "@/app/lib/diagnostico";
import { assignYears, currentISOWeek } from "@/app/lib/weekUtils";

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      orderBy: [{ velocidadMadura: "desc" }],
      include: { weeklySales: { orderBy: [{ year: "asc" }, { week: "asc" }] } },
    });

    const { year: refYear, week: refWeek } = currentISOWeek();
    const legacyWeekKeys = assignYears([13, 14, 15, 16, 17], refYear, refWeek);

    const diagnosticos = products.map(p => {
      const weekHistory = p.weeklySales.length > 0
        ? p.weeklySales.map(ws => ({ year: ws.year, week: ws.week, value: ws.value }))
        : legacyWeekKeys.map((wk, i) => ({
            ...wk,
            value: [p.w13, p.w14, p.w15, p.w16, p.w17][i] ?? 0,
          }));
      return diagnosticar({
        sku: p.sku, nombre: p.nombre,
        weekHistory,
        velocidadInicial: p.velocidadInicial, velocidadMadura: p.velocidadMadura,
        margenPct: p.margenPct, acos: p.acos,
        publicidad: p.publicidad, ventas: p.ventas, ingresos: p.ingresos,
        stock: p.stock, nota: p.nota,
      });
    });

    const resumen = {
      total:    diagnosticos.length,
      criticos: diagnosticos.filter(d => d.status === "ROJO").length,
      alertas:  diagnosticos.filter(d => d.status === "AMARILLO").length,
      optimos:  diagnosticos.filter(d => d.status === "VERDE").length,
    };

    return NextResponse.json({
      resumen,
      umbral: { velocidadInicial: "Meta Inicial (mínimo)", velocidadMadura: "Meta Madura (objetivo)" },
      productos: diagnosticos,
    });
  } catch (error) {
    console.error("[GET /api/diagnostico]", error);
    return NextResponse.json({ error: "Error al obtener diagnóstico" }, { status: 500 });
  }
}
