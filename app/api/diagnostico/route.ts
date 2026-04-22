import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const UMBRAL_VISITAS = 50;
const UMBRAL_CONV    = 1.5;

export async function GET() {
  try {
    const criticos = await prisma.product.findMany({
      where: {
        OR: [
          { visitas:    { lt: UMBRAL_VISITAS } },
          { conversion: { lt: UMBRAL_CONV    } },
        ],
      },
      orderBy: { ventasSemanales: "asc" },
      select: {
        id: true, sku: true, nombre: true,
        visitas: true, conversion: true,
        ventasSemanales: true, metaInicial: true,
        posicionSEO: true, calificacion: true,
      },
    });

    const enriched = criticos.map(p => ({
      ...p,
      diagnostico: {
        visitasBajas:     p.visitas    < UMBRAL_VISITAS,
        conversionBaja:   p.conversion < UMBRAL_CONV,
        bajoMetaInicial:  p.ventasSemanales < p.metaInicial,
        prioridad: p.visitas < UMBRAL_VISITAS && p.conversion < UMBRAL_CONV ? "ALTA" : "MEDIA",
      },
    }));

    return NextResponse.json({
      total:    enriched.length,
      umbral:   { visitas: UMBRAL_VISITAS, conversion: UMBRAL_CONV },
      criticos: enriched,
    });
  } catch (error) {
    console.error("[GET /api/diagnostico]", error);
    return NextResponse.json({ error: "Error al obtener diagnóstico" }, { status: 500 });
  }
}
