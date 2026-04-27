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
  id?:      number | string;
  sku?:     string;
  item_id?: string;
  // Nombre / título
  nombre?:  string;
  title?:   string;
  name?:    string;
  // Costo unitario (estructura ProfitGuard)
  unitCost?: { cents?: number; currency?: string; formattedValue?: string };
  // Dimensiones (no usadas en el dashboard)
  weight?: number; height?: number; length?: number; width?: number;
  type?:   string;
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

/** Extrae el SKU — usa solo el campo `sku` real, nunca el id interno */
export function extractSku(p: PGProduct): string | null {
  return p.sku?.toString().trim() || null;
}

/** Extrae el nombre del producto */
export function extractNombre(p: PGProduct, fallback: string): string {
  return (p.name ?? p.nombre ?? p.title ?? "").toString().trim() || fallback;
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
 * Obtiene el stock total por SKU desde /api/v1/product_stocks.
 * Suma stock de todos los warehouses (ML + Falabella + etc.).
 * Retorna Map vacío si el endpoint falla.
 */
export async function fetchProductStocks(): Promise<Map<string, number>> {
  const stockMap = new Map<string, number>();
  let page = 1;

  try {
    while (true) {
      let data: unknown;
      try {
        data = await pgFetch(`/api/v1/product_stocks?page=${page}&page_size=100`);
      } catch (err) {
        if (err instanceof PGPageNotFoundError) break;
        throw err;
      }

      const items = extractArray(data) as Array<Record<string, unknown>>;
      if (items.length === 0) break;

      for (const item of items) {
        const sku = String(
          item.product_sku ?? item.sku ?? item.item_id ?? ""
        ).trim();
        if (!sku) continue;
        const qty = Math.round(
          Number(item.quantity ?? item.stock ?? item.available_quantity ?? 0)
        );
        // Sumar stock de todos los warehouses para ese SKU
        stockMap.set(sku, (stockMap.get(sku) ?? 0) + qty);
      }

      const meta       = (data as Record<string, unknown>)?.meta as Record<string, unknown> | undefined;
      const totalPages = Number(meta?.total_pages ?? 0);
      if (totalPages > 0 && page >= totalPages) break;
      page++;
    }

    console.log(`[PG Stocks] ✓ ${stockMap.size} SKUs con stock`);
    return stockMap;
  } catch (err) {
    console.warn("[PG Stocks] No disponible:", String(err));
    return stockMap;
  }
}
