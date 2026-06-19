/**
 * POST|GET /api/sync-orders
 *
 * Sync financiero por SKU (últimas 6 semanas), replicando el margen de ProfitGuard.
 *
 * Fórmula de PG (verificada contra /dashboard/financial_summary):
 *   margen  = ingresos − COGS − comisión − envío_neto − publicidad
 *   margen% = margen / ingresos
 * (Se omite `storageCost`/bodegaje porque no se expone por SKU vía API pública; es ~0.35%
 *  del costo total — impacto despreciable.)
 *
 * Combina 3 fuentes en paralelo: órdenes (ingresos, comisión, envío), catálogo (COGS) y ads.
 * Montos en CLP = pesos enteros (NO se divide por 100).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchOrderAggregations } from "@/app/lib/profitguard-orders";
import { fetchCogsMap, PGAuthError } from "@/app/lib/profitguard-api";
import { fetchAdSpend } from "@/app/lib/profitguard-ads";

export const runtime     = "nodejs";
export const maxDuration = 300;

async function runOrdersSync() {
  const startTime = Date.now();
  try {
    if (!process.env.PROFITGUARD_API_KEY) {
      return NextResponse.json({ error: "PROFITGUARD_API_KEY no configurada." }, { status: 500 });
    }

    // 3 descargas en paralelo
    const [aggregations, cogsMap, adSpend] = await Promise.all([
      fetchOrderAggregations(6),
      fetchCogsMap(),
      fetchAdSpend(6),
    ]);

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

      const income     = agg.income;
      const cogs        = (cogsMap.get(sku) ?? 0) * agg.units;
      const publicidad  = Math.round(adSpend.get(sku) ?? 0);
      const margen      = income - cogs - agg.commission - agg.shippingNet - publicidad;
      const margenPct   = income > 0 ? Math.round((margen / income) * 1000) / 10 : 0; // 1 decimal
      const ventas      = income - agg.commission; // ingreso neto de comisión
      const acos        = income > 0 ? Math.round((publicidad / income) * 1000) / 1000 : 0; // = TACOS (provisional)

      productOps.push(() => prisma.product.update({
        where: { id },
        data: {
          ingresos:  Math.round(income),
          ventas:    Math.round(ventas),
          margenPct,
          publicidad,
          acos,
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
      stats: {
        skusWithSales: aggregations.size,
        cogsMapped:    cogsMap.size,
        skusWithSpend: adSpend.size,
        productsUpdated: productOps.length,
        weeklySalesUpserted: weeklyOps.length,
      },
    });
  } catch (err) {
    if (err instanceof PGAuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: `Error al sincronizar órdenes: ${String(err)}` }, { status: 500 });
  }
}

export async function POST() { return runOrdersSync(); }
export async function GET()  { return runOrdersSync(); }
