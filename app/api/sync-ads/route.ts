/**
 * POST|GET /api/sync-ads
 *
 * Sync LIVIANO de publicidad: gasto en ads por SKU desde /api/v1/product_ads y
 * recalcula ACOS = publicidad / ingresos (usa los ingresos ya cargados por sync-orders).
 * Correr DESPUÉS de sync-orders para que el ACOS sea correcto.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchAdSpend } from "@/app/lib/profitguard-ads";
import { PGAuthError } from "@/app/lib/profitguard-api";

export const runtime     = "nodejs";
export const maxDuration = 300;

async function runAdsSync() {
  const startTime = Date.now();
  try {
    if (!process.env.PROFITGUARD_API_KEY) {
      return NextResponse.json({ error: "PROFITGUARD_API_KEY no configurada." }, { status: 500 });
    }

    const adSpend = await fetchAdSpend(6);
    if (adSpend.size === 0) {
      return NextResponse.json({ success: true, note: "Sin gasto publicitario en el período.", skusWithSpend: 0 });
    }

    const skus = [...adSpend.keys()];
    const dbProducts = await prisma.product.findMany({
      where: { sku: { in: skus } },
      select: { id: true, sku: true, ingresos: true },
    });

    let updated = 0;
    const BATCH = 25;
    const ops = dbProducts.map(p => async () => {
      const publicidad = Math.round(adSpend.get(p.sku) ?? 0);
      const acos = p.ingresos > 0 ? Math.round((publicidad / p.ingresos) * 1000) / 1000 : 0;
      await prisma.product.update({ where: { id: p.id }, data: { publicidad, acos } });
      updated++;
    });
    for (let i = 0; i < ops.length; i += BATCH) await Promise.all(ops.slice(i, i + BATCH).map(fn => fn()));

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return NextResponse.json({ success: true, elapsed: `${elapsed}s`, stats: { skusWithSpend: adSpend.size, productsUpdated: updated } });
  } catch (err) {
    if (err instanceof PGAuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: `Error al sincronizar ads: ${String(err)}` }, { status: 500 });
  }
}

export async function POST() { return runAdsSync(); }
export async function GET()  { return runAdsSync(); }
