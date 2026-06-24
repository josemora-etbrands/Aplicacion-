import { prisma } from "@/lib/prisma";
import Sidebar from "@/app/components/Sidebar";

export const dynamic = "force-dynamic";

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

interface Tarea {
  id: string; tipoPalanca: string; fechaInicio: Date; comentario: string | null;
  sku: string; nombre: string;
}

async function getTareas(): Promise<{ tareas: Tarea[]; error: boolean }> {
  try {
    const logs = await prisma.palancaLog.findMany({
      orderBy: { fechaInicio: "desc" },
      include: { product: { select: { sku: true, nombre: true } } },
    });
    return {
      tareas: logs.map(l => ({
        id: l.id, tipoPalanca: l.tipoPalanca, fechaInicio: l.fechaInicio, comentario: l.comentario,
        sku: l.product.sku, nombre: l.product.nombre,
      })),
      error: false,
    };
  } catch {
    return { tareas: [], error: true };
  }
}

export default async function TareasPage() {
  const { tareas, error } = await getTareas();

  // Agrupar por tipo de palanca (para aplicar en lote la misma acción)
  const grupos = new Map<string, Tarea[]>();
  for (const t of tareas) {
    if (!grupos.has(t.tipoPalanca)) grupos.set(t.tipoPalanca, []);
    grupos.get(t.tipoPalanca)!.push(t);
  }
  const gruposOrdenados = [...grupos.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="flex h-full min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 bg-white/90 backdrop-blur-sm z-10">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Tareas</h1>
            <p className="text-xs text-slate-400 mt-0.5">Palancas registradas por aplicar · agrupadas por acción</p>
          </div>
          <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-full font-medium">
            {tareas.length} palancas
          </span>
        </div>

        <div className="px-8 py-6 max-w-3xl mx-auto space-y-5">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm">⚠ Sin conexión a la base de datos.</div>
          )}

          {!error && tareas.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-10 text-center space-y-2">
              <div className="text-4xl">✅</div>
              <p className="text-slate-900 text-base font-semibold">No hay palancas registradas</p>
              <p className="text-slate-500 text-sm">Registra palancas desde el detalle de un SKU (clic en el SKU) y aparecerán aquí.</p>
            </div>
          )}

          {gruposOrdenados.map(([tipo, items]) => (
            <section key={tipo} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
                <h2 className="text-sm font-semibold text-slate-800">{tipo}</h2>
                <span className="text-xs text-slate-400">{items.length} {items.length === 1 ? "producto" : "productos"}</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {items.map(t => (
                  <li key={t.id} className="px-5 py-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-orange-600 text-sm">{t.sku}</span>
                        <span className="text-slate-300 text-xs">·</span>
                        <span className="text-slate-400 text-xs">{fmtDate(t.fechaInicio)}</span>
                      </div>
                      <p className="text-slate-700 text-sm mt-0.5 truncate">{t.nombre}</p>
                      {t.comentario && <p className="text-slate-500 text-xs mt-0.5 italic">“{t.comentario}”</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
