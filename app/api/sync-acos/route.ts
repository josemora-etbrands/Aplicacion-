/**
 * POST|GET /api/sync-acos
 *
 * ACoS REAL de Mercado Libre por SKU (gasto / ventas atribuidas a ads), vía passthrough.
 * Server-side con el Bearer (rápido), así que SÍ va en el cron diario.
 * Es el dueño del campo `acos` (sobreescribe cualquier TACOS provisional).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchRealAcos } from "@/app/lib/profitguard-acos";

export const runtime     = "nodejs";
export const maxDuration = 120;

async function runAcosSync() {
  const startTime = Date.now();
  try {
    if (!process.env.PROFITGUARD_API_KEY) {
      return NextResponse.json({ error: "PROFITGUARD_API_KEY no configurada." }, { status: 500 });
    }

    const acosMap = await fetchRealAcos(6);
    if (acosMap.size === 0) {
      return NextResponse.json({ success: true, note: "Sin ACoS para mapear.", updated: 0 });
    }

    const skus = [...acosMap.keys()];
    const dbProducts = await prisma.product.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true } });
    const skuToId = new Map(dbProducts.map(p => [p.sku, p.id]));

    let updated = 0;
    const BATCH = 25;
    const ops = [...acosMap.entries()].map(([sku, acos]) => async () => {
      const id = skuToId.get(sku);
      if (!id) return;
      await prisma.product.update({ where: { id }, data: { acos } });
      updated++;
    });
    for (let i = 0; i < ops.length; i += BATCH) await Promise.all(ops.slice(i, i + BATCH).map(fn => fn()));

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return NextResponse.json({ success: true, elapsed: `${elapsed}s`, stats: { skusWithAcos: acosMap.size, productsUpdated: updated } });
  } catch (err) {
    return NextResponse.json({ error: `Error al sincronizar ACoS: ${String(err)}` }, { status: 500 });
  }
}

export async function POST() { return runAcosSync(); }
export async function GET()  { return runAcosSync(); }
