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
    console.log("[sync-api] Iniciando sincronización de catálogo con ProfitGuard…");
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

    // ── 4. Upsert en lotes paralelos ─────────────────────────────
    //
    // IMPORTANTE: el endpoint /api/v1/products solo devuelve nombre y SKU.
    // Los datos financieros (stock, margen, ACOS, ingresos) vienen del
    // Excel import y NO deben sobreescribirse con ceros.
    //
    // update → solo actualiza el nombre (preserva todos los demás campos)
    // create → crea el producto con defaults; los financieros se llenan
    //          después con la importación de Excel.
    //
    let updated = 0, created = 0;
    const errors: string[] = [];

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
      success:       true,
      source:        "ProfitGuard API",
      syncedAt:      new Date().toISOString(),
      elapsed:       `${elapsed}s`,
      note:          "Solo sincroniza nombre y SKU. Importa Excel para stock, margen y ACOS.",
      stats:         { total: pgProducts.length, updated, created, skipped },
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
