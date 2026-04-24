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

export const runtime    = "nodejs";
export const maxDuration = 60; // seg (Vercel hobby: 60s, pro: 300s)

export async function POST() {
  try {
    // ── 1. Verificar configuración ───────────────────────────────
    if (!process.env.PROFITGUARD_API_KEY) {
      return NextResponse.json(
        { error: "PROFITGUARD_API_KEY no configurada. Agrégala a .env.local y reinicia el servidor de desarrollo." },
        { status: 500 },
      );
    }

    // ── 2. Traer todos los productos de ProfitGuard ──────────────
    const pgProducts = await fetchAllProducts();
    if (pgProducts.length === 0) {
      return NextResponse.json(
        { error: "ProfitGuard no devolvió productos. Verifica que tu API key tenga los permisos correctos." },
        { status: 422 },
      );
    }

    // ── 3. Stock dedicado (endpoint /product-stocks si existe) ───
    const stockMap = await fetchProductStocks();

    // ── 4. Upsert producto a producto ────────────────────────────
    let updated = 0, created = 0, skipped = 0;
    const errors: string[]       = [];
    const processedSkus: string[] = [];

    for (const pg of pgProducts) {
      const sku = extractSku(pg);
      if (!sku) { skipped++; continue; }
      processedSkus.push(sku);

      // Stock: usa endpoint dedicado si existe, si no extrae del producto
      const stock = stockMap?.[sku] ?? extractStock(pg);

      // Métricas financieras
      const publicidad = extractPublicidad(pg);
      const ingresos   = extractIngresos(pg);

      /**
       * ACOS = Publicidad / Ingresos  (ratio, p.ej. 0.12 = 12%)
       * Se guarda como ratio en DB; DiagnosticoTable lo muestra como %
       * SIN_STOCK: no se toca aquí — diagnosticar() lo aplica en runtime
       * si stock <= 0, el semáforo pasa a gris automáticamente.
       */
      const acos = ingresos > 0 ? publicidad / ingresos : 0;

      const data = {
        nombre:    extractNombre(pg, sku),
        stock,
        margenPct: extractMargen(pg),
        publicidad,
        ventas:    extractVentas(pg),
        ingresos,
        acos,
      };

      try {
        const existing = await prisma.product.findUnique({ where: { sku } });
        if (existing) {
          await prisma.product.update({ where: { sku }, data });
          updated++;
        } else {
          await prisma.product.create({
            data: { sku, velocidadInicial: 1.2, velocidadMadura: 4.7, ...data },
          });
          created++;
        }
      } catch (err) {
        if (errors.length < 10) errors.push(`SKU ${sku}: ${String(err)}`);
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      source:  "ProfitGuard API",
      syncedAt: new Date().toISOString(),
      stats: { total: pgProducts.length, updated, created, skipped },
      processedSkus: processedSkus.length,
      errors,
    });

  } catch (err) {
    console.error("[POST /api/sync-api]", err);

    // Errores tipados → mensajes claros para el usuario
    if (err instanceof PGAuthError)      return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof PGRateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
    if (err instanceof PGDownError)      return NextResponse.json({ error: err.message }, { status: 503 });

    return NextResponse.json(
      { error: `Error al sincronizar: ${String(err)}` },
      { status: 500 },
    );
  }
}
