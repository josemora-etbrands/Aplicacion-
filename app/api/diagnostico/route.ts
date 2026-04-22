import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { diagnosticar } from "@/app/lib/diagnostico";

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      orderBy: [{ w17: "asc" }, { velocidadMadura: "desc" }],
    });

    const diagnosticos = products.map(diagnosticar);

    const resumen = {
      total:    diagnosticos.length,
      criticos: diagnosticos.filter(d => d.status === "ROJO").length,
      alertas:  diagnosticos.filter(d => d.status === "AMARILLO").length,
      optimos:  diagnosticos.filter(d => d.status === "VERDE").length,
    };

    return NextResponse.json({
      resumen,
      umbral: { velocidadInicial: "Meta 1 (mínimo)", velocidadMadura: "Meta 2 (objetivo)" },
      productos: diagnosticos,
    });
  } catch (error) {
    console.error("[GET /api/diagnostico]", error);
    return NextResponse.json({ error: "Error al obtener diagnóstico" }, { status: 500 });
  }
}
