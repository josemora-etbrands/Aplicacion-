"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SkuDetailModal from "./SkuDetailModal";
import { VELOCIDADES_NUEVOS } from "@/app/lib/productosNuevos";

/** Madura efectiva: target manual si es producto nuevo seteado, si no el de PG. */
function maduraOf(r: { sku: string; velocidad: number }): number {
  return VELOCIDADES_NUEVOS[r.sku]?.madura ?? r.velocidad;
}
/** Inicial efectiva: target manual si existe, si no 1/4 de la madura. */
function inicialOf(r: { sku: string; velocidad: number }): number {
  const ov = VELOCIDADES_NUEVOS[r.sku];
  return ov ? ov.inicial : Math.round(r.velocidad / 4);
}
/** Color de la venta semanal vs metas: verde ≥ madura, amarillo ≥ inicial, blanco < inicial. */
function weekColor(v: number, inicial: number, madura: number): string {
  if (v <= 0) return "text-slate-300";
  if (madura > 0 && v >= madura) return "text-emerald-600 font-semibold";
  if (inicial > 0 && v >= inicial) return "text-amber-600";
  return "text-slate-700";
}

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
  // Filtro "Producto nuevo" (desde la DB)
  esNuevo?:      boolean;
  ordenLlegada?: number | null;
  // Marca manual "Listo"
  listo?:        boolean;
}

type SortKey = "velocidad" | "promedio" | "stockTotal" | "categoria" | "nombre" | "status" | string; // "w:2026-21"

const catColor: Record<string, string> = {
  A: "text-emerald-600", B: "text-blue-600", C: "text-amber-600", D: "text-slate-400",
};

const statusStyle: Record<string, string> = {
  VERDE:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  AMARILLO:  "bg-amber-50   text-amber-700   border-amber-200",
  ROJO:      "bg-red-50     text-red-700     border-red-200",
  SIN_STOCK: "bg-slate-100  text-slate-500   border-slate-200",
};

function fmt(n: number): string {
  return n.toLocaleString("es-CL");
}

