/**
 * Agregación de órdenes desde ProfitGuard API
 * Calcula ventas semanales, ingresos y margen por SKU
 * desde el historial de órdenes pagadas.
 */

const BASE_URL = (process.env.PROFITGUARD_API_URL ?? "https://app.profitguard.cl").replace(/\/$/, "");
const API_KEY  = process.env.PROFITGUARD_API_KEY ?? "";

// ── Tipos ────────────────────────────────────────────────────────

interface MoneyField {
  cents:          number;
  currency:       string;
  formattedValue: string;
}

interface PGOrderItem {
  quantity:              number;
  unitPrice:             MoneyField;
  unitSalesFee:          MoneyField;
  shippingCost:          MoneyField;
  shippingRevenue:       MoneyField;
  commission:            MoneyField;
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
  const date   = new Date(Date.UTC(y, m - 1, d));
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

async function pgFetchOrders(path: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Orders API ${res.status}: ${path}`);
  return res.json();
}

function extractItems(data: unknown): PGOrder[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.items)) return obj.items as PGOrder[];
  if (Array.isArray(data)) return data as PGOrder[];
  return [];
}

// ── Función principal ─────────────────────────────────────────────

/**
 * Descarga órdenes pagadas de las últimas `weeks` semanas
 * y las agrega por SKU + semana ISO.
 *
 * Estrategia: pagina desde la más reciente, se detiene cuando
 * todas las órdenes de una página son anteriores al cutoff.
 */
export async function fetchOrderAggregations(
  weeks = 8,
): Promise<Map<string, SkuAggregation>> {
  const cutoffDate = weeksAgo(weeks);
  console.log(`[PG Orders] Descargando órdenes desde ${cutoffDate} (últimas ${weeks} semanas)…`);

  const aggregations = new Map<string, SkuAggregation>();
  let page = 1;
  let totalOrders = 0;

  while (true) {
    // Intentar filtro server-side por fecha (si la API lo soporta)
    const path = `/api/v1/orders?page=${page}&per_page=100&status=paid&from=${cutoffDate}`;
    let data: unknown;
    try {
      data = await pgFetchOrders(path);
    } catch {
      // Si falla con filtros, intentar sin ellos
      const fallback = `/api/v1/orders?page=${page}&per_page=100`;
      data = await pgFetchOrders(fallback);
    }

    const orders = extractItems(data);
    if (orders.length === 0) break;

    let allOlderThanCutoff = true;

    for (const order of orders) {
      if (order.status !== "paid") continue;
      if (!order.date || order.date < cutoffDate) continue;

      allOlderThanCutoff = false;
      totalOrders++;

      const { year, week } = dateToISOWeek(order.date);

      for (const item of order.orderItems ?? []) {
        const sku = item.product?.sku?.trim();
        if (!sku) continue;

        const priceCLP  = (item.unitPrice?.cents    ?? 0) / 100;
        const costCLP   = (item.product?.unitCost?.cents ?? 0) / 100;
        const commCLP   = (item.commission?.cents   ?? 0) / 100;
        const qty       = item.quantity ?? 1;

        // Margen bruto por unidad = (precio - costo - comisión) / precio
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

        // Acumular revenue y unidades (para margen ponderado)
        const prevRevenue = agg.totalRevenue;
        agg.totalRevenue    += priceCLP * qty;
        agg.totalNetRevenue += (priceCLP - commCLP) * qty;
        agg.totalUnits      += qty;

        // Margen ponderado por revenue
        if (agg.totalRevenue > 0) {
          agg.margenPct =
            (agg.margenPct * prevRevenue + unitMargin * priceCLP * qty) /
            agg.totalRevenue;
        }

        // Ventas semanales
        const weekSlot = agg.weeks.find(w => w.year === year && w.week === week);
        if (weekSlot) {
          weekSlot.quantity += qty;
        } else {
          agg.weeks.push({ year, week, quantity: qty });
        }
      }
    }

    // Leer paginación
    const meta = (data as Record<string, unknown>)?.meta as Record<string, unknown> | undefined;
    const totalPages = Number(meta?.total_pages ?? 0);

    console.log(
      `[PG Orders] Página ${page}/${totalPages || "?"} — ` +
      `${orders.length} órdenes | ${aggregations.size} SKUs acumulados`,
    );

    // Parar si todas las órdenes de esta página son anteriores al cutoff
    if (allOlderThanCutoff) {
      console.log("[PG Orders] Órdenes anteriores al cutoff — deteniendo.");
      break;
    }

    if (totalPages > 0 && page >= totalPages) break;
    page++;
  }

  console.log(
    `[PG Orders] ✓ ${totalOrders} órdenes procesadas → ` +
    `${aggregations.size} SKUs con datos de ventas.`,
  );

  return aggregations;
}
