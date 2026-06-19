/**
 * Gasto publicitario por SKU desde ProfitGuard API.
 * Endpoint: GET /api/v1/product_ads  (gasto diario × producto × integración)
 *
 * Suma `cost.cents` (neto, sin IVA) de todos los registros del período por SKU.
 * Cubre Mercado Libre (integration_id=1) y Falabella (integration_id=5).
 * Devuelve Map<sku, publicidadCLP>. El ACOS se calcula luego como publicidad/ingresos.
 */

const BASE_URL = (process.env.PROFITGUARD_API_URL ?? "https://app.profitguard.cl").replace(/\/$/, "");
const API_KEY  = process.env.PROFITGUARD_API_KEY ?? "";

const MAX_PAGES   = 400; // 400 × 100 = 40k registros/día máx — suficiente para 6 semanas
const PARALLEL    = 5;
const BATCH_DELAY = 1200; // ms entre lotes (rate limit PG 120/min)

interface PGAdItem {
  date?:    string;
  cost?:    { cents?: number };
  product?: { sku?: string };
}

function weeksAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  return d.toISOString().slice(0, 10);
}

async function fetchAdsPage(page: number, from: string, to: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const url = `${BASE_URL}/api/v1/product_ads?page=${page}&page_size=100&from=${from}&to=${to}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${API_KEY}`, Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`product_ads ${res.status} página ${page}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function extractItems(data: unknown): PGAdItem[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.items)) return obj.items as PGAdItem[];
  if (Array.isArray(obj.data))  return obj.data  as PGAdItem[];
  return [];
}

function totalPagesOf(data: unknown): number {
  if (!data || typeof data !== "object") return 0;
  const meta = (data as Record<string, unknown>).meta as Record<string, unknown> | undefined;
  return Number(meta?.total_pages ?? 0);
}

/**
 * Devuelve Map<sku, gastoPublicidadCLP> de las últimas `weeks` semanas.
 * Si el endpoint falla, devuelve el mapa con lo acumulado hasta el error (no rompe el sync).
 */
export async function fetchAdSpend(weeks = 6): Promise<Map<string, number>> {
  const from = weeksAgo(weeks);
  const to   = new Date().toISOString().slice(0, 10);
  const spend = new Map<string, number>();

  console.log(`[PG Ads] Gasto publicitario ${from} → ${to}`);

  try {
    const first = await fetchAdsPage(1, from, to);
    accumulate(first, spend);
    const totalPages = Math.min(totalPagesOf(first) || 1, MAX_PAGES);
    console.log(`[PG Ads] ${totalPages} páginas de gasto a procesar`);

    for (let p = 2; p <= totalPages; p += PARALLEL) {
      const nums = Array.from(
        { length: Math.min(PARALLEL, totalPages - p + 1) },
        (_, i) => p + i,
      );
      const pages = await Promise.all(
        nums.map(n => fetchAdsPage(n, from, to).catch(() => null)),
      );
      for (const pageData of pages) if (pageData) accumulate(pageData, spend);
      if (p + PARALLEL <= totalPages) await new Promise(r => setTimeout(r, BATCH_DELAY));
    }

    console.log(`[PG Ads] ✓ Gasto mapeado para ${spend.size} SKUs`);
  } catch (err) {
    console.warn("[PG Ads] No disponible o interrumpido:", String(err));
  }
  return spend;
}

function accumulate(data: unknown, spend: Map<string, number>): void {
  for (const item of extractItems(data)) {
    const sku = item.product?.sku?.trim();
    if (!sku) continue;
    const clp = (item.cost?.cents ?? 0) / 100;
    spend.set(sku, (spend.get(sku) ?? 0) + clp);
  }
}
