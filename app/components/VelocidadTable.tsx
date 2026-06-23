"use client";
import { useMemo, useState } from "react";
import SkuDetailModal from "./SkuDetailModal";

export type RowStatus = "VERDE" | "AMARILLO" | "ROJO" | "SIN_STOCK" | null;

export interface VelocidadRow {
  sku:          string;
  nombre:       string;
  categoria:    string;
  velocidad:    number;
  promedio:     number;
  stockTotal:   number;
  asociaciones: number;
  weeks:        Array<{ number: number; year: number; units: number }>;
  // Diagnóstico (semáforo) — opcional
  status?:      RowStatus;
  statusLabel?: string;
  palancas?:    string[];
}

type SortKey = "velocidad" | "promedio" | "stockTotal" | "categoria" | "nombre" | "status" | string; // "w:2026-21"

const catColor: Record<string, string> = {
  A: "text-emerald-400", B: "text-[#3b82f6]", C: "text-yellow-400", D: "text-white/40",
};

const statusStyle: Record<string, string> = {
  VERDE:     "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  AMARILLO:  "bg-yellow-500/10  text-yellow-400  border-yellow-500/20",
  ROJO:      "bg-red-500/10     text-red-400     border-red-500/20",
  SIN_STOCK: "bg-white/5        text-white/40    border-white/10",
};

function fmt(n: number): string {
  return n.toLocaleString("es-CL");
}

export default function VelocidadTable({ rows }: { rows: VelocidadRow[] }) {
  const [search, setSearch]   = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("velocidad");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedSku, setSelectedSku] = useState<string | null>(null);

  const hasStatus = rows.some(r => r.status);

  // Columnas de semanas = unión de todas las semanas presentes, orden cronológico
  const weekCols = useMemo(() => {
    const set = new Map<string, { number: number; year: number }>();
    for (const r of rows) for (const w of r.weeks) set.set(`${w.year}-${w.number}`, { number: w.number, year: w.year });
    return [...set.values()].sort((a, b) => (a.year * 100 + a.number) - (b.year * 100 + b.number));
  }, [rows]);

  const weekVal = (r: VelocidadRow, y: number, n: number) =>
    r.weeks.find(w => w.year === y && w.number === n)?.units ?? 0;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter(r =>
      !q || r.sku.toLowerCase().includes(q) || r.nombre.toLowerCase().includes(q));
    const rank: Record<string, number> = { ROJO: 0, SIN_STOCK: 1, AMARILLO: 2, VERDE: 3 };
    const get = (r: VelocidadRow): number | string => {
      if (sortKey.startsWith("w:")) {
        const [y, n] = sortKey.slice(2).split("-").map(Number);
        return weekVal(r, y, n);
      }
      if (sortKey === "status") return rank[r.status ?? ""] ?? 9;
      return (r as unknown as Record<string, number | string>)[sortKey];
    };
    return [...filtered].sort((a, b) => {
      const va = get(a), vb = get(b);
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, search, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };
  const arrow = (k: SortKey) => sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const exportCsv = () => {
    const headers = ["SKU", "Producto", "Categoria", "Velocidad", ...weekCols.map(w => `W${w.number}`), "Promedio", "Stock Total"];
    const lines = visible.map(r => [
      r.sku, `"${r.nombre.replace(/"/g, "'")}"`, r.categoria, r.velocidad,
      ...weekCols.map(w => weekVal(r, w.year, w.number)), r.promedio, r.stockTotal,
    ].join(";"));
    const csv = "﻿" + [headers.join(";"), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "velocidad_de_ventas.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const th = "text-left px-3 py-2.5 text-white/30 font-medium uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-white/60 select-none";

  return (
    <div className="space-y-3">
      {selectedSku && <SkuDetailModal sku={selectedSku} onClose={() => setSelectedSku(null)} />}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text" placeholder="Buscar por nombre o SKU…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#3b82f6]/50 w-72"
        />
        <span className="text-xs text-white/20">{visible.length} productos</span>
        <button onClick={exportCsv}
          className="ml-auto text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 px-3 py-2 rounded-lg transition-colors">
          ⭳ Exportar CSV
        </button>
      </div>

      <div className="rounded-xl border border-white/5 bg-[#111111] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/5">
                <th className={th} onClick={() => toggleSort("nombre")}>Producto{arrow("nombre")}</th>
                <th className={th} onClick={() => toggleSort("categoria")}>Categoría{arrow("categoria")}</th>
                <th className={th} onClick={() => toggleSort("velocidad")}>Velocidad{arrow("velocidad")}</th>
                {weekCols.map(w => (
                  <th key={`${w.year}-${w.number}`} className={`${th} text-center`} onClick={() => toggleSort(`w:${w.year}-${w.number}`)}>
                    W{w.number}{arrow(`w:${w.year}-${w.number}`)}
                  </th>
                ))}
                <th className={th} onClick={() => toggleSort("promedio")}>Promedio{arrow("promedio")}</th>
                <th className={th} onClick={() => toggleSort("stockTotal")}>Stock Total{arrow("stockTotal")}</th>
                {hasStatus && <th className={th} onClick={() => toggleSort("status")}>Estado{arrow("status")}</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={r.sku} className={`${i < visible.length - 1 ? "border-b border-white/5" : ""} hover:bg-white/[0.02]`}>
                  <td className="px-3 py-2.5 max-w-[280px]">
                    <button onClick={() => setSelectedSku(r.sku)}
                      className="font-mono text-[#3b82f6] hover:text-indigo-300 hover:underline underline-offset-2 cursor-pointer">
                      {r.sku}
                    </button>
                    {r.asociaciones > 1 && <span className="text-white/30 ml-1">({r.asociaciones} productos)</span>}
                    <span className="block text-white/60 truncate">{r.nombre}</span>
                  </td>
                  <td className={`px-3 py-2.5 font-semibold ${catColor[r.categoria] ?? "text-white/40"}`}>{r.categoria || "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-white/80">{fmt(r.velocidad)}</td>
                  {weekCols.map(w => {
                    const v = weekVal(r, w.year, w.number);
                    return <td key={`${w.year}-${w.number}`} className="px-3 py-2.5 text-center font-mono text-white/60">{v ? fmt(v) : <span className="text-white/15">—</span>}</td>;
                  })}
                  <td className="px-3 py-2.5 font-mono text-white/70">{fmt(r.promedio)}</td>
                  <td className="px-3 py-2.5 font-mono text-white/50">{fmt(r.stockTotal)}</td>
                  {hasStatus && (
                    <td className="px-3 py-2.5">
                      {r.status
                        ? <span className={`border px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle[r.status]}`}>{r.statusLabel}</span>
                        : <span className="text-white/15">—</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && <div className="p-8 text-center text-white/20 text-sm">Sin resultados</div>}
        </div>
      </div>
    </div>
  );
}
