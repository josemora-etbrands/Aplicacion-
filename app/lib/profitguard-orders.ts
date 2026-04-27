/**
 * Agregación de órdenes desde ProfitGuard API
 * Calcula ventas semanales, ingresos y margen por SKU
 * desde el historial de órdenes pagadas.
 */

const BASE_URL = (process.env.PROFITGUARD_API_URL ?? "https://app.profitguard.cl").replace(/\/$/, "");
const API_KEY  = process.env.PROFITGUARD_API_KEY ?? "";

// Límite de seguridad: máximo de páginas a descargar
const MAX_PAGES = 25;

// ── Tipos ────────────────────────────────────────────────────────

interface MoneyField {
  cents:          number;
  currency:       string;
  formattedValue: string;
}

interface PGOrderItem {
  quantity:        number;
  unitPrice:       MoneyField;
  commission:      MoneyField;
  product: {
    sku:      string;
    name:     string;
    unitCost: MoneyField;
  };
}

interface PGOrder {
  id:         number;
  date:       string; // "YYYY-MM-DD"
  status:     string;
  orderItems: PGOrderItem[];
}

export interface SkuWeekSales {
  year:     number;
  week:     number;
  quantity: number;
}

export interface SkuAggregation {
  sku:             string;
  nombre:          string;
  weeks:           SkuWeekSales[];
  totalRevenue:    number; // CLP bruto (precio × qty)
  totalNetRevenue: number; // CLP neto (precio - comisión) × qty
  totalUnits:      number;
  margenPct:       number; // 0-100
}

// ── Helpers ──────────────────────────────────────────────────────

/** Convierte "YYYY-MM-DD" a { year, week } ISO */
function dateToISOWeek(dateStr: string): { year: number; week: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: date.getUTCFullYear(), week };
}

/** Fecha YYYY-MM-DD de hace N semanas */
function weeksAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  return d.toISOString().slice(0, 10);
}

async function pgFetchPage(page: number, cutoffDate: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    // El parámetro correcto según la doc oficial es page_size (no per_page)
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
  if (Array.isArray(obj.items))  return obj.items as PGOrder[];
  if (Array.isArray(obj.data))   return obj.data  as PGOrder[];
  if (Array.isArray(data))       return data       as PGOrder[];
  return [];
}

function extractTotalPages(data: unknown): number {
  if (!data || typeof data !== "object") return 0;
  const obj = data as Record<string, unknown>;
  const meta = obj.meta as Record<string, unknown> | undefined;
  return Number(
    meta?.total_pages ?? meta?.totalPages ??
    obj.total_pages   ?? obj.totalPages   ?? 0,
  );
}

/** Agrega las órdenes de una página en el mapa de agregaciones */
function processOrders(
  orders: PGOrder[],
  cutoffDate: string,
  aggregations: Map<string, SkuAggregation>,
): { processed: number; allOlder: boolean } {
  let processed = 0;
  let allOlder  = true;

  for (const order of orders) {
    if (order.status !== "paid") continue;
    if (!order.date)             continue;
    if (order.date < cutoffDate) continue;

    allOlder = false;
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
        ? ((priceCLP - costCLP - commCLP) / priceCLP) * 100
        : 0;

      if (!aggregations.has(sku)) {
        aggregations.set(sku, {
          sku,
          nombre:          item.product.name?.trim() ?? sku,
          weeks:           [],
          totalRevenue:    0,
          totalNetRevenue: 0,
          totalUnits:      0,
          margenPct:       0,
        });
      }

      const agg = aggregations.get(sku)!;
      const prevRevenue = agg.totalRevenue;

      agg.totalRevenue    += priceCLP * qty;
      agg.totalNetRevenue += (priceCLP - commCLP) * qty;
      agg.totalUnits      += qty;

      if (agg.totalRevenue > 0) {
        agg.margenPct =
          (agg.margenPct * prevRevenue + unitMargin * priceCLP * qty) /
          agg.totalRevenue;
      }

      const slot = agg.weeks.find(w => w.year === year && w.week === week);
      if (slot) slot.quantity += qty;
      else      agg.weeks.push({ year, week, quantity: qty });
    }
  }

  return { processed, allOlder };
}

// ── Función principal ─────────────────────────────────────────────

/**
 * Descarga órdenes pagadas de las últimas `weeks` semanas y las agrega
 * por SKU + semana ISO.
 *
 * Estrategia de paginación paralela:
 *   1. Descarga página 1 para conocer total_pages.
 *   2. Descarga el resto de páginas EN PARALELO (lotes de 5).
 *   3. Se detiene en MAX_PAGES como seguridad anti-loop.
 */
export async function fetchOrderAggregations(
  weeks = 6,
): Promise<Map<string, SkuAggregation>> {
  const cutoffDate = weeksAgo(weeks);
  console.log(`[PG Orders] Descargando órdenes desde ${cutoffDate} (últimas ${weeks} semanas)…`);

  const aggregations = new Map<string, SkuAggregation>();

  // ── Página 1: descubrir total_pages ──────────────────────────
  const firstData  = await pgFetchPage(1, cutoffDate);
  const firstBatch = extractOrders(firstData);
  const totalPages = Math.min(extractTotalPages(firstData) || 1, MAX_PAGES);

  console.log(`[PG Orders] Total páginas: ${totalPages} | página 1: ${firstBatch.length} órdenes`);

  const { allOlder: firstAllOlder } = processOrders(firstBatch, cutoffDate, aggregations);

  // Si la primera página ya es toda anterior al cutoff, terminar
  if (firstAllOlder || totalPages <= 1) {
    console.log(`[PG Orders] ✓ ${aggregations.size} SKUs (1 página)`);
    return aggregations;
  }

  // ── Páginas 2..totalPages en paralelo (lotes de 5) ───────────
  const PARALLEL = 5;
  for (let start = 2; start <= totalPages; start += PARALLEL) {
    const pageNums = Array.from(
      { length: Math.min(PARALLEL, totalPages - start + 1) },
      (_, i) => start + i,
    );

    const pages = await Promise.all(pageNums.map(p => pgFetchPage(p, cutoffDate)));

    let anyReachedCutoff = false;
    for (let i = 0; i < pages.length; i++) {
      const orders = extractOrders(pages[i]);
      const { allOlder } = processOrders(orders, cutoffDate, aggregations);
      if (allOlder) anyReachedCutoff = true;
    }

    console.log(
      `[PG Orders] Páginas ${pageNums[0]}–${pageNums[pageNums.length - 1]} procesadas | ` +
      `${aggregations.size} SKUs acumulados`,
    );

    // Si alguna página de este lote era toda anterior al cutoff, terminamos
    if (anyReachedCutoff) {
      console.log("[PG Orders] Cutoff alcanzado — deteniendo paginación.");
      break;
    }
  }

  console.log(`[PG Orders] ✓ ${aggregations.size} SKUs con datos de ventas.`);
  return aggregations;
}