export default function VelocidadTable({ rows }: { rows: VelocidadRow[] }) {
  const [search, setSearch]   = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("velocidad");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"off" | "todos" | "pendientes">("off");
  const enNuevos = filtro !== "off";
  const router = useRouter();

  const hasStatus = rows.some(r => r.status);
  const nuevosCount = useMemo(() => rows.filter(r => r.esNuevo).length, [rows]);

  // Marca "Listo" — estado local optimista (sin recargar toda la tabla)
  const [listoSet, setListoSet] = useState<Set<string>>(() => new Set(rows.filter(r => r.listo).map(r => r.sku)));
  const toggleListo = async (sku: string) => {
    const nuevo = !listoSet.has(sku);
    setListoSet(prev => { const s = new Set(prev); nuevo ? s.add(sku) : s.delete(sku); return s; });
    try {
      await fetch("/api/marcar-listo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku, listo: nuevo }) });
    } catch {
      // revertir si falla
      setListoSet(prev => { const s = new Set(prev); nuevo ? s.delete(sku) : s.add(sku); return s; });
    }
  };

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
    const filtered = rows.filter(r => {
      if (enNuevos && !r.esNuevo) return false;
      if (filtro === "pendientes" && listoSet.has(r.sku)) return false;
      if (q && !r.sku.toLowerCase().includes(q) && !r.nombre.toLowerCase().includes(q)) return false;
      return true;
    });
    // En los filtros de nuevos SIEMPRE se mantiene el orden de llegada.
    if (enNuevos) {
      return [...filtered].sort((a, b) => (a.ordenLlegada ?? 9e9) - (b.ordenLlegada ?? 9e9));
    }
    const rank: Record<string, number> = { ROJO: 0, SIN_STOCK: 1, AMARILLO: 2, VERDE: 3 };
    const get = (r: VelocidadRow): number | string => {
      if (sortKey.startsWith("w:")) {
        const [y, n] = sortKey.slice(2).split("-").map(Number);
        return weekVal(r, y, n);
      }
      if (sortKey === "status") return rank[r.status ?? ""] ?? 9;
      if (sortKey === "velocidad") return maduraOf(r);
      return (r as unknown as Record<string, number | string>)[sortKey];
    };
    return [...filtered].sort((a, b) => {
      const va = get(a), vb = get(b);
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, search, sortKey, sortDir, filtro, enNuevos, listoSet]);

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

  const th = "text-left px-3 py-2.5 text-slate-400 font-medium uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-slate-700 select-none bg-slate-50";

  // ── Gestión del filtro "Producto nuevo" (SKUs existentes del catálogo) ──
  const [addSku, setAddSku] = useState("");
  const [addMsg, setAddMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const agregarNuevo = async () => {
    const sku = addSku.trim();
    if (!sku) return;
    setBusy(true); setAddMsg(null);
    try {
      const res = await fetch("/api/productos-nuevos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku }) });
      const o = await res.json();
      if (!res.ok) { setAddMsg({ ok: false, text: o.error ?? "Error" }); return; }
      setAddMsg({ ok: true, text: o.yaEstaba ? `${sku} ya estaba en el filtro` : `✓ ${sku} agregado` });
      setAddSku(""); router.refresh();
    } catch { setAddMsg({ ok: false, text: "Error de red" }); }
    finally { setBusy(false); }
  };

  const quitarNuevo = async (sku: string) => {
    setBusy(true);
    try { await fetch(`/api/productos-nuevos?sku=${encodeURIComponent(sku)}`, { method: "DELETE" }); router.refresh(); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      {selectedSku && <SkuDetailModal sku={selectedSku} onClose={() => setSelectedSku(null)} />}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text" placeholder="Buscar por nombre o SKU…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 w-64 shadow-sm"
        />
        <button onClick={() => setFiltro("off")}
          className={`text-xs px-3 py-2 rounded-lg border transition-colors ${filtro === "off" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}>
          Todos
        </button>
        <button onClick={() => setFiltro("todos")}
          className={`text-xs px-3 py-2 rounded-lg border transition-colors ${filtro === "todos" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}>
          ✨ Producto nuevo ({nuevosCount})
        </button>
        <button onClick={() => setFiltro("pendientes")}
          className={`text-xs px-3 py-2 rounded-lg border transition-colors ${filtro === "pendientes" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}>
          ⏳ Nuevos pendientes ({rows.filter(r => r.esNuevo && !listoSet.has(r.sku)).length})
        </button>
        <span className="text-xs text-slate-400">{visible.length} productos</span>
        <button onClick={exportCsv}
          className="ml-auto text-xs bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 px-3 py-2 rounded-lg transition-colors shadow-sm">
          ⭳ Exportar CSV
        </button>
      </div>

      {/* Gestión del filtro "Producto nuevo" — agregar un SKU existente */}
      {enNuevos && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500">Agregar SKU existente al filtro:</span>
          <input
            type="text" placeholder="SKU…" value={addSku}
            onChange={e => setAddSku(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === "Enter") agregarNuevo(); }}
            className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-400 w-48 font-mono"
          />
          <button onClick={agregarNuevo} disabled={busy || !addSku.trim()}
            className="text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg">
            {busy ? "…" : "Agregar"}
          </button>
          {addMsg && <span className={`text-xs ${addMsg.ok ? "text-emerald-700" : "text-red-600"}`}>{addMsg.text}</span>}
          <span className="text-slate-400 text-[11px] ml-auto">Se agrega al final (orden de llegada).</span>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-210px)]">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr className="border-b border-slate-200">
                <th className={th} onClick={() => toggleSort("nombre")}>Producto{arrow("nombre")}</th>
                <th className={th} onClick={() => toggleSort("categoria")}>Categoría{arrow("categoria")}</th>
                <th className={th} onClick={() => toggleSort("velocidad")}>Velocidad Inicial{arrow("velocidad")}</th>
                <th className={th} onClick={() => toggleSort("velocidad")}>Velocidad Madura{arrow("velocidad")}</th>
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
              {visible.map((r) => (
                <tr key={r.sku} className={`border-b border-slate-100 last:border-0 transition-colors ${listoSet.has(r.sku) ? "bg-emerald-50/60 hover:bg-emerald-100/60" : "hover:bg-slate-50"}`}>
                  <td className="px-3 py-2.5 max-w-[280px]">
                    <button onClick={() => setSelectedSku(r.sku)}
                      className="font-mono text-orange-600 hover:text-orange-700 hover:underline underline-offset-2 cursor-pointer">
                      {r.sku}
                    </button>
                    {r.asociaciones > 1 && <span className="text-slate-400 ml-1">({r.asociaciones} productos)</span>}
                    {enNuevos && (
                      <button onClick={() => quitarNuevo(r.sku)} title="Quitar del filtro"
                        className="ml-2 text-slate-300 hover:text-red-500 text-xs">✕</button>
                    )}
                    <span className="block text-slate-600 truncate">{r.nombre}</span>
                  </td>
                  <td className={`px-3 py-2.5 font-semibold ${catColor[r.categoria] ?? "text-slate-400"}`}>{r.categoria || "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-400">{fmt(inicialOf(r))}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-800 font-medium">{fmt(maduraOf(r))}</td>
                  {weekCols.map(w => {
                    const v = weekVal(r, w.year, w.number);
                    return <td key={`${w.year}-${w.number}`} className={`px-3 py-2.5 text-center font-mono ${weekColor(v, inicialOf(r), maduraOf(r))}`}>{v ? fmt(v) : "—"}</td>;
                  })}
                  <td className="px-3 py-2.5 font-mono text-slate-600">{fmt(r.promedio)}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-400">{fmt(r.stockTotal)}</td>
                  {hasStatus && (
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {listoSet.has(r.sku)
                          ? <span className="border px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border-emerald-300">Listo</span>
                          : r.status
                            ? <span className={`border px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle[r.status]}`}>{r.statusLabel}</span>
                            : <span className="text-slate-300">—</span>}
                        <button onClick={() => toggleListo(r.sku)}
                          title={listoSet.has(r.sku) ? "Quitar Listo" : "Marcar Listo"}
                          className={`w-5 h-5 rounded-full border flex items-center justify-center text-[11px] leading-none transition-colors ${listoSet.has(r.sku) ? "bg-emerald-500 text-white border-emerald-500" : "border-slate-300 text-slate-300 hover:text-emerald-600 hover:border-emerald-400"}`}>
                          ✓
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && <div className="p-8 text-center text-slate-400 text-sm">Sin resultados</div>}
        </div>
      </div>
    </div>
  );
}
