"use client";
import { useEffect, useState, useCallback } from "react";

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

/* ─── Métricas del gráfico (como PG) ─────────────────────────────────────── */
const METRICS = [
  { key: "stock",        label: "Inventario",      color: "#3b82f6", get: (s: SerieWeek) => s.stock,                 fmt: (v: number) => v.toLocaleString("es-CL") },
  { key: "units",        label: "Ventas",          color: "#ef4444", get: (s: SerieWeek) => s.units,                 fmt: (v: number) => v.toLocaleString("es-CL") },
  { key: "ticket",       label: "Ticket Promedio", color: "#f59e0b", get: (s: SerieWeek) => s.averageTicketCents,    fmt: (v: number) => "$" + v.toLocaleString("es-CL") },
  { key: "margin",       label: "Margen %",        color: "#10b981", get: (s: SerieWeek) => s.marginPercentage,      fmt: (v: number) => v.toFixed(1) + "%" },
  { key: "ads",          label: "Publicidad %",    color: "#a855f7", get: (s: SerieWeek) => s.adSpendPercentage,     fmt: (v: number) => v.toFixed(1) + "%" },
] as const;

function fmtCLP(cents: number) { return "$" + Math.round(cents).toLocaleString("es-CL"); }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" }); }

/* ─── Gráfico multilínea (cada serie normalizada a su máximo) ────────────── */
function Desempeno({ series, active }: { series: SerieWeek[]; active: Set<string> }) {
  if (!series.length) return <div className="h-48 flex items-center justify-center text-white/20 text-sm">Sin datos de desempeño</div>;
  const W = 900, H = 260, PAD_L = 8, PAD_R = 8, PAD_T = 16, PAD_B = 26;
  const n = series.length;
  const x = (i: number) => PAD_L + (i * (W - PAD_L - PAD_R)) / Math.max(1, n - 1);
  const lineFor = (m: typeof METRICS[number]) => {
    const vals = series.map(m.get);
    const max = Math.max(1, ...vals);
    return series.map((s, i) => {
      const v = m.get(s);
      const y = H - PAD_B - (v / max) * (H - PAD_T - PAD_B);
      return `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ fontFamily: "monospace", fontSize: 10 }}>
      <rect x={PAD_L} y={PAD_T} width={W - PAD_L - PAD_R} height={H - PAD_T - PAD_B} fill="rgba(255,255,255,0.02)" rx="4" />
      {METRICS.filter(m => active.has(m.key)).map(m => (
        <path key={m.key} d={lineFor(m)} fill="none" stroke={m.color} strokeWidth="1.6" opacity="0.9" />
      ))}
      {series.map((s, i) => i % Math.ceil(n / 13) === 0 && (
        <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="9">{s.label}</text>
      ))}
    </svg>
  );
}

/* ─── Form palanca (igual que antes) ─────────────────────────────────────── */
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
    <form onSubmit={submit} className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
      <select value={tipo} onChange={e => setTipo(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white">
        {PALANCA_OPTIONS.map(o => <option key={o} value={o} className="bg-[#1a1a1a]">{o}</option>)}
      </select>
      <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white" />
      <button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5 rounded-lg">
        {loading ? "…" : "Registrar palanca"}
      </button>
    </form>
  );
}

/* ─── KPI card ───────────────────────────────────────────────────────────── */
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
            {/* KPIs estilo PG */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="Ventas Totales"  value={d ? d.totalUnits.toLocaleString("es-CL") : data.product.ventas ? fmtCLP(data.product.ventas) : "—"} />
              <Kpi label="Ticket Promedio" value={d ? fmtCLP(d.averageIncomeCents) : "—"} />
              <Kpi label="Margen"          value={`${(d ? d.marginPercentage : data.product.margenPct).toFixed(1)}%`} />
              <Kpi label="Publicidad"      value={d ? `${d.adSpendPercentage.toFixed(1)}%` : (data.product.acos ? `${(data.product.acos * 100).toFixed(1)}%` : "—")} />
            </div>

            {/* Desempeño */}
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
                    Sin detalle de desempeño aún. Corre el sync de velocidades (Datos / Sync) para traerlo desde ProfitGuard.
                  </div>}
            </div>

            {/* Palancas (valor agregado de la app) */}
            <div className="border-t border-white/5 pt-4 space-y-3">
              <p className="text-white/40 text-[10px] uppercase tracking-wider">Registrar palanca · {data.palancaLogs.length} registradas</p>
              {data.palancaLogs.length > 0 && (
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {data.palancaLogs.map(l => (
                    <div key={l.id} className="flex items-center gap-2 text-xs bg-white/[0.025] rounded-lg px-3 py-1.5 border border-white/5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                      <span className="text-white/80">{l.tipoPalanca}</span>
                      <span className="text-white/25">·</span>
                      <span className="text-white/40">{fmtDate(l.fechaInicio)}</span>
                      {l.comentario && <span className="text-white/30 truncate">— {l.comentario}</span>}
                    </div>
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
