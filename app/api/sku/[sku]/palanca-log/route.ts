import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sku: string }> },
) {
  const { sku } = await params;

  const body = await req.json() as {
    tipoPalanca: string;
    fechaInicio: string;
    comentario?: string;
  };

  if (!body.tipoPalanca || !body.fechaInicio) {
    return NextResponse.json(
      { error: "tipoPalanca y fechaInicio son requeridos" },
      { status: 400 },
    );
  }

  const product = await prisma.product.findUnique({ where: { sku }, select: { id: true } });
  if (!product) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  const log = await prisma.palancaLog.create({
    data: {
      productId:   product.id,
      tipoPalanca: body.tipoPalanca.trim(),
      fechaInicio: new Date(body.fechaInicio),
      comentario:  body.comentario?.trim() || null,
    },
  });

  return NextResponse.json({
    id:          log.id,
    tipoPalanca: log.tipoPalanca,
    fechaInicio: log.fechaInicio.toISOString(),
    comentario:  log.comentario,
    createdAt:   log.createdAt.toISOString(),
  }, { status: 201 });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ sku: string }> },
) {
  const { sku: _sku } = await params;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  await prisma.palancaLog.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
