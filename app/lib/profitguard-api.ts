/**
 * ProfitGuard API Client — ET Brands
 *
 * Lee la configuración desde variables de entorno:
 *   PROFITGUARD_API_URL  (default: https://app.profitguard.cl)
 *   PROFITGUARD_API_KEY  (Bearer token)
 */

const BASE_URL = (process.env.PROFITGUARD_API_URL ?? "https://app.profitguard.cl").replace(/\/$/, "");
const API_KEY  = process.env.PROFITGUARD_API_KEY ?? "";

// ──────────────────────────────────────────────────────────────
//  Tipos internos de la API de ProfitGuard
// ──────────────────────────────────────────────────────────────

export interface PGProduct {
  // Identificadores
  id?:               number | string;
  sku?:              string;
  item_id?:          string;
  // Nombre / título
  nombre?:           string;
  title?:            string;
  name?:             string;
  // Stock
  stock?:            number | string;
  stock_total?:      number | string;
  quantity?:         number | string;
  // Margen
  margen_pct?:       number | string;
  margin?:           number | string;
  profit_margin?:    number | string;  // nombre ProfitGuard
  gross_margin?:     number | string;
  // Publicidad / ads spend
  publicidad?:       number | string;
  advertising?:      number | string;
  ad_spend?:         number | string;
  // Ventas (unidades)
  ventas?:           number | string;
  sales?:            number | string;
  total_sales?:      number | string;  // nombre ProfitGuard
  units_sold?:       number | string;
  // Ingresos / revenue
  ingresos?:         number | string;
  revenue?:          number | string;
  total_revenue?:    number | string;
  // ACOS
  acos?:             number | string;
  acos_value?:       number | string;  // nombre ProfitGuard
  // Velocidades
  velocidad_inicial?: number | string;
  velocidad_madura?:  number | string;
  velocidad?:         { inicial?: number | string; madura?: number | string };
}

export interface PGSyncResult {
  products:   PGProduct[];
  total:      number;
  page?:      number;
  totalPages?: number;
}

// ──────────────────────────────────────────────────────────────
//  Errores tipados para mensajes claros al usuario
// ──────────────────────────────────────────────────────────────

export class PGAuthError extends Error {
  constructor() {
    super("API key inválida o expirada. Verifica PROFITGUARD_API_KEY en .env.local y en app.profitguard.cl → Ajustes → API.");
    this.name = "PGAuthError";
  }
}

export class PGDownError extends Error {
  constructor(status: number) {
    super(`El servicio de ProfitGuard no está disponible en este momento (HTTP ${status}). Intenta en unos minutos.`);
    this.name = "PGDownError";
  }
}

export class PGRateLimitError extends Error {
  constructor() {
    super("Demasiadas solicitudes a ProfitGuard. Espera unos segundos y vuelve a intentarlo.");
    this.name = "PGRateLimitError";
  }
}

/** 404 en una página de paginación = fin del catálogo, no error fatal */
export class PGPageNotFoundError extends Error {
  constructor() {
    super("Página no encontrada — fin del catálogo.");
    this.name = "PGPageNotFoundError";
  }
}

// ──────────────────────────────────────────────────────────────
//  Helper: fetch autenticado con timeout y errores descriptivos
// ──────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 20_000; // 20 segundos

