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

export const runtime     = "nodejs";
export const maxDuration = 300;

const UPSERT_BATCH = 20;

/** Limpia el SKU: trim + elimina caracteres de control invisibles */
function sanitizeSku(raw: string): string {
  return raw.trim().replace(/[\x00-\x1F\x7F]/g, "");
}

export async function POST() {
  const startTime = Date.now();

  try {
    // ── 1. Verificar configuración ───────────────────────────────
    if (!process.env.PROFITGUARD_API_KEY) {
      return NextResponse.json(
        { error: "PROFITGUARD_API_KEY no configurada. Agrégala en Vercel → Settings → Environment Variables." },
        { status: 500 },
      );
    }

    // ── 2. Descarga completa del catálogo ────────────────────────
    console.log("[sync-api] Iniciando sincronización con ProfitGuard…");
    const pgProducts = await fetchAllProducts();

    if (pgProducts.length === 0) {
      return NextResponse.json(
        { error: "ProfitGuard no devolvió productos. Verifica los permisos de tu API key." },
        { status: 422 },
      );
    }
    console.log(`[sync-api] Catálogo recibido: ${pgProducts.length} productos.`);

    // ── 3. Preparar items válidos ────────────────────────────────
    const items: Array<{ sku: string; nombre: string }> = [];
    let skipped = 0;

    for (const pg of pgProducts) {
      const rawSku = extractSku(pg);
      if (!rawSku) { skipped++; continue; }
      const sku = sanitizeSku(rawSku);
      if (!sku)    { skipped++; continue; }

      items.push({ sku, nombre: extractNombre(pg, sku) });
    }

    // ── 4. Upsert catálogo en lotes paralelos ─────────────────────
    let updated = 0, created = 0;
    const catalogErrors: string[] = [];

    for (let i = 0; i < items.length; i += UPSERT_BATCH) {
      const batch = items.slice(i, i + UPSERT_BATCH);

      const results = await Promise.all(
        batch.map(async ({ sku, nombre }) => {
          try {
            const r = await prisma.product.upsert({
              where:  { sku },
              // Solo actualizamos el nombre — preservamos stock, margen, ACOS, etc.
              update: { nombre },
              // Si el producto no existía, lo creamos con todos los defaults
              create: {
                sku,
                nombre,
                velocidadInicial: 1.2,
                velocidadMadura:  4.7,
                stock:      0,
                margenPct:  0,
                publicidad: 0,
                ventas:     0,
                ingresos:   0,
                acos:       0,
              },
              select: { createdAt: true, updatedAt: true },
            });
            const isNew = Math.abs(r.createdAt.getTime() - r.updatedAt.getTime()) < 1000;
            return isNew ? "created" as const : "updated" as const;
          } catch (err) {
            return `error:SKU "${sku}": ${String(err)}`;
          }
        }),
      );

      for (const r of results) {
        if (r === "created") created++;
        else if (r === "updated") updated++;
        else { if (catalogErrors.length < 20) catalogErrors.push(r.replace("error:", "")); skipped++; }
      }

      const done = Math.min(i + UPSERT_BATCH, items.length);
      console.log(`[sync-api] Catálogo: ${done}/${items.length} productos`);
    }

    // ── 5. Descargar órdenes (últimas 8 semanas) ─────────────────
    console.log("[sync-api] Descargando historial de órdenes…");
    const aggregations = await fetchOrderAggregations(8);
    console.log(`[sync-api] Órdenes agregadas: ${aggregations.size} SKUs con ventas.`);

    // ── 6. Actualizar métricas financieras + historial semanal ───
    let ordersUpdated = 0;
    let weeklySalesUpserted = 0;
    const orderErrors: string[] = [];

    // Obtener todos los productos de la DB para mapear SKU → id
    const dbProducts = await prisma.product.findMany({
      select: { id: true, sku: true },
    });
    const skuToId = new Map(dbProducts.map(p => [p.sku, p.id]));

    for (const [sku, agg] of aggregations) {
      const productId = skuToId.get(sku);
      if (!productId) {
        // SKU de órdenes que no existe en el catálogo — ignorar
        continue;
      }

      try {
        // Actualizar métricas financieras del producto
        await prisma.product.update({
          where: { id: productId },
          data: {
            ingresos:  Math.round(agg.totalRevenue),
            ventas:    Math.round(agg.totalNetRevenue),
            margenPct: Math.round(agg.margenPct * 10) / 10,
          },
        });
        ordersUpdated++;

        // Upsert ventas semanales (quantity = unidades vendidas esa semana)
        const weekOps = agg.weeks.map(w =>
          prisma.weeklySales.upsert({
            where: {
              productId_year_week: { productId, year: w.year, week: w.week },
            },
            update: { value: w.quantity },
            create: { productId, year: w.year, week: w.week, value: w.quantity },
          }),
        );

        // Ejecutar en lotes de 20 para no sobrecargar
        for (let i = 0; i < weekOps.length; i += 20) {
          await Promise.all(weekOps.slice(i, i + 20));
          weeklySalesUpserted += Math.min(20, weekOps.length - i);
        }
      } catch (err) {
        if (orderErrors.length < 20) orderErrors.push(`SKU "${sku}": ${String(err)}`);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[sync-api] ✓ Completo en ${elapsed}s — ` +
      `catálogo: ${updated} actualizados, ${created} creados, ${skipped} omitidos | ` +
      `órdenes: ${ordersUpdated} SKUs actualizados, ${weeklySalesUpserted} semanas`,
    );

    return NextResponse.json({
      success:    true,
      source:     "ProfitGuard API",
      syncedAt:   new Date().toISOString(),
      elapsed:    `${elapsed}s`,
      note:       "Sincroniza nombre/SKU del catálogo + ingresos, ventas, margen y historial semanal de órdenes. Stock y ACOS aún requieren importación Excel.",
      stats: {
        catalog: {
          total:   pgProducts.length,
          updated,
          created,
          skipped,
        },
        orders: {
          skusWithSales:       aggregations.size,
          productsUpdated:     ordersUpdated,
          weeklySalesUpserted,
        },
      },
      processedSkus: updated + created,
      errors: [...catalogErrors, ...orderErrors],
    });

  } catch (err) {
    console.error("[sync-api] Error:", err);
    if (err instanceof PGAuthError)      return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof PGRateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
    if (err instanceof PGDownError)      return NextResponse.json({ error: err.message }, { status: 503 });
    return NextResponse.json({ error: `Error al sincronizar: ${String(err)}` }, { status: 500 });
  }
}
