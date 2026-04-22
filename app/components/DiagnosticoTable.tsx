"use client";
import { useState } from "react";
import type { ProductDiagnostico } from "@/app/lib/diagnostico";
import type { WeekKey } from "@/app/lib/weekUtils";

const statusStyle: Record<string, string> = {
  VERDE:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  AMARILLO: "bg-yellow-500/10  text-yellow-400  border-yellow-500/20",
  ROJO:     "bg-red-500/10     text-red-400     border-red-500/20",
};
const barColor: Record<string, string> = {
  VERDE: "bg-emerald-500", AMARILLO: "bg-yellow-500", ROJO: "bg-red-500",
};

function weekColor(value: number, d: ProductDiagnostico): string {
  if (value === 0)                 return "text-white/20";
  if (value >= d.velocidadMadura)  return "text-emerald-400";
  if (value >= d.velocidadInicial) return "text-yellow-400";
  return "text-red-400";
}

function fmtCLP(n: number): string {
  if (n === 0) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

interface Props {
  diagnosticos: ProductDiagnostico[];
  weekWindow: WeekKey[];
}

export default function DiagnosticoTable({ diagnosticos, weekWindow }: Props) {
  const [filter, setFilter] = useState<"ALL" | "ROJO" | "AMARILLO" | "VERDE">("ALL");
  const [search, setSearch] = useState("");

  const visible = diagnosticos.filter(d => {
    if (filter !== "ALL" && d.status !== filter) return false;
    if (search && !d.sku.toLowerCase().includes(search.toLowerCase()) &&
        !d.nombre.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Identify closed/current positions in weekWindow (last two)
  const closedKey  = weekWindow.length >= 2 ? weekWindow[weekWindow.length - 2] : weekWindow[weekWindow.length - 1];
  const currentKey = weekWindow[weekWindow.length - 1];

  function isClosedCol(wk: WeekKey)  { return closedKey  && wk.year === closedKey.year  && wk.week === closedKey.week; }
  function isCurrentCol(wk: WeekKey) { return currentKey && wk.year === currentKey.year && wk.week === currentKey.week; }

  return (
    <div className="rounded-xl border border-white/5 bg-[#111111] overflow-hidden">
      {/* Filters */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3 flex-wrap">
        <input
          type="text" placeholder="Buscar SKU o producto..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#3b82f6]/50 w-52"
        />
        {(["ALL","ROJO","AMARILLO","VERDE"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              filter === f
                ? f === "ROJO"     ? "bg-red-500/20 text-red-400 border-red-500/30"
                : f === "AMARILLO" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                : f === "VERDE"    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                : "bg-[#3b82f6]/20 text-[#3b82f6] border-[#3b82f6]/30"
                : "text-white/30 border-white/10 hover:border-white/20"
            }`}>
            {f === "ALL"       ? `Todos (${diagnosticos.length})`
            : f === "ROJO"     ? `🔴 ${diagnosticos.filter(d => d.status === "ROJO").length}`
            : f === "AMARILLO" ? `🟡 ${diagnosticos.filter(d => d.status === "AMARILLO").length}`
            :                    `🟢 ${diagnosticos.filter(d => d.status === "VERDE").length}`}
          </button>
        ))}
        <span className="text-xs text-white/20 ml-auto">{visible.length} SKUs</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-4 py-2.5 text-white/30 font-medium uppercase tracking-wider whitespace-nowrap">SKU</th>
              <th className="text-left px-4 py-2.5 text-white/30 font-medium uppercase tracking-wider whitespace-nowrap">Producto</th>
              <th className="text-left px-4 py-2.5 text-white/30 font-medium uppercase tracking-wider whitespace-nowrap">Margen %</th>
              <th className="text-left px-4 py-2.5 text-white/30 font-medium uppercase tracking-wider whitespace-nowrap">Publicidad</th>
              <th className="text-left px-4 py-2.5 text-white/30 font-medium uppercase tracking-wider whitespace-nowrap">Meta Inicial</th>
              <th className="text-left px-4 py-2.5 text-white/30 font-medium uppercase tracking-wider whitespace-nowrap">Meta Madura</th>
              {/* Dynamic week columns */}
              {weekWindow.map(wk => {
                const closed  = isClosedCol(wk);
                const current = isCurrentCol(wk);
                const label   = `W${wk.week}`;
                if (closed) return (
                  <th key={`${wk.year}-${wk.week}`}
                    className="text-center px-4 py-2.5 text-white/70 font-semibold uppercase tracking-wider whitespace-nowrap bg-white/[0.04] border-x border-white/10">
                    {label} ◈
                    <span className="block text-[9px] text-white/30 font-normal normal-case tracking-normal mt-0.5">sem. cerrada</span>
                  </th>
                );
                if (current) return (
                  <th key={`${wk.year}-${wk.week}`}
                    title="Semana en curso — No contemplada en diagnóstico"
                    className="text-center px-3 py-2.5 text-white/25 font-medium uppercase tracking-wider whitespace-nowrap bg-white/[0.015] border-r border-white/5 cursor-help">
                    {label}
                    <span className="block text-[9px] text-white/20 font-normal normal-case tracking-normal mt-0.5 italic">en curso</span>
                  </th>
                );
                return (
                  <th key={`${wk.year}-${wk.week}`}
                    className="text-center px-3 py-2.5 text-white/20 font-medium uppercase tracking-wider whitespace-nowrap bg-white/[0.02]">
                    {label}
                  </th>
                );
              })}
              {/* Análisis */}
              <th className="text-left px-4 py-2.5 text-white/30 font-medium uppercase tracking-wider whitespace-nowrap">% Madura</th>
              <th className="text-left px-4 py-2.5 text-white/30 font-medium uppercase tracking-wider whitespace-nowrap">Estado</th>
              <th className="text-left px-4 py-2.5 text-white/30 font-medium uppercase tracking-wider whitespace-nowrap">Palancas IA</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((d, i) => (
              <tr key={d.sku} className={`${i < visible.length - 1 ? "border-b border-white/5" : ""} hover:bg-white/[0.02] transition-colors`}>
                <td className="px-4 py-2.5">
                  <span className="font-mono text-[#3b82f6]">{d.sku}</span>
                </td>
                <td className="px-4 py-2.5 max-w-[160px]">
                  <span className="text-white/80 block truncate">{d.nombre}</span>
                </td>
                <td className={`px-4 py-2.5 font-mono ${d.margenPct < 0 ? "text-red-400" : d.margenPct < 15 ? "text-yellow-400" : "text-emerald-400"}`}>
                  {d.margenPct === 0 ? <span className="text-white/20">—</span> : `${d.margenPct.toFixed(1)}%`}
                </td>
                <td className="px-4 py-2.5 font-mono text-white/50">
                  {fmtCLP(d.publicidad)}
                </td>
                <td className="px-4 py-2.5 font-mono text-white/40">{d.velocidadInicial}</td>
                <td className="px-4 py-2.5 font-mono text-white/40">{d.velocidadMadura}</td>
                {/* Dynamic week cells */}
                {weekWindow.map(wk => {
                  const slot   = d.weeks.find(w => w.year === wk.year && w.week === wk.week);
                  const val    = slot?.value ?? 0;
                  const closed  = isClosedCol(wk);
                  const current = isCurrentCol(wk);
                  const color   = weekColor(val, d);
                  const display = val === 0 ? <span className={closed ? "text-white/25 font-normal" : "text-white/15"}>—</span> : val;

                  if (closed) return (
                    <td key={`${wk.year}-${wk.week}`}
                      className={`px-4 py-2.5 text-center font-mono font-bold bg-white/[0.04] border-x border-white/10 ${color}`}>
                      {display}
                    </td>
                  );
                  if (current) return (
                    <td key={`${wk.year}-${wk.week}`}
                      title="Semana en curso — No contemplada en diagnóstico"
                      className="px-3 py-2.5 text-center font-mono italic text-white/30 bg-white/[0.015] border-r border-white/5 cursor-help">
                      {display}
                    </td>
                  );
                  return (
                    <td key={`${wk.year}-${wk.week}`}
                      className={`px-3 py-2.5 text-center font-mono bg-white/[0.02] ${color}`}>
                      {display}
                    </td>
                  );
                })}
                {/* % Madura */}
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2 min-w-[72px]">
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${barColor[d.status]}`} style={{ width: `${Math.min(d.brechaPct, 100)}%` }} />
                    </div>
                    <span className={`font-mono text-xs w-8 ${d.status === "ROJO" ? "text-red-400" : d.status === "AMARILLO" ? "text-yellow-400" : "text-emerald-400"}`}>
                      {d.brechaPct}%
                    </span>
                  </div>
                </td>
                {/* Estado */}
                <td className="px-4 py-2.5">
                  <span className={`border px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle[d.status]}`}>
                    {d.statusLabel}
                  </span>
                </td>
                {/* Palancas IA */}
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                    {d.palancasSugeridas.slice(0, 2).map(p => (
                      <span key={p} className="text-xs bg-[#3b82f6]/10 text-[#3b82f6] border border-[#3b82f6]/20 px-1.5 py-0.5 rounded-full whitespace-nowrap">{p}</span>
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
