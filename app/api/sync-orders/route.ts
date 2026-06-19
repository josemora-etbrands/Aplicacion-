/**
 * POST|GET /api/sync-orders
 *
 * Sync LIVIANO de órdenes: ingresos, ventas (neto), margen y historial semanal por SKU,
 * desde /api/v1/orders (últimas 6 semanas). Parte de la división del sync pesado.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchOrderAggregations } from "@/app/lib/profitguard-orders";
import { PGAuthError } from "@/app/lib/profitguard-api";

export const runtime     = "nodejs";
export const maxDuration = 300;

async function runOrdersSync() {
  const startTime = Date.now();
  try {
    if (!process.env.PROFITGUARD_API_KEY) {
      return NextResponse.json({ error: "PROFITGUARD_API_KEY no configurada." }, { status: 500 });
    }

    const aggregations = await fetchOrderAggregations(6);
    if (aggregations.size === 0) {
      return NextResponse.json({ success: true, note: "Sin órdenes en el período.", skusWithSales: 0 });
    }

    const skus = [...aggregations.keys()];
    const dbProducts = await prisma.product.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true } });
    const skuToId = new Map(dbProducts.map(p => [p.sku, p.id]));

    const productOps: (() => Promise<unknown>)[] = [];
    const weeklyOps:  (() => Promise<unknown>)[] = [];

    for (const [sku, agg] of aggregations) {
      const id = skuToId.get(sku);
      if (!id) continue;
      productOps.push(() => prisma.product.update({
        where: { id },
        data: {
          ingresos:  Math.round(agg.totalRevenue),
          ventas:    Math.round(agg.totalNetRevenue),
          margenPct: Math.round(agg.margenPct * 10) / 10,
        },
      }));
      for (const w of agg.weeks) {
        weeklyOps.push(() => prisma.weeklySales.upsert({
          where:  { productId_year_week: { productId: id, year: w.year, week: w.week } },
          update: { value: w.quantity },
          create: { productId: id, year: w.year, week: w.week, value: w.quantity },
        }));
      }
    }

    const BATCH = 25;
    const run = async (ops: (() => Promise<unknown>)[]) => {
      for (let i = 0; i < ops.length; i += BATCH) await Promise.all(ops.slice(i, i + BATCH).map(fn => fn()));
    };
    await run(productOps);
    await run(weeklyOps);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return NextResponse.json({
      success: true, elapsed: `${elapsed}s`,
      stats: { skusWithSales: aggregations.size, productsUpdated: productOps.length, weeklySalesUpserted: weeklyOps.length },
    });
  } catch (err) {
    if (err instanceof PGAuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: `Error al sincronizar órdenes: ${String(err)}` }, { status: 500 });
  }
}

export async function POST() { return runOrdersSync(); }
export async function GET()  { return runOrdersSync(); }
