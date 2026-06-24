"use client";
import { useMemo, useState } from "react";

export interface Tarea {
  id: string; tipoPalanca: string; fecha: string; comentario: string | null;
  sku: string; nombre: string; implementado: boolean;
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
}

export default function TareasList({ tareas }: { tareas: Tarea[] }) {
  const [hechas, setHechas] = useState<Set<string>>(() => new Set(tareas.filter(t => t.implementado).map(t => t.id)));
  const [ocultar, setOcultar] = useState(false);

  const toggle = async (t: Tarea) => {
    const nuevo = !hechas.has(t.id);
    setHechas(prev => { const s = new Set(prev); nuevo ? s.add(t.id) : s.delete(t.id); return s; });
    try {
      await fetch(`/api/sku/${t.sku}/palanca-log`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id, implementado: nuevo }),
      });
    } catch {
      setHechas(prev => { const s = new Set(prev); nuevo ? s.delete(t.id) : s.add(t.id); return s; });
    }
  };

  const visibles = ocultar ? tareas.filter(t => !hechas.has(t.id)) : tareas;
  const pendientes = tareas.filter(t => !hechas.has(t.id)).length;

  const grupos = useMemo(() => {
    const m = new Map<string, Tarea[]>();
    for (const t of visibles) { if (!m.has(t.tipoPalanca)) m.set(t.tipoPalanca, []); m.get(t.tipoPalanca)!.push(t); }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [visibles]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 text-xs">
        <span className="text-slate-500">{pendientes} pendientes · {hechas.size} implementadas</span>
        <button onClick={() => setOcultar(o => !o)}
          className={`ml-auto px-3 py-1.5 rounded-lg border transition-colors ${ocultar ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}>
          {ocultar ? "Mostrando solo pendientes" : "Ocultar implementadas"}
        </button>
      </div>

      {grupos.map(([tipo, items]) => (
        <section key={tipo} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
            <h2 className="text-sm font-semibold text-slate-800">{tipo}</h2>
            <span className="text-xs text-slate-400">{items.length} {items.length === 1 ? "producto" : "productos"}</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {items.map(t => {
              const done = hechas.has(t.id);
              return (
                <li key={t.id} className={`px-5 py-3 flex items-start justify-between gap-4 ${done ? "bg-emerald-50/60" : ""}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-orange-600 text-sm">{t.sku}</span>
                      <span className="text-slate-300 text-xs">·</span>
                      <span className="text-slate-400 text-xs">{fmtDate(t.fecha)}</span>
                    </div>
                    <p className={`text-sm mt-0.5 truncate ${done ? "text-slate-400 line-through" : "text-slate-700"}`}>{t.nombre}</p>
                    {t.comentario && <p className="text-slate-500 text-xs mt-0.5 italic">“{t.comentario}”</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {done && <span className="border px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border-emerald-300">Implementado</span>}
                    <button onClick={() => toggle(t)}
                      title={done ? "Marcar como pendiente" : "Marcar implementado"}
                      className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs leading-none transition-colors ${done ? "bg-emerald-500 text-white border-emerald-500" : "border-slate-300 text-slate-300 hover:text-emerald-600 hover:border-emerald-400"}`}>
                      ✓
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {grupos.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-10 text-center text-slate-400 text-sm">
          {ocultar ? "Todo implementado 🎉" : "No hay palancas registradas."}
        </div>
      )}
    </div>
  );
}
