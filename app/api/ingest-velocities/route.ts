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
 *   - velocidadMadura  = weeklySalesSpeed                (objetivo, "la velocidad" de PG)
 *   - velocidadInicial = round(weeklySalesSpeed * 0.275) (piso: 27.5%, def. con negocio)
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

const INICIAL_RATIO = 0.25; // 1/4 de la meta madura (definido con negocio)

interface VelocityWeek { number: number; year: number; units: number }
interface VelocityItem {
  sku:                 string;
  weeklySalesSpeed:    number;
  category?:           string;
  averageWeeklySales?: number;
  totalStock?:         number;
  associationsCount?:  number;
  weeks?:              VelocityWeek[];
  // Detalle estilo PG (KPIs + serie semanal de desempeño) para el modal de detalle.
  detalle?:            unknown;
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

  // ── Upsert metas de velocidad (en paralelo por lotes) ─────────
  let processed = 0, skipped = 0;
  const errors: string[] = [];
  const BATCH = 25;

  const ops = items.map((it) => async () => {
    const sku = it.sku?.toString().trim();
    if (!sku) { skipped++; return; }
    const madura = Number(it.weeklySalesSpeed) || 0;
    const inicial = madura > 0 ? Math.max(1, Math.round(madura * INICIAL_RATIO)) : 0;
    const categoria = it.category?.toString().trim().toUpperCase() || null;
    const promedio  = Number.isFinite(Number(it.averageWeeklySales)) ? Number(it.averageWeeklySales) : null;
    // Bloque espejo del panel "Velocidad de Ventas" de PG (para la página /velocidad)
    const velocidadData = {
      categoria, velocidad: madura, promedio,
      stockTotal: it.totalStock ?? null,
      asociaciones: it.associationsCount ?? null,
      weeks: (it.weeks ?? []).map(w => ({ number: w.number, year: w.year, units: w.units })),
      detalle: it.detalle ?? null,
    };
    // Las metas (madura/inicial) del semáforo solo se actualizan si hay velocidad real (>0);
    // el bloque velocidadData se guarda SIEMPRE para que la página /velocidad muestre todos.
    const metaFields = madura > 0 ? { velocidadMadura: madura, velocidadInicial: inicial } : {};
    try {
      await prisma.product.upsert({
        where:  { sku },
        update: { ...metaFields, categoria, velocidadPromedio: promedio, velocidadData },
        create: { sku, nombre: sku, velocidadMadura: madura, velocidadInicial: inicial, categoria, velocidadPromedio: promedio, velocidadData },
      });
      processed++;
    } catch (err) {
      if (errors.length < 10) errors.push(`${sku}: ${String(err)}`);
      skipped++;
    }
  });

  for (let i = 0; i < ops.length; i += BATCH) {
    await Promise.all(ops.slice(i, i + BATCH).map(fn => fn()));
  }

  return json({
    success: true,
    received: items.length,
    stats: { processed, skipped },
    errors,
  });
}
