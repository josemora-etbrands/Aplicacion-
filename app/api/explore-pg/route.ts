/**
 * Ruta TEMPORAL de exploración — descubre qué endpoints existen en ProfitGuard.
 * ELIMINAR después de usarla.
 */
import { NextResponse } from "next/server";

const BASE_URL = (process.env.PROFITGUARD_API_URL ?? "https://app.profitguard.cl").replace(/\/$/, "");
const API_KEY  = process.env.PROFITGUARD_API_KEY ?? "";

const ENDPOINTS_TO_TRY = [
  "/api/v1/products?page=1&per_page=1",
  "/api/v1/product-stocks?per_page=5",
  "/api/v1/orders?per_page=5",
  "/api/v1/sales?per_page=5",
  "/api/v1/metrics",
  "/api/v1/analytics",
  "/api/v1/integrations",
  "/api/v1/reports",
  "/api/v1/inventory",
  "/api/v1/stocks",
  "/api/v1/product-sales?per_page=5",
  "/api/v1/product-metrics?per_page=5",
  "/api/v1/listings?per_page=5",
  "/api/v1/catalog?per_page=5",
  "/api/v1/margin?per_page=5",
  "/api/v1/product-margins?per_page=5",
  "/api/v1/product-stats?per_page=5",
  "/api/v1/weekly-sales?per_page=5",
  "/api/v1/sales-velocity?per_page=5",
];

async function tryEndpoint(path: string) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${API_KEY}`, Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);

    const text = await res.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* keep as text */ }

    return {
      path,
      status: res.status,
      ok: res.ok,
      // Muestra solo los primeros campos del primer item para no saturar
      preview: res.ok
        ? (Array.isArray(body)
            ? { type: "array", length: (body as unknown[]).length, first: (body as unknown[])[0] }
            : (body && typeof body === "object" && "data" in (body as object)
                ? { type: "wrapped", keys: Object.keys(body as object), firstItem: ((body as Record<string,unknown>).data as unknown[])?.[0] }
                : { type: "object", keys: Object.keys(body as object ?? {}), sample: body }))
        : { error: typeof body === "object" ? body : text.slice(0, 200) },
    };
  } catch (err) {
    return { path, status: 0, ok: false, preview: { error: String(err) } };
  }
}

export async function GET() {
  if (!API_KEY) {
    return NextResponse.json({ error: "PROFITGUARD_API_KEY no configurada" }, { status: 500 });
  }

  console.log("[explore-pg] Explorando endpoints de ProfitGuard…");

  // Ejecutar en paralelo (grupos de 5 para no saturar)
  const results: unknown[] = [];
  for (let i = 0; i < ENDPOINTS_TO_TRY.length; i += 5) {
    const batch = ENDPOINTS_TO_TRY.slice(i, i + 5);
    const res   = await Promise.all(batch.map(tryEndpoint));
    results.push(...res);
  }

  const available = results.filter((r) => (r as {ok:boolean}).ok);
  const notFound  = results.filter((r) => (r as {status:number}).status === 404);
  const errors    = results.filter((r) => !(r as {ok:boolean}).ok && (r as {status:number}).status !== 404);

  return NextResponse.json({
    summary: {
      total:     results.length,
      available: available.length,
      notFound:  notFound.length,
      errors:    errors.length,
    },
    available,
    errors,
  }, { status: 200 });
}
