"use client";
import { useState } from "react";
import type { ProductDiagnostico } from "@/app/lib/diagnostico";

const statusStyle: Record<string, string> = {
  VERDE:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  AMARILLO: "bg-yellow-500/10  text-yellow-400  border-yellow-500/20",
  ROJO:     "bg-red-500/10     text-red-400     border-red-500/20",
};

const barColor: Record<string, string> = {
  VERDE: "bg-emerald-500", AMARILLO: "bg-yellow-500", ROJO: "bg-red-500",
};

interface Props { diagnosticos: ProductDiagnostico[] }

export default function DiagnosticoTable({ diagnosticos }: Props) {
  const [filter, setFilter] = useState<"ALL" | "ROJO" | "AMARILLO" | "VERDE">("ALL");
  const [search, setSearch] = useState("");

  const visible = diagnosticos.filter(d => {
    if (filter !== "ALL" && d.status !== filter) return false;
    if (search && !d.sku.toLowerCase().includes(search.toLowerCase()) &&
        !d.nombre.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="rounded-xl border border-white/5 bg-[#111111] overflow-hidden">
      {/* Filters */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3 flex-wrap">
        <input
          type="text" placeholder="Buscar SKU o producto..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#3b82f6]/50 w-52"
        />
        {(["ALL", "ROJO", "AMARILLO", "VERDE"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              filter === f
                ? f === "ROJO" ? "bg-red-500/20 text-red-400 border-red-500/30"
                : f === "AMARILLO" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                : f === "VERDE" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                : "bg-[#3b82f6]/20 text-[#3b82f6] border-[#3b82f6]/30"
                : "text-white/30 border-white/10 hover:border-white/20"
            }`}>
            {f === "ALL" ? `Todos (${diagnosticos.length})` : f === "ROJO" ? `🔴 ${diagnosticos.filter(d=>d.status==="ROJO").length}` : f === "AMARILLO" ? `🟡 ${diagnosticos.filter(d=>d.status==="AMARILLO").length}` : `🟢 ${diagnosticos.filter(d=>d.status==="VERDE").length}`}
          </button>
        ))}
        <span className="text-xs text-white/20 ml-auto">{visible.length} SKUs</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/5">
              {["SKU", "Producto", "Últ. Semana", "Meta 1", "Meta 2", "% Meta 2", "Margen", "ACOS", "Stock", "Estado", "Palancas IA"].map(h => (
                <th key={h} className="text-left px-4 py-2.5 text-white/30 font-medium uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((d, i) => (
              <tr key={d.sku} className={`${i < visible.length - 1 ? "border-b border-white/5" : ""} hover:bg-white/[0.02] transition-colors`}>
                <td className="px-4 py-2.5">
                  <span className="font-mono text-[#3b82f6]">{d.sku}</span>
                </td>
                <td className="px-4 py-2.5 max-w-[180px]">
                  <span className="text-white/80 block truncate">{d.nombre}</span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono font-semibold ${d.status === "ROJO" ? "text-red-400" : d.status === "AMARILLO" ? "text-yellow-400" : "text-emerald-400"}`}>
                      {d.ultimaSemana}
                    </span>
                    <span className="text-white/20">{d.semanaRef}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 font-mono text-white/40">{d.velocidadInicial}</td>
                <td className="px-4 py-2.5 font-mono text-white/40">{d.velocidadMadura}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2 min-w-[80px]">
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor[d.status]}`}
                        style={{ width: `${Math.min(d.brechaPct, 100)}%` }}
                      />
                    </div>
                    <span className={`font-mono text-xs w-8 ${d.status === "ROJO" ? "text-red-400" : d.status === "AMARILLO" ? "text-yellow-400" : "text-emerald-400"}`}>
                      {d.brechaPct}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-2.5 font-mono text-white/60">{d.margenPct.toFixed(1)}%</td>
                <td className={`px-4 py-2.5 font-mono ${d.acos > 0.15 ? "text-red-400" : d.acos > 0.08 ? "text-yellow-400" : "text-white/60"}`}>
                  {d.acosDisplay}
                </td>
                <td className={`px-4 py-2.5 font-mono ${d.stock === 0 ? "text-red-400" : "text-white/60"}`}>
                  {d.stock === 0 ? "Sin stock" : d.stock}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`border px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle[d.status]}`}>
                    {d.statusLabel}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1 max-w-[220px]">
                    {d.palancasSugeridas.slice(0, 2).map(p => (
                      <span key={p} className="text-xs bg-[#3b82f6]/10 text-[#3b82f6] border border-[#3b82f6]/20 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                        {p}
                      </span>
                    ))}
                    {d.palancasSugeridas.length > 2 && (
                      <span className="text-xs text-white/30">+{d.palancasSugeridas.length - 2}</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div className="p-8 text-center text-white/20 text-sm">Sin resultados para el filtro seleccionado</div>
        )}
      </div>
    </div>
  );
}
