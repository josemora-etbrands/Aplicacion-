import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface ExecutePayload {
  sku:          string;
  palancaId:    string;
  ejecutadoPor: "USUARIO" | "IA";
  impacto?:     number;
  notas?:       string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ExecutePayload;
    const { sku, palancaId, ejecutadoPor, impacto, notas } = body;

    // Validación
    if (!sku || !palancaId || !ejecutadoPor) {
      return NextResponse.json(
        { error: "Campos requeridos: sku, palancaId, ejecutadoPor" },
        { status: 400 }
      );
    }
    if (!["USUARIO", "IA"].includes(ejecutadoPor)) {
      return NextResponse.json(
        { error: "ejecutadoPor debe ser USUARIO o IA" },
        { status: 400 }
      );
    }

    // Buscar producto
    const product = await prisma.product.findUnique({ where: { sku } });
    if (!product) {
      return NextResponse.json({ error: `SKU no encontrado: ${sku}` }, { status: 404 });
    }

    // Buscar palanca
    const palanca = await prisma.palanca.findUnique({ where: { id: palancaId } });
    if (!palanca) {
      return NextResponse.json({ error: `Palanca no encontrada: ${palancaId}` }, { status: 404 });
    }

    // Registrar acción
    const actionLog = await prisma.actionLog.create({
      data: {
        productId:    product.id,
        palancaId:    palanca.id,
        ejecutadoPor,
        impacto:      impacto ?? null,
        notas:        notas   ?? null,
      },
      include: { product: true, palanca: true },
    });

    return NextResponse.json({
      success: true,
      message: `Palanca "${palanca.nombre}" activada en SKU ${sku} por ${ejecutadoPor}`,
      actionLog: {
        id:           actionLog.id,
        sku:          actionLog.product.sku,
        palanca:      actionLog.palanca.nombre,
        categoria:    actionLog.palanca.categoria,
        ejecutadoPor: actionLog.ejecutadoPor,
        impacto:      actionLog.impacto,
        notas:        actionLog.notas,
        timestamp:    actionLog.createdAt,
      },
    }, { status: 201 });

  } catch (error) {
    console.error("[POST /api/execute-palanca]", error);
    return NextResponse.json({ error: "Error interno al ejecutar palanca" }, { status: 500 });
  }
}
