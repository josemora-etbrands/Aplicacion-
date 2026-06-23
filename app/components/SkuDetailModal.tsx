"use client";
import { useEffect, useState, useCallback, useRef } from "react";

/* ─── Tipos ──────────────────────────────────────────────────────────────── */
interface PalancaLog { id: string; tipoPalanca: string; fechaInicio: string; comentario: string | null; createdAt: string; }
interface ProductDetail {
  sku: string; nombre: string; categoria?: string | null;
  margenPct: number; stock: number; publicidad: number; ingresos: number; ventas: number; acos: number;
}
interface SerieWeek {
  label: string; units: number; stock: number;
  averageTicketCents: number; marginPercentage: number; adSpendPercentage: number;
}
interface Detalle {
  totalUnits: number; averageIncomeCents: number; marginPercentage: number; adSpendPercentage: number;
  series: SerieWeek[];
}
interface SkuData { product: ProductDetail; detalle: Detalle | null; palancaLogs: PalancaLog[]; }

const PALANCA_OPTIONS = [
  "Aplicar Relámpago", "Subir el gasto en publicidad", "Disminuir inversión en ads",
  "Oportunidades SEO", "Oportunidad ficha técnica", "Oportunidades imágenes", "Profundizar DOD",
  "Oportunidades logísticas FULL/FLEX", "Descuento temporal", "Mejora de título", "Otra",
];

const METRICS = [
  { key: "stock",  label: "Inventario",      color: "#22d3ee", get: (s: SerieWeek) => s.stock,              fmt: (v: number) => v.toLocaleString("es-CL") },
  { key: "units",  label: "Ventas",          color: "#ef4444", get: (s: SerieWeek) => s.units,              fmt: (v: number) => v.toLocaleString("es-CL") },
  { key: "ticket", label: "Ticket Promedio", color: "#f59e0b", get: (s: SerieWeek) => s.averageTicketCents, fmt: (v: number) => "$" + Math.round(v).toLocaleString("es-CL") },
  { key: "margin", label: "Margen %",        color: "#10b981", get: (s: SerieWeek) => s.marginPercentage,   fmt: (v: number) => v.toFixed(1) + "%" },
  { key: "ads",    label: "Publicidad %",    color: "#a855f7", get: (s: SerieWeek) => s.adSpendPercentage,  fmt: (v: number) => v.toFixed(1) + "%" },
  // Publicidad en $ (derivada): % gasto × ingreso semanal (unidades × ticket promedio).
  { key: "adAmount", label: "Publicidad $",  color: "#ec4899", get: (s: SerieWeek) => Math.round((s.adSpendPercentage / 100) * s.units * s.averageTicketCents), fmt: (v: number) => "$" + Math.round(v).toLocaleString("es-CL") },
] as const;

function fmtCLP(cents: number) { return "$" + Math.round(cents).toLocaleString("es-CL"); }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" }); }
function isoWeek(dateStr: string): number {
  const d = new Date(dateStr);
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
  const ys = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil((((dt.getTime() - ys.getTime()) / 86400000) + 1) / 7);
}

/* Impacto en unidades: promedio de hasta 4 semanas después vs 4 antes de la palanca. */
function impactoUnidades(fechaInicio: string, series: SerieWeek[]): number | null {
  if (!series.length) return null;
  const wk = isoWeek(fechaInicio);
  const idx = series.findIndex(s => s.label === "W" + wk);
  if (idx < 0) return null;
  const before = series.slice(Math.max(0, idx - 4), idx).map(s => s.units);
  const after  = series.slice(idx + 1, idx + 5).map(s => s.units);
  if (!before.length || !after.length) return null;
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  return Math.round(avg(after) - avg(before));
}

