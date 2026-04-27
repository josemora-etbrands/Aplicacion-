/**
 * Agregación de órdenes desde ProfitGuard API
 * Calcula ventas semanales, ingresos y margen por SKU.
 */

const BASE_URL = (process.env.PROFITGUARD_API_URL ?? "https://app.profitguard.cl").replace(/\/$/, "");
const API_KEY  = process.env.PROFITGUARD_API_KEY ?? "";

const MAX_PAGES = 200;  // seguridad anti-loop (200 × 100 = 20k órdenes)
const PARALLEL  = 5;    // páginas simultáneas por lote

// ── Tipos ────────────────────────────────────────────────────────

interface MoneyField { cents: number; currency: string; formattedValue: string; }

interface PGOrderItem {
  quantity:   number;
  unitPrice:  MoneyField;
  commission: MoneyField;
  product: { sku: string; name: string; unitCost: MoneyField; };
}

interface PGOrder {
  id:         number;
  date:       string;   // "YYYY-MM-DD"
  status:     string;
  orderItems: PGOrderItem[];
}

export interface SkuWeekSales  { year: number; week: number; quantity: number; }
export interface SkuAggregation {
  sku:             string;
  nombre:          string;
  weeks:           SkuWeekSales[];
  totalRevenue:    number;
  totalNetRevenue: number;
  totalUnits:      number;
  margenPct:       number;
}

// ── Helpers ──────────────────────────────────────────────────────

function dateToISOWeek(dateStr: string): { year: number; week: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: date.getUTCFullYear(), week };
}

function weeksAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  return d.toISOString().slice(0, 10);
}

async function pgFetchPage(page: number, cutoffDate: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const url = `${BASE_URL}/api/v1/orders?page=${page}&page_size=100&status=paid&from=${cutoffDate}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${API_KEY}`, Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Orders API ${res.status} página ${page}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function extractOrders(data: unknown): PGOrder[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.items)) return obj.items as PGOrder[];
  if (Array.isArray(obj.data))  return obj.data  as PGOrder[];
  if (Array.isArray(data))      return data       as PGOrder[];
  return [];
}

function extractMeta(data: unknown): { totalPages: number; totalCount: number } {
  if (!data || typeof data !== "object") return { totalPages: 0, totalCount: 0 };
  const obj  = data as Record<string, unknown>;
  const meta = obj.meta as Record<string, unknown> | undefined;
  return {
    totalPages: Number(meta?.total_pages ?? obj.total_pages ?? 0),
    totalCount: Number(meta?.total_count ?? obj.total_count ?? 0),
  };
}

/** Agrega las órdenes de una página. Devuelve la fecha más reciente y más antigua vistas. */
function processOrders(
  orders:       PGOrder[],
  cutoffDate:   string,
  aggregations: Map<string, SkuAggregation>,
): { processed: number; newestDate: string; oldestDate: string } {
  let processed   = 0;
  let newestDate  = "";
  let oldestDate  = "9999-99-99";

  for (const order of orders) {
    if (order.status !== "paid" || !order.date) continue;

    // Rastrear fechas para detectar dirección de orden
    if (order.date > newestDate) newestDate = order.date;
    if (order.date < oldestDate) oldestDate = order.date;

    // Solo procesar órdenes dentro del período
    if (order.date < cutoffDate) continue;

    processed++;
    const { year, week } = dateToISOWeek(order.date);

    for (const item of order.orderItems ?? []) {
      const sku = item.product?.sku?.trim();
      if (!sku) continue;

      const priceCLP = (item.unitPrice?.cents        ?? 0) / 100;
      const costCLP  = (item.product?.unitCost?.cents ?? 0) / 100;
      const commCLP  = (item.commission?.cents        ?? 0) / 100;
      const qty      = item.quantity ?? 1;

      const unitMargin = priceCLP > 0
        ? ((priceCLP - costCLP - commCLP) / priceCLP) * 100 : 0;

      if (!aggregations.has(sku)) {
        aggregations.set(sku, {
          sku, nombre: item.product.name?.trim() ?? sku,
          weeks: [], totalRevenue: 0, totalNetRevenue: 0,
          totalUnits: 0, margenPct: 0,
        });
      }

      const agg = aggregations.get(sku)!;
      const prevRevenue = agg.totalRevenue;
      agg.totalRevenue    += priceCLP * qty;
      agg.totalNetRevenue += (priceCLP - commCLP) * qty;
      agg.totalUnits      += qty;
      if (agg.totalRevenue > 0) {
        agg.margenPct =
          (agg.margenPct * prevRevenue + unitMargin * priceCLP * qty) / agg.totalRevenue;
      }

      const slot = agg.weeks.find(w => w.year === year && w.week === week);
      if (slot) slot.quantity += qty;
      else      agg.weeks.push({ year, week, quantity: qty });
    }
  }

  return { processed, newestDate, oldestDate };
}

