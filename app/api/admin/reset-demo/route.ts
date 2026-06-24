/**
 * POST /api/admin/reset-demo  (x-ingest-secret)
 * Borra TODA la data (productos, ventas, palancas) y siembra 10 SKUs demo ficticios
 * con datos realistas para mostrar la app. Conserva los usuarios (login).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime     = "nodejs";
export const maxDuration = 120;

const MES_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function isoWeek(d: Date) {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
  const ys = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil((((dt.getTime() - ys.getTime()) / 86400000) + 1) / 7);
}

interface Def {
  sku: string; nombre: string; cat: string; madura: number; precio: number; margin: number; ads: number; stockBase: number; nuevo?: number;
}
const DEFS: Def[] = [
  { sku: "DEMO001", nombre: "Audífonos Bluetooth Pro Demo",            cat: "A", madura: 12, precio: 29990,  margin: 34, ads: 4, stockBase: 180, nuevo: 0 },
  { sku: "DEMO002", nombre: "Cámara de Seguridad WiFi 2K Demo",        cat: "A", madura: 20, precio: 24990,  margin: 31, ads: 5, stockBase: 320, nuevo: 1 },
  { sku: "DEMO003", nombre: "Aspiradora Robot Inteligente Demo",        cat: "B", madura: 8,  precio: 119990, margin: 22, ads: 6, stockBase: 90,  nuevo: 2 },
  { sku: "DEMO004", nombre: "Set Mancuernas Ajustables 20kg Demo",      cat: "A", madura: 15, precio: 59990,  margin: 28, ads: 3, stockBase: 140, nuevo: 3 },
  { sku: "DEMO005", nombre: "Cafetera Express Automática Demo",         cat: "B", madura: 10, precio: 89990,  margin: 26, ads: 4, stockBase: 70,  nuevo: 4 },
  { sku: "DEMO006", nombre: "Silla Gamer Ergonómica Demo",             cat: "C", madura: 6,  precio: 149990, margin: 19, ads: 7, stockBase: 40 },
  { sku: "DEMO007", nombre: "Freidora de Aire 5L Demo",                cat: "A", madura: 18, precio: 49990,  margin: 33, ads: 4, stockBase: 210 },
  { sku: "DEMO008", nombre: "Parlante Portátil Resistente Demo",        cat: "C", madura: 5,  precio: 34990,  margin: 24, ads: 5, stockBase: 60 },
  { sku: "DEMO009", nombre: "Reloj Inteligente Fitness Demo",          cat: "B", madura: 11, precio: 39990,  margin: 30, ads: 6, stockBase: 130 },
  { sku: "DEMO010", nombre: "Mochila Antirrobo USB Demo",              cat: "D", madura: 4,  precio: 27990,  margin: 16, ads: 3, stockBase: 25 },
];
const FECHAS: Record<string, string> = {
  DEMO001: "2026-05-20", DEMO002: "2026-05-25", DEMO003: "2026-06-01", DEMO004: "2026-06-05", DEMO005: "2026-06-10",
};

function genProducto(def: Def) {
  const from = new Date(Date.UTC(2026, 0, 1)), to = new Date(Date.UTC(2026, 5, 24));
  const base = def.madura / 7;
  const series: Array<{ date: string; label: string; units: number; stock: number; averageTicketCents: number; marginPercentage: number; adSpendPercentage: number }> = [];
  let i = 0;
  for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1), i++) {
    const dow = d.getUTCDay();
    const wkFactor = dow === 0 || dow === 6 ? 0.55 : 1;
    const units = Math.max(0, Math.round(base * (0.45 + Math.random() * 1.3) * wkFactor));
    const stock = Math.max(0, Math.round(def.stockBase * (0.55 + 0.45 * Math.cos(i / 22)) + (Math.random() * 12 - 6)));
    const averageTicketCents = Math.round(def.precio * (0.96 + Math.random() * 0.08));
    const marginPercentage = Math.round((def.margin + (Math.random() * 6 - 3)) * 10) / 10;
    const adSpendPercentage = Math.max(0, Math.round((def.ads + (Math.random() * 3 - 1.5)) * 10) / 10);
    series.push({ date: d.toISOString(), label: `${String(d.getUTCDate()).padStart(2, "0")} ${MES_EN[d.getUTCMonth()]}`, units, stock, averageTicketCents, marginPercentage, adSpendPercentage });
  }
  // weeks (tabla): últimas 6 semanas ISO presentes
  const byWeek = new Map<number, number>();
  for (const s of series) { const w = isoWeek(new Date(s.date)); byWeek.set(w, (byWeek.get(w) ?? 0) + s.units); }
  const semanas = [...byWeek.keys()].sort((a, b) => a - b).slice(-6);
  const weeks = semanas.map(w => ({ number: w, year: 2026, units: byWeek.get(w) ?? 0 }));
  const promedio = Math.round([...byWeek.values()].reduce((a, b) => a + b, 0) / Math.max(1, byWeek.size));
  // KPIs detalle
  const totalUnits = series.reduce((a, s) => a + s.units, 0);
  const income = series.reduce((a, s) => a + s.units * s.averageTicketCents, 0);
  const detalle = {
    totalUnits,
    averageIncomeCents: totalUnits > 0 ? Math.round(income / totalUnits) : def.precio,
    marginPercentage: income > 0 ? Math.round((series.reduce((a, s) => a + s.marginPercentage * s.units * s.averageTicketCents, 0) / income) * 10) / 10 : def.margin,
    adSpendPercentage: income > 0 ? Math.round((series.reduce((a, s) => a + s.adSpendPercentage * s.units * s.averageTicketCents, 0) / income) * 10) / 10 : def.ads,
    series,
  };
  const stockActual = series[series.length - 1].stock;
  return { weeks, promedio, detalle, stockActual };
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-ingest-secret") !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  // 1) Borrar todo (conservar users)
  await prisma.actionLog.deleteMany({});
  await prisma.palancaLog.deleteMany({});
  await prisma.weeklySales.deleteMany({});
  await prisma.product.deleteMany({});

  // 2) Sembrar los 10 demo
  for (const def of DEFS) {
    const g = genProducto(def);
    const inicial = Math.round(def.madura / 4);
    await prisma.product.create({
      data: {
        sku: def.sku, nombre: def.nombre,
        categoria: def.cat,
        velocidadInicial: inicial, velocidadMadura: def.madura,
        velocidadPromedio: g.promedio,
        stock: g.stockActual,
        esNuevo: def.nuevo !== undefined, ordenLlegada: def.nuevo ?? null,
        fechaLlegada: FECHAS[def.sku] ? new Date(FECHAS[def.sku]) : null,
        velocidadData: {
          categoria: def.cat, velocidad: def.madura, promedio: g.promedio,
          stockTotal: g.stockActual, asociaciones: 1, weeks: g.weeks, detalle: g.detalle,
        },
      },
    });
  }

  // 3) Palancas demo (para la pestaña Tareas)
  const prods = await prisma.product.findMany({ where: { sku: { in: ["DEMO002", "DEMO003", "DEMO007", "DEMO010"] } }, select: { id: true, sku: true } });
  const pal = (sku: string, tipo: string, fecha: string, com: string, impl = false) => {
    const p = prods.find(x => x.sku === sku); if (!p) return null;
    return { productId: p.id, tipoPalanca: tipo, fechaInicio: new Date(fecha), comentario: com, implementado: impl };
  };
  const palancas = [
    pal("DEMO002", "Subir el gasto en publicidad", "2026-06-15", "Demo: subir presupuesto a $20k/día"),
    pal("DEMO003", "Oportunidades SEO", "2026-06-12", "Demo: optimizar título y bullets", true),
    pal("DEMO007", "Aplicar Relámpago", "2026-06-18", "Demo: oferta relámpago fin de semana"),
    pal("DEMO010", "Profundizar DOD", "2026-06-10", "Demo: activar Deal of the Day"),
  ].filter(Boolean) as { productId: string; tipoPalanca: string; fechaInicio: Date; comentario: string; implementado: boolean }[];
  if (palancas.length) await prisma.palancaLog.createMany({ data: palancas });

  const total = await prisma.product.count();
  const totalPal = await prisma.palancaLog.count();
  return NextResponse.json({ success: true, productos: total, palancas: totalPal });
}
