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
  id?:           number | string;
  sku?:          string;
  item_id?:      string;
  nombre?:       string;
  title?:        string;
  name?:         string;
  stock?:        number;
  stock_total?:  number;
  margen_pct?:   number;
  margin?:       number;
  publicidad?:   number;
  advertising?:  number;
  ventas?:       number;
  sales?:        number;
  ingresos?:     number;
  revenue?:      number;
  acos?:         number;
  velocidad_inicial?: number;
  velocidad_madura?:  number;
  velocidad?:         { inicial?: number; madura?: number };
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

/** Extrae el SKU de un producto, probando varios nombres de campo */
export function extractSku(p: PGProduct): string | null {
  return (p.sku ?? p.item_id ?? null)?.toString().trim() || null;
}

/** Extrae el nombre/título de un producto */
export function extractNombre(p: PGProduct, fallback: string): string {
  return (p.nombre ?? p.title ?? p.name ?? "").toString().trim() || fallback;
}

/** Extrae el stock, probando varios nombres de campo */
export function extractStock(p: PGProduct): number {
  const raw = p.stock ?? p.stock_total ?? null;
  if (raw === null || raw === undefined) return 0;
  return Math.round(Number(raw));
}

/** Extrae el margen porcentual */
export function extractMargen(p: PGProduct): number {
  const raw = p.margen_pct ?? p.margin ?? null;
  if (raw === null || raw === undefined) return 0;
  return Number(raw);
}

/** Extrae publicidad (gasto en ads) */
export function extractPublicidad(p: PGProduct): number {
  return Number(p.publicidad ?? p.advertising ?? 0);
}

/** Extrae ventas (unidades) */
export function extractVentas(p: PGProduct): number {
  return Number(p.ventas ?? p.sales ?? 0);
}

/** Extrae ingresos (revenue) */
export function extractIngresos(p: PGProduct): number {
  return Number(p.ingresos ?? p.revenue ?? 0);
}

/** Extrae ACOS — si no viene calculado, lo deriva de publicidad/ingresos */
export function extractAcos(p: PGProduct): number {
  if (typeof p.acos === "number" && p.acos > 0) return p.acos;
  const pub = extractPublicidad(p);
  const ing = extractIngresos(p);
  return ing > 0 ? pub / ing : 0;
}

// ──────────────────────────────────────────────────────────────
//  Funciones públicas de la API
// ──────────────────────────────────────────────────────────────

/**
 * Obtiene todos los productos de ProfitGuard, manejando paginación automáticamente.
 * Soporta respuestas paginadas (page/per_page) y arrays simples.
 */
export async function fetchAllProducts(): Promise<PGProduct[]> {
  const all: PGProduct[] = [];

  // Intento 1: paginación explícita
  let page = 1;
  while (true) {
    const data = await pgFetch(`/api/v1/products?page=${page}&per_page=200`);
    const batch = extractArray(data);
    if (batch.length === 0) break;
    all.push(...batch);

    // Verificar si hay más páginas
    const meta = data as Record<string, unknown>;
    const totalPages = Number(meta.total_pages ?? meta.totalPages ?? meta.last_page ?? 1);
    if (page >= totalPages || batch.length < 200) break;
    page++;
  }

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