/* ─── Gráfico de desempeño con tooltip ───────────────────────────────────── */
function Desempeno({ series, active }: { series: SerieWeek[]; active: Set<string> }) {
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  if (!series.length) return <div className="h-48 flex items-center justify-center text-white/20 text-sm">Sin datos de desempeño</div>;

  const W = 900, H = 260, PAD_L = 8, PAD_R = 8, PAD_T = 16, PAD_B = 26;
  const n = series.length;
  const x = (i: number) => PAD_L + (i * (W - PAD_L - PAD_R)) / Math.max(1, n - 1);
  const maxOf = (m: typeof METRICS[number]) => Math.max(1, ...series.map(m.get));
  const lineFor = (m: typeof METRICS[number]) => {
    const max = maxOf(m);
    return series.map((s, i) => {
      const y = H - PAD_B - (m.get(s) / max) * (H - PAD_T - PAD_B);
      return `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  };

  const onMove = (e: React.MouseEvent) => {
    const el = wrapRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHover(Math.round(frac * (n - 1)));
  };

  const hx = hover != null ? (x(hover) / W) * 100 : 0;
  const tipLeft = hover != null ? Math.min(82, Math.max(2, hx)) : 0;

  return (
    <div ref={wrapRef} className="relative" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ fontFamily: "monospace", fontSize: 10 }}>
        <rect x={PAD_L} y={PAD_T} width={W - PAD_L - PAD_R} height={H - PAD_T - PAD_B} fill="rgba(255,255,255,0.02)" rx="4" />
        {METRICS.filter(m => active.has(m.key)).map(m => (
          <path key={m.key} d={lineFor(m)} fill="none" stroke={m.color} strokeWidth="1.6" opacity="0.9" />
        ))}
        {hover != null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD_T} y2={H - PAD_B} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
            {METRICS.filter(m => active.has(m.key)).map(m => {
              const cy = H - PAD_B - (m.get(series[hover]) / maxOf(m)) * (H - PAD_T - PAD_B);
              return <circle key={m.key} cx={x(hover)} cy={cy} r="3" fill={m.color} />;
            })}
          </>
        )}
        {series.map((s, i) => i % Math.ceil(n / 13) === 0 && (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="9">{s.label}</text>
        ))}
      </svg>
      {hover != null && (
        <div className="absolute top-2 pointer-events-none rounded-lg border border-white/10 bg-[#0a0a0a]/95 px-3 py-2 text-[11px] shadow-xl"
          style={{ left: `${tipLeft}%` }}>
          <p className="text-white/70 font-semibold mb-1">{series[hover].label}</p>
          {METRICS.map(m => (
            <div key={m.key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-white/40">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: m.color }} />{m.label}
              </span>
              <span className="font-mono text-white/80">{m.fmt(m.get(series[hover]))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Form palanca (con comentario) ──────────────────────────────────────── */
function AddPalancaForm({ sku, onAdded }: { sku: string; onAdded: () => void }) {
  const [tipo, setTipo] = useState(PALANCA_OPTIONS[0]);
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true);
    try {
      await fetch(`/api/sku/${sku}/palanca-log`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipoPalanca: tipo, fechaInicio: fecha, comentario: comment || undefined }) });
      setComment(""); onAdded();
    } finally { setLoading(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <select value={tipo} onChange={e => setTipo(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white">
          {PALANCA_OPTIONS.map(o => <option key={o} value={o} className="bg-[#1a1a1a]">{o}</option>)}
        </select>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white" />
      </div>
      <input type="text" value={comment} onChange={e => setComment(e.target.value)} placeholder="Comentario (opcional) — ej: subimos presupuesto a $15k/día"
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/20" />
      <button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5 rounded-lg">
        {loading ? "Guardando…" : "Registrar palanca"}
      </button>
    </form>
  );
}

/* ─── Fila de palanca (con editar/eliminar + impacto) ────────────────────── */
function PalancaRow({ sku, log, impacto, onChange }: { sku: string; log: PalancaLog; impacto: number | null; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [tipo, setTipo] = useState(log.tipoPalanca);
  const [fecha, setFecha] = useState(log.fechaInicio.slice(0, 10));
  const [comment, setComment] = useState(log.comentario ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await fetch(`/api/sku/${sku}/palanca-log`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: log.id, tipoPalanca: tipo, fechaInicio: fecha, comentario: comment }) });
      setEditing(false); onChange();
    } finally { setBusy(false); }
  };
  const del = async () => {
    if (!confirm("¿Eliminar esta palanca?")) return;
    setBusy(true);
    try { await fetch(`/api/sku/${sku}/palanca-log?id=${log.id}`, { method: "DELETE" }); onChange(); }
    finally { setBusy(false); }
  };

  if (editing) {
    return (
      <div className="bg-white/[0.03] rounded-lg px-3 py-2 border border-indigo-500/30 space-y-2">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <select value={tipo} onChange={e => setTipo(e.target.value)} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white">
            {PALANCA_OPTIONS.map(o => <option key={o} value={o} className="bg-[#1a1a1a]">{o}</option>)}
          </select>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white" />
        </div>
        <input type="text" value={comment} onChange={e => setComment(e.target.value)} placeholder="Comentario"
          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder-white/20" />
        <div className="flex gap-2">
          <button onClick={save} disabled={busy} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1 rounded">{busy ? "…" : "Guardar"}</button>
          <button onClick={() => setEditing(false)} className="text-white/40 hover:text-white/70 text-xs px-2">Cancelar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-3 bg-white/[0.025] rounded-lg px-3 py-2 border border-white/5">
      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-white/80 text-xs font-medium">{log.tipoPalanca}</span>
          <span className="text-white/25 text-xs">·</span>
          <span className="text-white/40 text-xs">{fmtDate(log.fechaInicio)}</span>
        </div>
        {log.comentario && <p className="text-white/40 text-xs mt-0.5">{log.comentario}</p>}
      </div>
      {/* Impacto en unidades */}
      {impacto != null && (
        <span className={`text-xs font-mono whitespace-nowrap ${impacto > 0 ? "text-emerald-400" : impacto < 0 ? "text-red-400" : "text-white/40"}`}>
          {impacto > 0 ? `▲ aumentó en ${impacto} uds` : impacto < 0 ? `▼ bajó en ${Math.abs(impacto)} uds` : "= sin cambio"}
        </span>
      )}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={() => setEditing(true)} className="text-white/30 hover:text-indigo-300 text-xs" title="Editar">✎</button>
        <button onClick={del} disabled={busy} className="text-white/30 hover:text-red-400 text-xs" title="Eliminar">✕</button>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/5 p-4">
      <p className="text-white/30 text-[10px] uppercase tracking-wider">{label}</p>
      <p className="text-white text-xl font-semibold font-mono mt-1">{value}</p>
    </div>
  );
}

/* ─── Modal ──────────────────────────────────────────────────────────────── */
export default function SkuDetailModal({ sku, onClose }: { sku: string; onClose: () => void }) {
  const [data, setData] = useState<SkuData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Set<string>>(new Set(["stock", "units"]));

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/sku/${sku}`);
      if (!res.ok) throw new Error("No se pudo cargar el producto");
      setData(await res.json());
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }, [sku]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const toggle = (k: string) => setActive(prev => { const s = new Set(prev); s.has(k) ? s.delete(k) : s.add(k); return s; });
  const d = data?.detalle ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto py-8 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-4xl bg-[#111111] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between px-6 py-4 border-b border-white/5">
          <div>
            <p className="text-white/40 text-xs font-mono mb-0.5">{sku}{data?.product.categoria ? ` · Cat ${data.product.categoria}` : ""}</p>
            <h2 className="text-white text-base font-semibold leading-snug">{data?.product.nombre ?? "Cargando…"}</h2>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 text-lg leading-none ml-2">✕</button>
        </div>

        {loading && <div className="p-12 flex justify-center"><div className="w-6 h-6 border-2 border-indigo-500/50 border-t-indigo-500 rounded-full animate-spin" /></div>}
        {error && <div className="p-8 text-center text-red-400 text-sm">{error}</div>}

        {!loading && !error && data && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Kpi label="Ventas Totales"  value={d ? d.totalUnits.toLocaleString("es-CL") : "—"} />
              <Kpi label="Ticket Promedio" value={d ? fmtCLP(d.averageIncomeCents) : "—"} />
              <Kpi label="Margen"          value={`${(d ? d.marginPercentage : data.product.margenPct).toFixed(1)}%`} />
              <Kpi label="Publicidad %"    value={d ? `${d.adSpendPercentage.toFixed(1)}%` : "—"} />
              <Kpi label="Publicidad $"    value={d ? fmtCLP(d.series.reduce((s, w) => s + (w.adSpendPercentage / 100) * w.units * w.averageTicketCents, 0)) : "—"} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">Desempeño</p>
                <div className="flex flex-wrap gap-1.5">
                  {METRICS.map(m => (
                    <button key={m.key} onClick={() => toggle(m.key)}
                      className={`text-[11px] px-2 py-1 rounded-lg border transition-colors flex items-center gap-1.5 ${active.has(m.key) ? "border-white/20 bg-white/5 text-white/80" : "border-white/5 text-white/30"}`}>
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: m.color, opacity: active.has(m.key) ? 1 : 0.3 }} />
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              {d
                ? <Desempeno series={d.series} active={active} />
                : <div className="h-32 flex items-center justify-center text-white/25 text-xs text-center px-4">
                    Sin detalle de desempeño aún. Corre el sync de velocidades (Datos / Sync).
                  </div>}
            </div>

            <div className="border-t border-white/5 pt-4 space-y-3">
              <p className="text-white/40 text-[10px] uppercase tracking-wider">Palancas · {data.palancaLogs.length} registradas</p>
              {data.palancaLogs.length > 0 && (
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {[...data.palancaLogs]
                    .sort((a, b) => new Date(b.fechaInicio).getTime() - new Date(a.fechaInicio).getTime())
                    .map(l => (
                      <PalancaRow key={l.id} sku={sku} log={l}
                        impacto={d ? impactoUnidades(l.fechaInicio, d.series) : null}
                        onChange={load} />
                    ))}
                </div>
              )}
              <AddPalancaForm sku={sku} onAdded={load} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
