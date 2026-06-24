import { prisma } from "@/lib/prisma";
import Link from "next/link";
import Sidebar from "@/app/components/Sidebar";
import SyncTools from "@/app/components/SyncTools";

export const dynamic = "force-dynamic";

function fmtFecha(d: Date | null): string {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat("es-CL", {
      day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
      hour12: false, timeZone: "America/Santiago",
    }).format(d);
  } catch { return d.toISOString(); }
}

async function getEstado() {
  try {
    const agg = await prisma.product.aggregate({ _max: { updatedAt: true }, _count: true });
    return { ultima: agg._max.updatedAt ?? null, total: agg._count, error: false };
  } catch {
    return { ultima: null, total: 0, error: true };
  }
}

export default async function DatosPage() {
  const { ultima, total, error } = await getEstado();

  return (
    <div className="flex h-full min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="border-b border-slate-200 px-8 py-4 sticky top-0 bg-white/90 backdrop-blur-sm z-10">
          <h1 className="text-lg font-semibold text-slate-900">Datos / Sincronización</h1>
          <p className="text-xs text-slate-400 mt-0.5">ET Brands · 100% desde ProfitGuard</p>
        </div>

        <div className="px-8 py-8 max-w-2xl mx-auto space-y-6">
          {/* Última actualización */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-slate-400 text-[10px] uppercase tracking-wider">Última actualización de la app</p>
              <p className="text-slate-900 text-lg font-semibold mt-0.5">{error ? "Sin conexión DB" : fmtFecha(ultima)}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-400 text-[10px] uppercase tracking-wider">Productos</p>
              <p className="text-slate-900 text-lg font-semibold mt-0.5">{total.toLocaleString("es-CL")}</p>
            </div>
          </div>

          {/* Cómo viajan los datos */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-3">
            <p className="text-slate-700 text-sm font-semibold">¿Cómo viajan los datos?</p>
            <p className="text-slate-500 text-xs leading-relaxed">
              La app no muestra datos en vivo: guarda una &quot;foto&quot; de ProfitGuard y la actualiza así:
            </p>
            <ul className="space-y-2 text-xs">
              <li className="flex gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-slate-600"><b>Catálogo, stock y ACoS real</b> → se traen solos <b>1 vez al día</b> (cron automático).</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                <span className="text-slate-600"><b>Velocidades, categoría ABC, semanas y el gráfico de detalle</b> → solo se actualizan cuando <b>tú corres el bookmarklet</b> de abajo.</span>
              </li>
            </ul>
            <p className="text-slate-400 text-[11px] leading-relaxed border-t border-slate-100 pt-3">
              Nota: ese dato de velocidades solo se puede leer con tu sesión de ProfitGuard (no con la API), por eso
              es manual. Además, el día <b>en curso</b> suele estar incompleto en PG (las ventas/ads se procesan
              durante el día); lo más confiable son los días/semanas ya cerrados.
            </p>
          </div>

          {/* Herramienta de sync (contraseña + bookmarklet) */}
          <SyncTools />

          <div className="flex">
            <Link href="/" className="flex-1 text-center bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-sm font-medium px-6 py-3 rounded-xl transition-colors">
              ← Ver Velocidad de Ventas
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
