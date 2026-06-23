/**
 * ACoS REAL de Mercado Libre (vía ProfitGuard passthrough).
 *
 * ACoS = gasto en ads / ventas atribuidas a ads (directas + indirectas).
 * Distinto de TACOS (gasto / ventas totales). Fuente: ML Product Ads.
 *
 * Flujo:
 *   1. GET /advertising/advertisers/{adv}/product_ads/items?metrics=cost,total_amount
 *      → por ítem MLC: cost (gasto) y total_amount (ventas atribuidas).
 *   2. Mapear item_id (MLC) → SKU vía /items?ids=...&attributes=id,seller_custom_field
 *      (solo los ítems con actividad publicitaria, para ahorrar llamadas).
 *   3. Agregar por SKU: acos = Σcost / Σtotal_amount.
 */

const BASE_URL     = (process.env.PROFITGUARD_API_URL ?? "https://app.profitguard.cl").replace(/\/$/, "");
const API_KEY      = process.env.PROFITGUARD_API_KEY ?? "";
const ADVERTISER   = process.env.ML_ADVERTISER_ID ?? "78477";
const ML_INT_ID    = 1;
const PAGE_LIMIT   = 50;   // ítems por página de product_ads
const IDS_PER_CALL = 20;   // ML acepta multi-get de 20 ids

async function pt(path: string): Promise<Record<string, unknown> | unknown[]> {
  const res = await fetch(`${BASE_URL}/api/v1/integrations/${ML_INT_ID}/passthrough`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, Accept: "application/json", "Content-Type": "application/json" },
    cache:   "no-store",
    body:    JSON.stringify({ method: "GET", path }),
  });
  if (!res.ok) throw new Error(`passthrough ${res.status} en ${path}`);
  const json = await res.json() as Record<string, unknown>;
  return (json.body as Record<string, unknown> | unknown[]) ?? json;
}

function weeksAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  return d.toISOString().slice(0, 10);
}

interface AdItem { item_id: string; metrics?: { cost?: number; total_amount?: number }; }

/** Devuelve Map<sku, acos> donde acos es ratio (gasto/ventas atribuidas), ej 0.128 = 12.8%. */
export async function fetchRealAcos(weeks = 6): Promise<Map<string, number>> {
  const from = weeksAgo(weeks);
  const to   = new Date().toISOString().slice(0, 10);

  // ── 1. Recolectar ítems con actividad (cost>0 o ventas>0) ──────
  const active: Array<{ item_id: string; cost: number; sales: number }> = [];
  let offset = 0, total = 0;
  do {
    const path = `/advertising/advertisers/${ADVERTISER}/product_ads/items` +
      `?limit=${PAGE_LIMIT}&offset=${offset}&date_from=${from}&date_to=${to}&metrics=cost,total_amount`;
    const data = await pt(path) as { paging?: { total?: number }; results?: AdItem[] };
    total = data.paging?.total ?? 0;
    for (const it of data.results ?? []) {
      const cost  = it.metrics?.cost ?? 0;
      const sales = it.metrics?.total_amount ?? 0;
      if (cost > 0 || sales > 0) active.push({ item_id: it.item_id, cost, sales });
    }
    offset += PAGE_LIMIT;
  } while (offset < total);

  console.log(`[ML ACoS] ${active.length} ítems con actividad de ${total} totales`);

  // ── 2. Mapear item_id → SKU (en lotes) ─────────────────────────
  const itemToSku = new Map<string, string>();
  for (let i = 0; i < active.length; i += IDS_PER_CALL) {
    const ids = active.slice(i, i + IDS_PER_CALL).map(a => a.item_id).join(",");
    try {
      const resp = await pt(`/items?ids=${ids}&attributes=id,seller_custom_field`);
      const arr = Array.isArray(resp) ? resp : [resp];
      for (const r of arr as Array<{ code?: number; body?: { id?: string; seller_custom_field?: string } }>) {
        const id  = r.body?.id;
        const sku = r.body?.seller_custom_field?.trim();
        if (id && sku) itemToSku.set(id, sku);
      }
    } catch (e) {
      console.warn("[ML ACoS] error mapeando lote:", String(e));
    }
  }

  // ── 3. Agregar por SKU ─────────────────────────────────────────
  const agg = new Map<string, { cost: number; sales: number }>();
  for (const a of active) {
    const sku = itemToSku.get(a.item_id);
    if (!sku) continue;
    const e = agg.get(sku) ?? { cost: 0, sales: 0 };
    e.cost  += a.cost;
    e.sales += a.sales;
    agg.set(sku, e);
  }

  const acosMap = new Map<string, number>();
  for (const [sku, e] of agg) {
    if (e.sales > 0) acosMap.set(sku, Math.round((e.cost / e.sales) * 1000) / 1000);
  }
  console.log(`[ML ACoS] ✓ ACoS real para ${acosMap.size} SKUs`);
  return acosMap;
}
