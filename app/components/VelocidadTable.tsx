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
  if (v <= 0) return "text-white/15";
  if (madura > 0 && v >= madura) return "text-emerald-400";
  if (inicial > 0 && v >= inicial) return "text-yellow-400";
  return "text-white/80";
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
  const [soloNuevos, setSoloNuevos] = useState(false);
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
      if (soloNuevos && !r.esNuevo) return false;
      if (q && !r.sku.toLowerCase().includes(q) && !r.nombre.toLowerCase().includes(q)) return false;
      return true;
    });
    // Con el filtro "Producto nuevo" SIEMPRE se mantiene el orden de llegada.
    if (soloNuevos) {
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
  }, [rows, search, sortKey, sortDir, soloNuevos]);

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
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#3b82f6]/50 w-64"
        />
        <button onClick={() => setSoloNuevos(false)}
          className={`text-xs px-3 py-2 rounded-lg border transition-colors ${!soloNuevos ? "bg-[#3b82f6]/20 text-[#3b82f6] border-[#3b82f6]/30" : "text-white/30 border-white/10 hover:border-white/20"}`}>
          Todos
        </button>
        <button onClick={() => setSoloNuevos(true)}
          className={`text-xs px-3 py-2 rounded-lg border transition-colors ${soloNuevos ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "text-white/30 border-white/10 hover:border-white/20"}`}>
          ✨ Producto nuevo ({nuevosCount})
        </button>
        <span className="text-xs text-white/20">{visible.length} productos</span>
        <button onClick={exportCsv}
          className="ml-auto text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 px-3 py-2 rounded-lg transition-colors">
          ⭳ Exportar CSV
        </button>
      </div>

      {/* Gestión del filtro "Producto nuevo" — agregar un SKU existente */}
      {soloNuevos && (
        <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] p-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-white/40">Agregar SKU existente al filtro:</span>
          <input
            type="text" placeholder="SKU…" value={addSku}
            onChange={e => setAddSku(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === "Enter") agregarNuevo(); }}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50 w-48 font-mono"
          />
          <button onClick={agregarNuevo} disabled={busy || !addSku.trim()}
            className="text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg">
            {busy ? "…" : "Agregar"}
          </button>
          {addMsg && <span className={`text-xs ${addMsg.ok ? "text-emerald-400" : "text-red-400"}`}>{addMsg.text}</span>}
          <span className="text-white/20 text-[11px] ml-auto">Se agrega al final (orden de llegada).</span>
        </div>
      )}

      <div className="rounded-xl border border-white/5 bg-[#111111] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/5">
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
              {visible.map((r, i) => (
                <tr key={r.sku} className={`${i < visible.length - 1 ? "border-b border-white/5" : ""} hover:bg-white/[0.02]`}>
                  <td className="px-3 py-2.5 max-w-[280px]">
                    <button onClick={() => setSelectedSku(r.sku)}
                      className="font-mono text-[#3b82f6] hover:text-indigo-300 hover:underline underline-offset-2 cursor-pointer">
                      {r.sku}
                    </button>
                    {r.asociaciones > 1 && <span className="text-white/30 ml-1">({r.asociaciones} productos)</span>}
                    {soloNuevos && (
                      <button onClick={() => quitarNuevo(r.sku)} title="Quitar del filtro"
                        className="ml-2 text-white/20 hover:text-red-400 text-xs">✕</button>
                    )}
                    <span className="block text-white/60 truncate">{r.nombre}</span>
                  </td>
                  <td className={`px-3 py-2.5 font-semibold ${catColor[r.categoria] ?? "text-white/40"}`}>{r.categoria || "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-white/50">{fmt(inicialOf(r))}</td>
                  <td className="px-3 py-2.5 font-mono text-white/80">{fmt(maduraOf(r))}</td>
                  {weekCols.map(w => {
                    const v = weekVal(r, w.year, w.number);
                    return <td key={`${w.year}-${w.number}`} className={`px-3 py-2.5 text-center font-mono ${weekColor(v, inicialOf(r), maduraOf(r))}`}>{v ? fmt(v) : "—"}</td>;
                  })}
                  <td className="px-3 py-2.5 font-mono text-white/70">{fmt(r.promedio)}</td>
                  <td className="px-3 py-2.5 font-mono text-white/50">{fmt(r.stockTotal)}</td>
                  {hasStatus && (
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {listoSet.has(r.sku)
                          ? <span className="border px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-300 border-emerald-500/30">Listo</span>
                          : r.status
                            ? <span className={`border px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle[r.status]}`}>{r.statusLabel}</span>
                            : <span className="text-white/15">—</span>}
                        <button onClick={() => toggleListo(r.sku)}
                          title={listoSet.has(r.sku) ? "Quitar Listo" : "Marcar Listo"}
                          className={`w-5 h-5 rounded-full border flex items-center justify-center text-[11px] leading-none transition-colors ${listoSet.has(r.sku) ? "bg-emerald-500/30 text-emerald-300 border-emerald-500/50" : "border-white/15 text-white/25 hover:text-emerald-400 hover:border-emerald-500/40"}`}>
                          ✓
                        </button>
                      </div>
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
