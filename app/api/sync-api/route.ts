import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  fetchAllProducts,
  extractSku,
  extractNombre,
  PGAuthError,
  PGRateLimitError,
  PGDownError,
} from "@/app/lib/profitguard-api";
import { fetchOrderAggregations } from "@/app/lib/profitguard-orders";
import { fetchProductStocks }     from "@/app/lib/profitguard-api";
import { fetchAdSpend }           from "@/app/lib/profitguard-ads";

export const runtime     = "nodejs";
export const maxDuration = 300;

const UPSERT_BATCH = 50;

function sanitizeSku(raw: string): string {
  return raw.trim().replace(/[\x00-\x1F\x7F]/g, "");
}

async function runInBatches<T>(ops: (() => Promise<T>)[], size: number): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < ops.length; i += size) {
    const batch = await Promise.all(ops.slice(i, i + size).map(fn => fn()));
    results.push(...batch);
  }
  return results;
}

async function runSync() {
  const startTime = Date.now();

  try {
    if (!process.env.PROFITGUARD_API_KEY) {
      return NextResponse.json(
        { error: "PROFITGUARD_API_KEY no configurada. Agrégala en Vercel → Settings → Environment Variables." },
        { status: 500 },
      );
    }

    // ── 1a. Catálogo + stock en paralelo (fase rápida) ───────────
    console.log("[sync-api] Fase 1: catálogo + stock…");
    const [pgProducts, stockMap] = await Promise.all([
      fetchAllProducts(),
      fetchProductStocks(),
    ]);

    // ── 1b. Órdenes en serie (fase lenta, respeta rate limit) ────
    console.log("[sync-api] Fase 2: historial de órdenes…");
    const aggregations = await fetchOrderAggregations(6);

    // ── 1c. Gasto publicitario (para publicidad + ACOS) ──────────
    console.log("[sync-api] Fase 3: gasto publicitario…");
    const adSpend = await fetchAdSpend(6);

    if (pgProducts.length === 0) {
      return NextResponse.json(
        { error: "ProfitGuard no devolvió productos. Verifica los permisos de tu API key." },
        { status: 422 },
      );
    }
    console.log(
      `[sync-api] Catálogo: ${pgProducts.length} productos | ` +
      `Stock: ${stockMap.size} SKUs | ` +
      `Órdenes: ${aggregations.size} SKUs con ventas`,
    );

    // ── 2. Preparar items del catálogo ────────────────────────────
    const items: Array<{ sku: string; nombre: string }> = [];
    let skipped = 0;

    for (const pg of pgProducts) {
      const rawSku = extractSku(pg);
      if (!rawSku) { skipped++; continue; }
      const sku = sanitizeSku(rawSku);
      if (!sku)    { skipped++; continue; }
      items.push({ sku, nombre: extractNombre(pg, sku) });
    }

    // ── 3. Upsert catálogo ────────────────────────────────────────
    let updated = 0, created = 0;
    const catalogErrors: string[] = [];

    const catalogOps = items.map(({ sku, nombre }) => async () => {
      try {
        const r = await prisma.product.upsert({
          where:  { sku },
          update: { nombre },
          create: {
            sku, nombre,
            velocidadInicial: 1.2, velocidadMadura: 4.7,
            stock: 0, margenPct: 0, publicidad: 0,
            ventas: 0, ingresos: 0, acos: 0,
          },
          select: { createdAt: true, updatedAt: true },
        });
        const isNew = Math.abs(r.createdAt.getTime() - r.updatedAt.getTime()) < 1000;
        return isNew ? "created" as const : "updated" as const;
      } catch (err) {
        return `error:${String(err)}`;
      }
    });

    const catalogResults = await runInBatches(catalogOps, UPSERT_BATCH);
    for (const r of catalogResults) {
      if (r === "created") created++;
      else if (r === "updated") updated++;
      else { if (catalogErrors.length < 20) catalogErrors.push(r.replace("error:", "")); skipped++; }
    }
    console.log(`[sync-api] Catálogo: ${updated} actualizados, ${created} creados, ${skipped} omitidos`);

    // ── 4. Cargar IDs de todos los productos ──────────────────────
    const allSkus = [
      ...new Set([
        ...Array.from(aggregations.keys()),
        ...Array.from(stockMap.keys()),
        ...Array.from(adSpend.keys()),
      ]),
    ];
    const dbProducts = await prisma.product.findMany({
      where:  { sku: { in: allSkus } },
      select: { id: true, sku: true },
    });
    const skuToId = new Map(dbProducts.map(p => [p.sku, p.id]));

    // ── 5. Preparar operaciones de órdenes ────────────────────────
    const productUpdateOps: (() => Promise<unknown>)[] = [];
    const weeklyOps: (() => Promise<unknown>)[]        = [];

    // Unión de SKUs con ventas y/o gasto publicitario
    const financeSkus = new Set<string>([
      ...aggregations.keys(),
      ...adSpend.keys(),
    ]);

    for (const sku of financeSkus) {
      const productId = skuToId.get(sku);
      if (!productId) continue;

      const agg         = aggregations.get(sku);
      const publicidad  = Math.round(adSpend.get(sku) ?? 0);
      const ingresos    = agg ? Math.round(agg.totalRevenue) : 0;
      // ACOS = gasto publicitario / ingresos (solo si hay ingresos)
      const acos        = ingresos > 0 ? publicidad / ingresos : 0;

      productUpdateOps.push(() =>
        prisma.product.update({
          where: { id: productId },
          data: {
            ...(agg ? {
              ingresos,
              ventas:    Math.round(agg.totalNetRevenue),
              margenPct: Math.round(agg.margenPct * 10) / 10,
            } : {}),
            publicidad,
            acos: Math.round(acos * 1000) / 1000,
          },
        }),
      );

      if (!agg) continue;
      for (const w of agg.weeks) {
        weeklyOps.push(() =>
          prisma.weeklySales.upsert({
            where:  { productId_year_week: { productId, year: w.year, week: w.week } },
            update: { value: w.quantity },
            create: { productId, year: w.year, week: w.week, value: w.quantity },
          }),
        );
      }
    }

    // ── 6. Preparar operaciones de stock ML ───────────────────────
    const stockOps: (() => Promise<unknown>)[] = [];
    let stockUpdated = 0;

    for (const [sku, stock] of stockMap) {
      const productId = skuToId.get(sku);
      if (!productId) continue;
      stockOps.push(() =>
        prisma.product.update({
          where: { id: productId },
          data:  { stock },
        }),
      );
      stockUpdated++;
    }

    // ── 7. Ejecutar todo en paralelo ──────────────────────────────
    const [, weekResults] = await Promise.all([
      runInBatches(productUpdateOps, UPSERT_BATCH),
      runInBatches(weeklyOps,        UPSERT_BATCH),
      runInBatches(stockOps,         UPSERT_BATCH),
    ]);

    const ordersUpdated       = productUpdateOps.length;
    const weeklySalesUpserted = weekResults.length;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[sync-api] ✓ Completo en ${elapsed}s — ` +
      `catálogo: ${updated}u/${created}c | ` +
      `órdenes: ${ordersUpdated} SKUs, ${weeklySalesUpserted} semanas | ` +
      `stock: ${stockUpdated} SKUs | ` +
      `ads: ${adSpend.size} SKUs`,
    );

    return NextResponse.json({
      success:  true,
      source:   "ProfitGuard API",
      syncedAt: new Date().toISOString(),
      elapsed:  `${elapsed}s`,
      note:     "Sincroniza catálogo, ingresos, ventas, margen, historial semanal, stock, publicidad y ACOS desde ProfitGuard API. Las metas de velocidad y categoría ABC se cargan vía el sync de navegador.",
      stats: {
        catalog: { total: pgProducts.length, updated, created, skipped },
        orders:  { skusWithSales: aggregations.size, productsUpdated: ordersUpdated, weeklySalesUpserted },
        stock:   { skusWithStock: stockMap.size, productsUpdated: stockUpdated },
        ads:     { skusWithSpend: adSpend.size },
      },
      processedSkus: updated + created,
      errors: catalogErrors,
    });

  } catch (err) {
    console.error("[sync-api] Error:", err);
    if (err instanceof PGAuthError)      return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof PGRateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
    if (err instanceof PGDownError)      return NextResponse.json({ error: err.message }, { status: 503 });
    return NextResponse.json({ error: `Error al sincronizar: ${String(err)}` }, { status: 500 });
  }
}

/** Trigger manual (no usado por la UI, útil para pruebas/integraciones). */
export async function POST() {
  return runSync();
}

/**
 * Trigger automático del cron de Vercel.
 * Vercel envía `Authorization: Bearer <CRON_SECRET>` cuando CRON_SECRET está configurada.
 * Si CRON_SECRET no está seteada, se permite (útil en preview), pero se recomienda setearla.
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }
  }
  return runSync();
}
