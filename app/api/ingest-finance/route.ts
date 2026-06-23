/**
 * POST /api/ingest-finance
 *
 * Recibe el financiero por SKU AGREGADO EN EL NAVEGADOR desde el endpoint interno de PG
 * (/api/internal/orders), que da financiero por orden ya calculado: `realIncome`
 * (= ingreso − comisión − envío neto). Se agrega en el browser porque son ~36k órdenes
 * que no caben en los límites de Vercel ni en el rate limit de la API pública.
 *
 * El servidor completa con COGS (catálogo) y publicidad (product_ads), y calcula el margen
 * con la MISMA fórmula de ProfitGuard:
 *   margen  = realIncome + extraTarjeta − COGS − publicidad   (bodegaje omitido, ~0.35%)
 *   margen% = margen / ingresos
 *
 * Body: { items: [{ sku, income, realIncome, ccExtra, units, weeks:[{year,week,units}] }] }
 * Seguridad: header x-ingest-secret == INGEST_SECRET. CORS abierto (protege el secreto).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchCogsMap } from "@/app/lib/profitguard-api";
import { fetchAdSpend } from "@/app/lib/profitguard-ads";

export const runtime     = "nodejs";
export const maxDuration = 300;

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

interface FinItem {
  sku:        string;
  income:     number;  // suma de productIncome por SKU (bruto)
  realIncome: number;  // ingreso − comisión − envío (de PG, por orden, prorrateado)
  ccExtra:    number;  // extra por tarjeta
  units:      number;
  weeks?:     Array<{ year: number; week: number; units: number }>;
}

export async function POST(req: NextRequest) {
  const secret = process.env.INGEST_SECRET;
  if (!secret) return json({ error: "INGEST_SECRET no configurada." }, 500);
  if (req.headers.get("x-ingest-secret") !== secret) return json({ error: "No autorizado." }, 401);

  let items: FinItem[];
  try {
    const body = (await req.json()) as { items?: FinItem[] };
    items = Array.isArray(body.items) ? body.items : [];
  } catch {
    return json({ error: "JSON inválido." }, 400);
  }
  if (items.length === 0) return json({ error: "No se recibieron items." }, 400);

  // Completar con COGS y publicidad desde la API (público, server-side)
  const [cogsMap, adSpend] = await Promise.all([fetchCogsMap(), fetchAdSpend(6)]);

  const skus = items.map(i => i.sku);
  const dbProducts = await prisma.product.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true } });
  const skuToId = new Map(dbProducts.map(p => [p.sku, p.id]));

  let updated = 0, skipped = 0;
  const productOps: (() => Promise<unknown>)[] = [];
  const weeklyOps:  (() => Promise<unknown>)[] = [];

  for (const it of items) {
    const id = skuToId.get(it.sku?.trim());
    if (!id) { skipped++; continue; }

    const totalIncome = Math.round(it.income + (it.ccExtra ?? 0));
    const publicidad  = Math.round(adSpend.get(it.sku) ?? 0);
    const cogs        = (cogsMap.get(it.sku) ?? 0) * (it.units ?? 0);
    const margen      = (it.realIncome ?? 0) + (it.ccExtra ?? 0) - cogs - publicidad;
    const margenPct   = totalIncome > 0 ? Math.round((margen / totalIncome) * 1000) / 10 : 0;

    // NOTA: `acos` NO se setea aquí — es propiedad de /api/sync-acos (ACoS real de ML).
    productOps.push(() => prisma.product.update({
      where: { id },
      data:  { ingresos: totalIncome, ventas: Math.round(it.realIncome ?? 0), margenPct, publicidad },
    }));
    updated++;

    for (const w of it.weeks ?? []) {
      weeklyOps.push(() => prisma.weeklySales.upsert({
        where:  { productId_year_week: { productId: id, year: w.year, week: w.week } },
        update: { value: w.units },
        create: { productId: id, year: w.year, week: w.week, value: w.units },
      }));
    }
  }

  const BATCH = 25;
  const run = async (ops: (() => Promise<unknown>)[]) => {
    for (let i = 0; i < ops.length; i += BATCH) await Promise.all(ops.slice(i, i + BATCH).map(fn => fn()));
  };
  await run(productOps);
  await run(weeklyOps);

  return json({ success: true, received: items.length, stats: { updated, skipped, cogsMapped: cogsMap.size, skusWithSpend: adSpend.size } });
}
