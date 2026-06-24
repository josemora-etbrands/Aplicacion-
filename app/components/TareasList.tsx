"use client";
import { useMemo, useState } from "react";
import SkuDetailModal from "./SkuDetailModal";
import { useStoreVersion, getPalancas, updatePalanca } from "@/app/lib/store";

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
}

export default function TareasList() {
  const ver = useStoreVersion();
  const tareas = useMemo(() => { void ver; return getPalancas(); }, [ver]);
  const [ocultar, setOcultar] = useState(false);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);

  const visibles = ocultar ? tareas.filter(t => !t.implementado) : tareas;
  const pendientes = tareas.filter(t => !t.implementado).length;

  const grupos = useMemo(() => {
    const m = new Map<string, typeof tareas>();
    for (const t of visibles) { if (!m.has(t.tipoPalanca)) m.set(t.tipoPalanca, []); m.get(t.tipoPalanca)!.push(t); }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [visibles]);

  return (
    <div className="space-y-5">
      {selectedSku && <SkuDetailModal sku={selectedSku} onClose={() => setSelectedSku(null)} />}

      <div className="flex items-center gap-3 text-xs">
        <span className="text-slate-500">{tareas.length} palancas · {pendientes} pendientes · {tareas.length - pendientes} implementadas</span>
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
            {items.map(t => (
              <li key={t.id} className={`px-5 py-3 flex items-start justify-between gap-4 ${t.implementado ? "bg-emerald-50/60" : ""}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => setSelectedSku(t.sku)}
                      className="font-mono text-orange-600 hover:text-orange-700 hover:underline underline-offset-2 text-sm cursor-pointer">
                      {t.sku}
                    </button>
                    <span className="text-slate-300 text-xs">·</span>
                    <span className="text-slate-400 text-xs">{fmtDate(t.fechaInicio)}</span>
                  </div>
                  <p className={`text-sm mt-0.5 truncate ${t.implementado ? "text-slate-400 line-through" : "text-slate-700"}`}>{t.nombre}</p>
                  {t.comentario && <p className="text-slate-500 text-xs mt-0.5 italic">“{t.comentario}”</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {t.implementado && <span className="border px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border-emerald-300">Implementado</span>}
                  <button onClick={() => updatePalanca(t.id, { implementado: !t.implementado })}
                    title={t.implementado ? "Marcar como pendiente" : "Marcar implementado"}
                    className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs leading-none transition-colors ${t.implementado ? "bg-emerald-500 text-white border-emerald-500" : "border-slate-300 text-slate-300 hover:text-emerald-600 hover:border-emerald-400"}`}>
                    ✓
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {grupos.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-10 text-center text-slate-400 text-sm">
          {ocultar ? "Todo implementado 🎉" : "No hay palancas registradas. Regístralas desde el detalle de un SKU."}
        </div>
      )}
    </div>
  );
}
