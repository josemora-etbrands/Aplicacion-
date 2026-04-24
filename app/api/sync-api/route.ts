import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  fetchAllProducts,
  fetchProductStocks,
  extractSku,
  extractNombre,
  extractStock,
  extractMargen,
  extractPublicidad,
  extractVentas,
  extractIngresos,
  PGAuthError,
  PGRateLimitError,
  PGDownError,
} from "@/app/lib/profitguard-api";

export const runtime     = "nodejs";
export const maxDuration = 300; // seg — sube a 300 para catálogos grandes (Vercel Pro)

/** Limpia el SKU: trim + elimina caracteres de control */
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

    // ── 2. Traer TODOS los productos (paginación completa) ───────
    console.log("[sync-api] Iniciando sincronización total con ProfitGuard…");
    const pgProducts = await fetchAllProducts();

    if (pgProducts.length === 0) {
      return NextResponse.json(
        { error: "ProfitGuard no devolvió productos. Verifica que tu API key tenga los permisos correctos." },
        { status: 422 },
      );
    }

    console.log(`[sync-api] Productos recibidos de ProfitGuard: ${pgProducts.length}`);

    // ── 3. Stock dedicado (si el endpoint existe) ────────────────
    const stockMap = await fetchProductStocks();

    // ── 4. Upsert con Prisma (1 query por SKU) ───────────────────
    let updated = 0, created = 0, skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < pgProducts.length; i++) {
      const pg  = pgProducts[i];
      const rawSku = extractSku(pg);
      if (!rawSku) { skipped++; continue; }

      const sku = sanitizeSku(rawSku);
      if (!sku)    { skipped++; continue; }

      // Métricas financieras
      const stock      = stockMap?.[sku] ?? extractStock(pg);
      const publicidad = extractPublicidad(pg);
      const ingresos   = extractIngresos(pg);
      // ACOS = Publicidad / Ingresos (ratio, p.ej. 0.12 = 12 %)
      // SIN_STOCK: diagnosticar() lo aplica en runtime si stock <= 0
      const acos = ingresos > 0 ? publicidad / ingresos : 0;

      const sharedData = {
        nombre:    extractNombre(pg, sku),
        stock,
        margenPct: extractMargen(pg),
        publicidad,
        ventas:    extractVentas(pg),
        ingresos,
        acos,
      };

      try {
        const result = await prisma.product.upsert({
          where:  { sku },
          update: sharedData,
          create: { sku, velocidadInicial: 1.2, velocidadMadura: 4.7, ...sharedData },
          select: { id: true, createdAt: true, updatedAt: true },
        });

        // Si createdAt ≈ updatedAt el registro es nuevo
        const isNew = Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) < 1000;
        if (isNew) created++; else updated++;

      } catch (err) {
        if (errors.length < 20) errors.push(`SKU "${sku}": ${String(err)}`);
        skipped++;
      }

      // Log de progreso cada 25 productos
      if ((i + 1) % 25 === 0 || i + 1 === pgProducts.length) {
        console.log(`[sync-api] Sincronizados ${i + 1} de ${pgProducts.length} productos`);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[sync-api] ✓ Completo en ${elapsed}s — ` +
      `actualizados: ${updated}, creados: ${created}, omitidos: ${skipped}`,
    );

    return NextResponse.json({
      success:  true,
      source:   "ProfitGuard API",
      syncedAt: new Date().toISOString(),
      elapsed:  `${elapsed}s`,
      stats:    { total: pgProducts.length, updated, created, skipped },
      processedSkus: updated + created,
      errors,
    });

  } catch (err) {
    console.error("[sync-api] Error:", err);

    if (err instanceof PGAuthError)      return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof PGRateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
    if (err instanceof PGDownError)      return NextResponse.json({ error: err.message }, { status: 503 });

    return NextResponse.json(
      { error: `Error al sincronizar: ${String(err)}` },
      { status: 500 },
    );
  }
}
