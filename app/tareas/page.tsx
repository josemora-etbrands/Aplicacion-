import { prisma } from "@/lib/prisma";
import Sidebar from "@/app/components/Sidebar";
import TareasList, { type Tarea } from "@/app/components/TareasList";

export const dynamic = "force-dynamic";

async function getTareas(): Promise<{ tareas: Tarea[]; error: boolean }> {
  try {
    const logs = await prisma.palancaLog.findMany({
      orderBy: { fechaInicio: "desc" },
      include: { product: { select: { sku: true, nombre: true } } },
    });
    return {
      tareas: logs.map(l => ({
        id: l.id, tipoPalanca: l.tipoPalanca, fecha: l.fechaInicio.toISOString(),
        comentario: l.comentario, implementado: l.implementado,
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

        <div className="px-8 py-6 max-w-3xl mx-auto">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm">⚠ Sin conexión a la base de datos.</div>
          ) : tareas.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-10 text-center space-y-2">
              <div className="text-4xl">✅</div>
              <p className="text-slate-900 text-base font-semibold">No hay palancas registradas</p>
              <p className="text-slate-500 text-sm">Registra palancas desde el detalle de un SKU (clic en el SKU) y aparecerán aquí.</p>
            </div>
          ) : (
            <TareasList tareas={tareas} />
          )}
        </div>
      </main>
    </div>
  );
}
