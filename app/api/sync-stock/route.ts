/**
 * POST|GET /api/sync-stock
 *
 * Sync LIVIANO de solo stock (rápido, < límite de Vercel).
 * Separado de /api/sync-api porque el sync completo (catálogo + órdenes + ads + stock)
 * excede los 300s y Vercel lo mata antes de escribir el stock.
 *
 * Lee stock por bodega desde /api/v1/product_stocks y actualiza Product.stock por SKU.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchProductStocks, PGAuthError } from "@/app/lib/profitguard-api";

export const runtime     = "nodejs";
export const maxDuration = 120;

async function runStockSync() {
  const startTime = Date.now();
  try {
    if (!process.env.PROFITGUARD_API_KEY) {
      return NextResponse.json({ error: "PROFITGUARD_API_KEY no configurada." }, { status: 500 });
    }

    const stockMap = await fetchProductStocks();
    if (stockMap.size === 0) {
      return NextResponse.json({ success: true, note: "Sin stock para mapear.", updated: 0 });
    }

    const skus = [...stockMap.keys()];
    const dbProducts = await prisma.product.findMany({
      where:  { sku: { in: skus } },
      select: { id: true, sku: true },
    });
    const skuToId = new Map(dbProducts.map(p => [p.sku, p.id]));

    const ops = [...stockMap.entries()].map(([sku, stock]) => async () => {
      const id = skuToId.get(sku);
      if (!id) return false;
      await prisma.product.update({ where: { id }, data: { stock } });
      return true;
    });

    let updated = 0;
    const BATCH = 25;
    for (let i = 0; i < ops.length; i += BATCH) {
      const r = await Promise.all(ops.slice(i, i + BATCH).map(fn => fn()));
      updated += r.filter(Boolean).length;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const withStock = [...stockMap.values()].filter(v => v > 0).length;
    return NextResponse.json({
      success: true,
      elapsed: `${elapsed}s`,
      stats: { skusConStock: stockMap.size, conStockPositivo: withStock, productosActualizados: updated },
    });
  } catch (err) {
    if (err instanceof PGAuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: `Error al sincronizar stock: ${String(err)}` }, { status: 500 });
  }
}

export async function POST() { return runStockSync(); }
export async function GET()  { return runStockSync(); }
