/**
 * POST|GET /api/sync-catalog
 *
 * Sync LIVIANO de catálogo: crea/actualiza productos (sku + nombre) desde ProfitGuard.
 * Parte de la división del sync pesado para no exceder el límite de Vercel.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchAllProducts, extractSku, extractNombre, PGAuthError } from "@/app/lib/profitguard-api";

export const runtime     = "nodejs";
export const maxDuration = 120;

function sanitizeSku(raw: string): string {
  return raw.trim().replace(/[\x00-\x1F\x7F]/g, "");
}

async function runCatalogSync() {
  const startTime = Date.now();
  try {
    if (!process.env.PROFITGUARD_API_KEY) {
      return NextResponse.json({ error: "PROFITGUARD_API_KEY no configurada." }, { status: 500 });
    }

    const pgProducts = await fetchAllProducts();
    if (pgProducts.length === 0) {
      return NextResponse.json({ error: "ProfitGuard no devolvió productos." }, { status: 422 });
    }

    const items: Array<{ sku: string; nombre: string }> = [];
    for (const pg of pgProducts) {
      const raw = extractSku(pg);
      if (!raw) continue;
      const sku = sanitizeSku(raw);
      if (!sku) continue;
      items.push({ sku, nombre: extractNombre(pg, sku) });
    }

    let updated = 0, created = 0, skipped = 0;
    const BATCH = 25;
    const ops = items.map(({ sku, nombre }) => async () => {
      try {
        const r = await prisma.product.upsert({
          where:  { sku },
          update: { nombre },
          create: { sku, nombre, velocidadInicial: 1.2, velocidadMadura: 4.7 },
          select: { createdAt: true, updatedAt: true },
        });
        return Math.abs(r.createdAt.getTime() - r.updatedAt.getTime()) < 1000 ? "c" : "u";
      } catch {
        return "e";
      }
    });
    for (let i = 0; i < ops.length; i += BATCH) {
      const r = await Promise.all(ops.slice(i, i + BATCH).map(fn => fn()));
      for (const x of r) x === "c" ? created++ : x === "u" ? updated++ : skipped++;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return NextResponse.json({ success: true, elapsed: `${elapsed}s`, stats: { total: pgProducts.length, updated, created, skipped } });
  } catch (err) {
    if (err instanceof PGAuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: `Error al sincronizar catálogo: ${String(err)}` }, { status: 500 });
  }
}

export async function POST() { return runCatalogSync(); }
export async function GET()  { return runCatalogSync(); }
