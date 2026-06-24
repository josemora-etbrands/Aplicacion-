import { prisma } from "@/lib/prisma";
import Sidebar from "@/app/components/Sidebar";
import VelocidadTable, { type VelocidadRow } from "@/app/components/VelocidadTable";
import { diagnosticar } from "@/app/lib/diagnostico";
import { VELOCIDADES_NUEVOS } from "@/app/lib/productosNuevos";

export const dynamic = "force-dynamic";

interface VData {
  categoria?: string | null;
  velocidad?: number | null;
  promedio?: number | null;
  stockTotal?: number | null;
  asociaciones?: number | null;
  weeks?: Array<{ number: number; year: number; units: number }>;
  detalle?: { series?: Array<{ date?: string; units: number; marginPercentage: number; averageTicketCents: number }> } | null;
}

type SeriePt = { date?: string; units: number; marginPercentage: number; averageTicketCents: number };
/**
 * Margen ponderado por semana (desde la serie diaria):
 *   actual  = semana más reciente con ventas.
 *   cerrado = la semana inmediatamente anterior con ventas.
 */
function margenes(series?: SeriePt[]): { actual: number | null; cerrado: number | null } {
  const pts = (series ?? []).filter(p => p.date && p.units > 0);
  if (!pts.length) return { actual: null, cerrado: null };
  const isoK = (ds: string) => {
    const d = new Date(ds);
    const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
    const ys = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
    return dt.getUTCFullYear() * 100 + Math.ceil((((dt.getTime() - ys.getTime()) / 86400000) + 1) / 7);
  };
  const m = new Map<number, { inc: number; mInc: number }>();
  for (const p of pts) {
    const k = isoK(p.date!);
    const inc = p.units * p.averageTicketCents;
    const e = m.get(k) ?? { inc: 0, mInc: 0 };
    e.inc += inc; e.mInc += p.marginPercentage * inc;
    m.set(k, e);
  }
  const weeks = [...m.entries()].sort((a, b) => b[0] - a[0])
    .map(([, e]) => e.inc > 0 ? Math.round((e.mInc / e.inc) * 10) / 10 : null);
  return { actual: weeks[0] ?? null, cerrado: weeks[1] ?? null };
}

async function getData(): Promise<{ rows: VelocidadRow[]; error: string | null }> {
  try {
    const products = await prisma.product.findMany({
      where:  { velocidadData: { not: null } },
      select: {
        sku: true, nombre: true, stock: true, velocidadData: true,
        velocidadInicial: true, velocidadMadura: true,
        margenPct: true, acos: true, publicidad: true, ventas: true, ingresos: true,
        esNuevo: true, ordenLlegada: true, listo: true,
      },
    });

    const rows: VelocidadRow[] = products.map(p => {
      const d = (p.velocidadData ?? {}) as VData;
      const weeks = (d.weeks ?? []).map(w => ({ number: w.number, year: w.year, units: w.units }));
      const stockTotal = Number(d.stockTotal ?? p.stock ?? 0);
      const velocidad  = Number(d.velocidad ?? 0);

      // Targets: manual si es producto nuevo seteado, si no derivado de la madura de PG.
      const ov = VELOCIDADES_NUEVOS[p.sku];
      const maduraEff  = ov ? ov.madura : velocidad;
      const inicialEff = ov ? ov.inicial : Math.round(velocidad / 4);

      // Semáforo: solo tiene sentido si hay meta de velocidad (>0).
      let status: VelocidadRow["status"] = null;
      let statusLabel = "";
      let palancas: string[] = [];
      if (maduraEff > 0) {
        const dg = diagnosticar({
          sku: p.sku, nombre: p.nombre,
          weekHistory: weeks.map(w => ({ year: w.year, week: w.number, value: w.units })),
          velocidadInicial: inicialEff, velocidadMadura: maduraEff,
          margenPct: p.margenPct, acos: p.acos,
          publicidad: p.publicidad, ventas: p.ventas, ingresos: p.ingresos,
          stock: stockTotal,
        });
        status = dg.status;
        statusLabel = dg.statusLabel;
        palancas = dg.palancasSugeridas;
      }

      return {
        sku: p.sku, nombre: p.nombre,
        categoria: (d.categoria ?? "").toString().toUpperCase(),
        velocidad, promedio: Number(d.promedio ?? 0), stockTotal,
        asociaciones: Number(d.asociaciones ?? 0), weeks,
        status, statusLabel, palancas,
        esNuevo: p.esNuevo, ordenLlegada: p.ordenLlegada ?? null, listo: p.listo,
        ...(() => { const mg = margenes(d.detalle?.series); return { margenActual: mg.actual, margenCerrado: mg.cerrado }; })(),
      };
    });

    return { rows, error: null };
  } catch (e) {
    return { rows: [], error: String(e) };
  }
}

export default async function HomePage() {
  const { rows, error } = await getData();

  return (
    <div className="flex h-full min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 bg-white/90 backdrop-blur-sm z-10">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Velocidad de Ventas</h1>
            <p className="text-xs text-slate-400 mt-0.5">ET Brands · espejo de ProfitGuard + diagnóstico IA</p>
          </div>
          {error && (
            <span className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-full">⚠ Sin conexión DB</span>
          )}
        </div>

        <div className="px-8 py-6 space-y-6">
          {/* Tabla de Velocidad de Ventas (con semáforo + detalle al clic) */}
          {rows.length === 0 && !error ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">
              Aún no hay datos de velocidad. Corre el sync de navegador (página Datos / Sync).
            </div>
          ) : (
            <VelocidadTable rows={rows} />
          )}
        </div>
      </main>
    </div>
  );
}
