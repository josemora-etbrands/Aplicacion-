import { prisma } from "@/lib/prisma";
import Sidebar from "@/app/components/Sidebar";
import VelocidadTable, { type VelocidadRow } from "@/app/components/VelocidadTable";
import { diagnosticar } from "@/app/lib/diagnostico";

export const dynamic = "force-dynamic";

interface VData {
  categoria?: string | null;
  velocidad?: number | null;
  promedio?: number | null;
  stockTotal?: number | null;
  asociaciones?: number | null;
  weeks?: Array<{ number: number; year: number; units: number }>;
}

async function getData(): Promise<{ rows: VelocidadRow[]; error: string | null }> {
  try {
    const products = await prisma.product.findMany({
      where:  { velocidadData: { not: null } },
      select: {
        sku: true, nombre: true, stock: true, velocidadData: true,
        velocidadInicial: true, velocidadMadura: true,
        margenPct: true, acos: true, publicidad: true, ventas: true, ingresos: true,
      },
    });

    const rows: VelocidadRow[] = products.map(p => {
      const d = (p.velocidadData ?? {}) as VData;
      const weeks = (d.weeks ?? []).map(w => ({ number: w.number, year: w.year, units: w.units }));
      const stockTotal = Number(d.stockTotal ?? p.stock ?? 0);
      const velocidad  = Number(d.velocidad ?? 0);

      // Semáforo: solo tiene sentido si hay meta de velocidad (>0).
      let status: VelocidadRow["status"] = null;
      let statusLabel = "";
      let palancas: string[] = [];
      if (velocidad > 0) {
        const dg = diagnosticar({
          sku: p.sku, nombre: p.nombre,
          weekHistory: weeks.map(w => ({ year: w.year, week: w.number, value: w.units })),
          velocidadInicial: Math.round(velocidad / 4), velocidadMadura: velocidad,
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
    <div className="flex h-full min-h-screen bg-[#0a0a0a]">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="border-b border-white/5 px-8 py-4 flex items-center justify-between sticky top-0 bg-[#0a0a0a]/90 backdrop-blur-sm z-10">
          <div>
            <h1 className="text-base font-semibold text-white">Velocidad de Ventas</h1>
            <p className="text-xs text-white/30 mt-0.5">ET Brands · espejo de ProfitGuard + diagnóstico IA</p>
          </div>
          {error && (
            <span className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-full">⚠ Sin conexión DB</span>
          )}
        </div>

        <div className="px-8 py-6 space-y-6">
          {/* Tabla de Velocidad de Ventas (con semáforo + detalle al clic) */}
          {rows.length === 0 && !error ? (
            <div className="rounded-xl border border-white/5 bg-[#111111] p-10 text-center text-white/40 text-sm">
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
