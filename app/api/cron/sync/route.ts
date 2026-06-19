/**
 * GET /api/cron/sync  — Orquestador del sync automático (cron de Vercel).
 *
 * Llama a los endpoints livianos como invocaciones HTTP independientes: cada uno corre
 * como su propia función serverless con su propio presupuesto de tiempo, evitando el
 * timeout de 300s que mataba el sync monolítico.
 *
 * Orden: catálogo primero (para que existan los productos), luego stock + órdenes + ads
 * en paralelo. El ACOS se calcula en sync-ads con los ingresos del día previo (se corrige
 * solo en el siguiente ciclo); el desfase de 1 día es aceptable para un cron diario.
 *
 * Protegido por CRON_SECRET (Vercel envía `Authorization: Bearer <CRON_SECRET>`).
 */
import { NextResponse } from "next/server";

export const runtime     = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const base = new URL(req.url).origin;
  const call = (path: string) =>
    fetch(`${base}${path}`, { headers: auth ? { authorization: auth } : {}, cache: "no-store" })
      .then(r => r.json())
      .catch(e => ({ error: String(e) }));

  // 1) Catálogo primero (los demás necesitan que existan los productos)
  const catalog = await call("/api/sync-catalog");

  // 2) Stock + órdenes + ads en paralelo (cada uno su propia invocación)
  const [stock, orders, ads] = await Promise.all([
    call("/api/sync-stock"),
    call("/api/sync-orders"),
    call("/api/sync-ads"),
  ]);

  return NextResponse.json({ success: true, ranAt: new Date().toISOString(), catalog, stock, orders, ads });
}
