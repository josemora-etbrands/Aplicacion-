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
export const maxDuration = 300; // 300s — suficiente para 500+ SKUs en Vercel Pro

const UPSERT_BATCH = 20; // upserts paralelos por lote

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

    // ── 2. Descarga completa del catálogo (paginación infinita) ──
    console.log("[sync-api] Iniciando sincronización total con ProfitGuard…");
    const pgProducts = await fetchAllProducts();

    if (pgProducts.length === 0) {
      return NextResponse.json(
        { error: "ProfitGuard no devolvió productos. Verifica los permisos de tu API key." },
        { status: 422 },
      );
    }
    console.log(`[sync-api] Catálogo completo recibido: ${pgProducts.length} productos.`);

    // ── 3. Stock dedicado (si el endpoint existe) ────────────────
    const stockMap = await fetchProductStocks();

    // ── 4. Preparar payload de upsert para cada SKU válido ───────
    type UpsertItem = {
      sku:        string;
      sharedData: Record<string, unknown>;
    };

    const items: UpsertItem[] = [];
    let skipped = 0;

    for (const pg of pgProducts) {
      const rawSku = extractSku(pg);
      if (!rawSku) { skipped++; continue; }
      const sku = sanitizeSku(rawSku);
      if (!sku)    { skipped++; continue; }

      const stock      = stockMap?.[sku] ?? extractStock(pg);
      const publicidad = extractPublicidad(pg);
      const ingresos   = extractIngresos(pg);
      // ACOS = Publicidad / Ingresos (ratio; DiagnosticoTable lo muestra como %)
      // SIN_STOCK se aplica en diagnosticar() cuando stock <= 0
      const acos = ingresos > 0 ? publicidad / ingresos : 0;

      items.push({
        sku,
        sharedData: {
          nombre:    extractNombre(pg, sku),
          stock,
          margenPct: extractMargen(pg),
          publicidad,
          ventas:    extractVentas(pg),
          ingresos,
          acos,
        },
      });
    }

    // ── 5. Upsert en lotes paralelos (Promise.all por bloque) ────
    let updated = 0, created = 0;
    const errors: string[] = [];

    for (let i = 0; i < items.length; i += UPSERT_BATCH) {
      const batch = items.slice(i, i + UPSERT_BATCH);

      const results = await Promise.all(
        batch.map(async ({ sku, sharedData }) => {
          try {
            const r = await prisma.product.upsert({
              where:  { sku },
              update: sharedData,
              create: { sku, velocidadInicial: 1.2, velocidadMadura: 4.7, ...sharedData },
              select: { createdAt: true, updatedAt: true },
            });
            // createdAt ≈ updatedAt → registro nuevo
            return Math.abs(r.createdAt.getTime() - r.updatedAt.getTime()) < 1000
              ? "created" as const
              : "updated" as const;
          } catch (err) {
            return `error:SKU "${sku}": ${String(err)}`;
          }
        }),
      );

      for (const r of results) {
        if (r === "created") created++;
        else if (r === "updated") updated++;
        else { if (errors.length < 20) errors.push(r.replace("error:", "")); skipped++; }
      }

      const done = Math.min(i + UPSERT_BATCH, items.length);
      console.log(`[sync-api] Sincronizados ${done} de ${items.length} productos`);
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
    return NextResponse.json({ error: `Error al sincronizar: ${String(err)}` }, { status: 500 });
  }
}