// ── Función principal ─────────────────────────────────────────────

/**
 * Descarga órdenes pagadas de las últimas `weeks` semanas.
 *
 * Maneja automáticamente el orden de la API:
 * - Si responde DESC (más recientes primero): avanza hacia el pasado
 * - Si responde ASC  (más antiguas primero):  salta a la última página
 */
export async function fetchOrderAggregations(
  weeks = 6,
): Promise<Map<string, SkuAggregation>> {
  const cutoffDate = weeksAgo(weeks);
  console.log(`[PG Orders] Cutoff: ${cutoffDate} (últimas ${weeks} semanas)`);

  const aggregations = new Map<string, SkuAggregation>();

  // ── Página 1: detectar total_pages y dirección de orden ──────
  const firstData  = await pgFetchPage(1, cutoffDate);
  const firstBatch = extractOrders(firstData);
  const { totalPages: rawTotal } = extractMeta(firstData);
  const totalPages = Math.min(rawTotal || 1, MAX_PAGES);

  if (firstBatch.length === 0) {
    console.log("[PG Orders] Sin órdenes en la respuesta.");
    return aggregations;
  }

  const { newestDate: firstNewest, oldestDate: firstOldest } =
    processOrders(firstBatch, cutoffDate, aggregations);

  console.log(
    `[PG Orders] Página 1/${totalPages} | ` +
    `fechas: ${firstOldest} → ${firstNewest} | ` +
    `cutoff: ${cutoffDate}`,
  );

  // Detectar si la API ordena ASC (oldest first)
  // Si la página 1 tiene órdenes TODAS más viejas que el cutoff → orden ASC
  const pageIsAscending = firstNewest < cutoffDate;

  let startPage: number;
  let endPage:   number;

  if (pageIsAscending) {
    // La API devuelve las más antiguas primero → empezar desde la última página
    // hacia atrás para llegar a las órdenes recientes.
    const lastPage = rawTotal > 0 ? Math.min(rawTotal, MAX_PAGES) : MAX_PAGES;
    startPage = Math.max(lastPage - MAX_PAGES + 1, 1);
    endPage   = lastPage;
    console.log(`[PG Orders] Orden ASC detectado → fetching páginas ${startPage}–${endPage}`);
  } else {
    // La API devuelve las más recientes primero (DESC) → avanzar desde página 2
    startPage = 2;
    endPage   = totalPages;
    console.log(`[PG Orders] Orden DESC → fetching páginas 2–${endPage}`);
  }

  // ── Fetch del resto de páginas en lotes paralelos ────────────
  for (let p = startPage; p <= endPage; p += PARALLEL) {
    // Skip página 1 si ya la procesamos (DESC mode)
    const pageNums = Array.from(
      { length: Math.min(PARALLEL, endPage - p + 1) },
      (_, i) => p + i,
    ).filter(n => n !== 1); // evitar re-procesar pág 1

    if (pageNums.length === 0) continue;

    const pages = await Promise.all(
      pageNums.map(n => pgFetchPage(n, cutoffDate).catch(() => null)),
    );

    let allPagesOlderThanCutoff = true;
    for (const pageData of pages) {
      if (!pageData) continue;
      const orders = extractOrders(pageData);
      const { newestDate } = processOrders(orders, cutoffDate, aggregations);
      // Si alguna orden de esta página es más reciente que el cutoff → hay datos útiles
      if (newestDate >= cutoffDate) allPagesOlderThanCutoff = false;
    }

    console.log(
      `[PG Orders] Páginas ${pageNums[0]}–${pageNums[pageNums.length - 1]} | ` +
      `${aggregations.size} SKUs acumulados`,
    );

    // Solo parar si TODAS las páginas del lote son anteriores al cutoff
    if (allPagesOlderThanCutoff) {
      console.log("[PG Orders] Cutoff alcanzado — fin de paginación.");
      break;
    }
  }

  console.log(`[PG Orders] ✓ ${aggregations.size} SKUs con ventas.`);
  return aggregations;
}
