import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { diagnosticar } from "@/app/lib/diagnostico";

interface ExecutePayload {
  sku:          string;
  palancaNombre: string;
  ejecutadoPor: "USUARIO" | "IA";
  impacto?:     number;
  notas?:       string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ExecutePayload;
    const { sku, palancaNombre, ejecutadoPor, impacto, notas } = body;

    if (!sku || !palancaNombre || !ejecutadoPor) {
      return NextResponse.json(
        { error: "Campos requeridos: sku, palancaNombre, ejecutadoPor" },
        { status: 400 }
      );
    }

    const product = await prisma.product.findUnique({ where: { sku } });
    if (!product) return NextResponse.json({ error: `SKU no encontrado: ${sku}` }, { status: 404 });

    const palanca = await prisma.palanca.findFirst({ where: { nombre: { contains: palancaNombre } } });
    if (!palanca) return NextResponse.json({ error: `Palanca no encontrada: ${palancaNombre}` }, { status: 404 });

    const actionLog = await prisma.actionLog.create({
      data: { productId: product.id, palancaId: palanca.id, ejecutadoPor, impacto: impacto ?? null, notas: notas ?? null },
      include: { product: true, palanca: true },
    });

    const diagnostico = diagnosticar(product);

    return NextResponse.json({
      success:     true,
      message:     `Palanca "${palanca.nombre}" activada en SKU ${sku} por ${ejecutadoPor}`,
      diagnostico: { status: diagnostico.status, ultimaSemana: diagnostico.ultimaSemana, acosDisplay: diagnostico.acosDisplay },
      actionLog: {
        id: actionLog.id, sku, palanca: palanca.nombre,
        categoria: palanca.categoria, ejecutadoPor, impacto, notas,
        timestamp: actionLog.createdAt,
      },
    }, { status: 201 });

  } catch (error) {
    console.error("[POST /api/execute-palanca]", error);
    return NextResponse.json({ error: "Error interno al ejecutar palanca" }, { status: 500 });
  }
}
