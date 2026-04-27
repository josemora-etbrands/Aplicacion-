/**
 * Ruta TEMPORAL — explora el passthrough de ML vía ProfitGuard
 * para descubrir si podemos sacar stock y publicidad.
 * ELIMINAR después de usarla.
 */
import { NextResponse } from "next/server";

const BASE_URL = (process.env.PROFITGUARD_API_URL ?? "https://app.profitguard.cl").replace(/\/$/, "");
const API_KEY  = process.env.PROFITGUARD_API_KEY ?? "";

const HEADERS = {
  Authorization: `Bearer ${API_KEY}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

async function pgGet(path: string) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: HEADERS, cache: "no-store",
    });
    const text = await res.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* keep as text */ }
    return { path, status: res.status, ok: res.ok, body };
  } catch (err) {
    return { path, status: 0, ok: false, body: String(err) };
  }
}

/** Hace un passthrough GET a la API de ML vía ProfitGuard */
async function mlPassthrough(integrationId: number, mlPath: string) {
  try {
    const res = await fetch(
      `${BASE_URL}/api/v1/integrations/${integrationId}/passthrough`,
      {
        method: "POST",
        headers: HEADERS,
        cache: "no-store",
        body: JSON.stringify({ path: mlPath }),
      },
    );
    const text = await res.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* keep as text */ }
    return { mlPath, status: res.status, ok: res.ok, body };
  } catch (err) {
    return { mlPath, status: 0, ok: false, body: String(err) };
  }
}

export async function GET() {
  if (!API_KEY) {
    return NextResponse.json({ error: "PROFITGUARD_API_KEY no configurada" }, { status: 500 });
  }

  // ── 1. Listar integraciones para encontrar el ID de ML ────────
  const integrationsRes = await pgGet("/api/v1/integrations");

  // ── 2. Ver estructura de 1 orden con page_size correcto ───────
  const ordersRes = await pgGet("/api/v1/orders?page=1&page_size=1&status=paid");

  // ── 3. Intentar passthrough a ML con integration_id=1 ─────────
  // Endpoints de ML que nos interesan:
  const passthroughResults = await Promise.all([
    // Stock de los primeros 20 items del usuario
    mlPassthrough(1, "/users/613899966/items/search?limit=5"),
    // Un item de ejemplo para ver campos (stock en available_quantity)
    mlPassthrough(1, "/sites/MLC/search?seller_id=613899966&limit=2"),
    // Publicidad (si está disponible)
    mlPassthrough(1, "/advertisers/78477/campaigns?limit=3"),
    // Ad metrics
    mlPassthrough(1, "/advertisers/78477/ad_units?limit=3"),
  ]);

  return NextResponse.json({
    integrations: integrationsRes,
    orders_sample: ordersRes,
    ml_passthrough: passthroughResults,
  }, { status: 200 });
}
