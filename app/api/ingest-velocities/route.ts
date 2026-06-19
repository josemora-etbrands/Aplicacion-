/**
 * POST /api/ingest-velocities
 *
 * Recibe las metas de velocidad + categoría ABC extraídas desde el panel de
 * ProfitGuard (`/api/internal/sales_speed/product_items`), que SOLO son accesibles
 * con la sesión del navegador (no con la API key). El bookmarklet de PG las envía aquí.
 *
 * Seguridad: header `x-ingest-secret` debe coincidir con INGEST_SECRET (env).
 *
 * Body: { items: [{ sku, weeklySalesSpeed, category?, averageWeeklySales? }, ...] }
 *
 * Mapeo (v1, sin migración): PG entrega UNA meta (`weeklySalesSpeed`).
 *   - velocidadMadura  = weeklySalesSpeed              (objetivo)
 *   - velocidadInicial = round(weeklySalesSpeed * 0.3) (piso de rampa)
 * La categoría ABC se persistirá cuando se agregue la columna `categoria` (migración pendiente).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime     = "nodejs";
export const maxDuration = 120;

// El bookmarklet corre en app.profitguard.cl y envía a este dominio (cross-origin).
// La protección real es el header x-ingest-secret, así que permitimos cualquier origen.
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-ingest-secret",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const INICIAL_RATIO = 0.3; // fracción de la meta madura usada como piso inicial

interface VelocityItem {
  sku:                string;
  weeklySalesSpeed:   number;
  category?:          string;
  averageWeeklySales?: number;
}

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────
  const secret = process.env.INGEST_SECRET;
  if (!secret) {
    return json(
      { error: "INGEST_SECRET no configurada en el servidor. Agrégala en Vercel → Environment Variables." },
      500,
    );
  }
  if (req.headers.get("x-ingest-secret") !== secret) {
    return json({ error: "No autorizado." }, 401);
  }

  // ── Body ──────────────────────────────────────────────────────
  let items: VelocityItem[];
  try {
    const body = (await req.json()) as { items?: VelocityItem[] };
    items = Array.isArray(body.items) ? body.items : [];
  } catch {
    return json({ error: "JSON inválido." }, 400);
  }
  if (items.length === 0) {
    return json({ error: "No se recibieron items." }, 400);
  }

  // ── Upsert metas de velocidad ─────────────────────────────────
  let updated = 0, created = 0, skipped = 0;
  const errors: string[] = [];

  for (const it of items) {
    const sku = it.sku?.toString().trim();
    const madura = Number(it.weeklySalesSpeed);
    if (!sku || !Number.isFinite(madura) || madura <= 0) { skipped++; continue; }

    const inicial = Math.max(1, Math.round(madura * INICIAL_RATIO));

    try {
      const existing = await prisma.product.findUnique({ where: { sku }, select: { id: true } });
      if (existing) {
        await prisma.product.update({
          where: { sku },
          data:  { velocidadMadura: madura, velocidadInicial: inicial },
        });
        updated++;
      } else {
        await prisma.product.create({
          data: { sku, nombre: sku, velocidadMadura: madura, velocidadInicial: inicial },
        });
        created++;
      }
    } catch (err) {
      if (errors.length < 10) errors.push(`${sku}: ${String(err)}`);
      skipped++;
    }
  }

  return json({
    success: true,
    received: items.length,
    stats: { updated, created, skipped },
    errors,
  });
}