async function pgFetch(path: string): Promise<unknown> {
  if (!API_KEY) {
    throw new Error(
      "PROFITGUARD_API_KEY no está configurada. " +
      "Agrégala a .env.local → PROFITGUARD_API_KEY=tu_key y reinicia el servidor.",
    );
  }

  const url        = `${BASE_URL}${path}`;
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept:        "application/json",
      },
      cache:  "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === "AbortError") {
      throw new Error(`La solicitud a ProfitGuard tardó más de ${FETCH_TIMEOUT_MS / 1000}s y fue cancelada. Revisa tu conexión.`);
    }
    throw new Error(`No se pudo conectar con ProfitGuard: ${String(err)}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) throw new PGAuthError();
    if (res.status === 429)                        throw new PGRateLimitError();
    if (res.status >= 500)                         throw new PGDownError(res.status);
    if (res.status === 404)                        throw new PGPageNotFoundError();
    throw new Error(`ProfitGuard respondió HTTP ${res.status} en ${path}: ${body.slice(0, 200)}`);
  }

  return res.json();
}

// ──────────────────────────────────────────────────────────────
//  Normalización de respuesta de productos
// ──────────────────────────────────────────────────────────────

function extractArray(data: unknown): PGProduct[] {
  if (Array.isArray(data)) return data as PGProduct[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    // Prueba los wrappers más comunes
    for (const key of ["data", "products", "items", "results"]) {
      if (Array.isArray(obj[key])) return obj[key] as PGProduct[];
    }
  }
  return [];
}

/** Convierte cualquier valor a número float, tolerando strings y null */
function toFloat(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? 0 : n;
}

/** Extrae el SKU de un producto, probando varios nombres de campo */
export function extractSku(p: PGProduct): string | null {
  return (p.sku ?? p.item_id ?? null)?.toString().trim() || null;
}

/** Extrae el nombre/título de un producto */
export function extractNombre(p: PGProduct, fallback: string): string {
  return (p.nombre ?? p.title ?? p.name ?? "").toString().trim() || fallback;
}

/** Extrae el stock */
export function extractStock(p: PGProduct): number {
  const raw = p.stock ?? p.stock_total ?? p.quantity ?? null;
  return Math.round(toFloat(raw));
}

/** Extrae el margen porcentual */
export function extractMargen(p: PGProduct): number {
  // profit_margin y gross_margin son los nombres que usa ProfitGuard
  return toFloat(p.profit_margin ?? p.gross_margin ?? p.margen_pct ?? p.margin ?? null);
}

/** Extrae publicidad / ad spend */
export function extractPublicidad(p: PGProduct): number {
  return toFloat(p.publicidad ?? p.advertising ?? p.ad_spend ?? null);
}

/** Extrae ventas (unidades o importe según lo que envíe la API) */
export function extractVentas(p: PGProduct): number {
  // total_sales es el nombre que usa ProfitGuard
  return toFloat(p.total_sales ?? p.ventas ?? p.sales ?? p.units_sold ?? null);
}

/** Extrae ingresos / revenue */
export function extractIngresos(p: PGProduct): number {
  return toFloat(p.total_revenue ?? p.revenue ?? p.ingresos ?? null);
}

/** Extrae ACOS — usa acos_value (ProfitGuard) o lo deriva de publicidad/ingresos */
export function extractAcos(p: PGProduct): number {
  const explicit = toFloat(p.acos_value ?? p.acos ?? null);
  if (explicit > 0) return explicit;
  const pub = extractPublicidad(p);
  const ing = extractIngresos(p);
  return ing > 0 ? pub / ing : 0;
}

// ──────────────────────────────────────────────────────────────
//  Funciones públicas de la API
// ──────────────────────────────────────────────────────────────

const PER_PAGE = 100; // solicitamos 100; ProfitGuard puede devolver menos — está bien

/**
 * Obtiene TODOS los productos de ProfitGuard con paginación dinámica infinita.
 *
 * Reglas de salida (en orden):
 *   1. Respuesta vacía ([])  → fin real del catálogo.
 *   2. total_count alcanzado → ya tenemos todos.
 *   3. total_pages alcanzado → última página explícita.
 *   4. Duplicados puros      → la API repite la misma página (protección anti-loop).
 *
 * NO hay límite fijo de páginas ni condición basada en tamaño de batch,
 * para soportar catálogos de cualquier tamaño.
 */
export async function fetchAllProducts(): Promise<PGProduct[]> {
  const all: PGProduct[]   = [];
  const seenSkus           = new Set<string>(); // deduplicación para detectar loops
  let   page               = 1;
  let   totalCount         = 0; // actualizado con la primera respuesta

  while (true) {
    let data: unknown;
    try {
      data = await pgFetch(`/api/v1/products?page=${page}&per_page=${PER_PAGE}`);
    } catch (err) {
      // 404 = ProfitGuard no tiene más páginas → fin normal del catálogo
      if (err instanceof PGPageNotFoundError) {
        console.log(`[PG API] Página ${page} devolvió 404 — fin del catálogo.`);
        break;
      }
      throw err; // cualquier otro error sí es fatal
    }
    const batch = extractArray(data);

    // ── DIAGNÓSTICO: muestra la estructura real del primer producto ─
    // (solo en la primera página para no saturar los logs)
    if (page === 1 && batch.length > 0) {
      console.log("[PG API] ESTRUCTURA DEL PRIMER PRODUCTO (raw):",
        JSON.stringify(batch[0], null, 2));
    }

    // ── Metadatos de paginación ───────────────────────────────
    const meta = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;

    // Leer total_count solo la primera vez (es el mismo en todas las páginas)
    if (totalCount === 0) {
      totalCount = Number(meta.total ?? meta.total_count ?? meta.count ?? 0);
    }
    const totalPages = Number(meta.total_pages ?? meta.totalPages ?? meta.last_page ?? 0);

    console.log(
      `[PG API] página ${page} → ${batch.length} items | acumulado: ${all.length}` +
      (totalCount ? ` / ${totalCount}` : "") +
      (totalPages ? ` (pág ${page}/${totalPages})` : ""),
    );

    // ── PARADA 1: respuesta vacía = fin real del catálogo ─────
    if (batch.length === 0) {
      console.log("[PG API] Respuesta vacía — fin del catálogo.");
      break;
    }

    // ── Filtrar duplicados (ítems ya vistos en páginas anteriores) ─
    const newItems = batch.filter(p => {
      const sku = extractSku(p);
      return sku !== null && !seenSkus.has(sku);
    });

    // ── PARADA 2: la API repite página (anti loop infinito) ───
    if (newItems.length === 0) {
      console.log(`[PG API] Página ${page} solo contiene duplicados — fin del catálogo.`);
      break;
    }

    // Registrar SKUs vistos y acumular
    for (const p of newItems) {
      const sku = extractSku(p);
      if (sku) seenSkus.add(sku);
    }
    all.push(...newItems);

    // ── PARADA 3: total_count alcanzado ───────────────────────
    if (totalCount > 0 && all.length >= totalCount) {
      console.log(`[PG API] total_count alcanzado (${all.length}/${totalCount}).`);
      break;
    }

    // ── PARADA 4: última página explícita ─────────────────────
    if (totalPages > 0 && page >= totalPages) {
      console.log(`[PG API] Última página alcanzada (${page}/${totalPages}).`);
      break;
    }

    page++;
  }

  console.log(`[PG API] ✓ Paginación completa: ${all.length} productos únicos en ${page} página(s).`);
  return all;
}

/**
 * Obtiene el stock actualizado por SKU desde un endpoint dedicado si existe.
 * Retorna null si el endpoint no está disponible (404).
 */
export async function fetchProductStocks(): Promise<Record<string, number> | null> {
  try {
    const data = await pgFetch("/api/v1/product-stocks?per_page=500");
    const items = extractArray(data) as Array<Record<string, unknown>>;
    if (items.length === 0) return null;

    const map: Record<string, number> = {};
    for (const item of items) {
      const sku   = String(item.sku ?? item.item_id ?? "").trim();
      const stock = Math.round(Number(item.stock ?? item.stock_total ?? item.quantity ?? 0));
      if (sku) map[sku] = stock;
    }
    return map;
  } catch {
    // Endpoint no existe — no es error crítico
    return null;
  }
}
