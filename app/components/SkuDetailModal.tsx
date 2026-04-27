"use client";
import { useEffect, useState, useCallback } from "react";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface WeeklySalePoint { year: number; week: number; value: number }
interface PalancaLog {
  id: string; tipoPalanca: string;
  fechaInicio: string; comentario: string | null; createdAt: string;
}
interface ProductDetail {
  sku: string; nombre: string;
  velocidadInicial: number; velocidadMadura: number;
  margenPct: number; stock: number;
  publicidad: number; ingresos: number; ventas: number;
}
interface SkuData {
  product:     ProductDetail;
  weeklySales: WeeklySalePoint[];
  palancaLogs: PalancaLog[];
}

/* ─── Constants ─────────────────────────────────────────────────────────── */
const PALANCA_OPTIONS = [
  "Aplicar Relámpago",
  "Subir el gasto en publicidad",
  "Disminuir inversión en ads",
  "Oportunidades SEO",
  "Oportunidad ficha técnica",
  "Oportunidades imágenes",
  "Profundizar DOD",
  "Oportunidades logísticas FULL/FLEX",
  "Descuento temporal",
  "Mejora de título",
  "Optimización de precios",
  "Campaña de coupons",
  "Otra",
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function dateToISOWeek(dateStr: string): { year: number; week: number } {
  const d = new Date(dateStr);
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: dt.getUTCFullYear(), week };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function avg(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/* ─── SVG Bar Chart ──────────────────────────────────────────────────────── */
function SalesChart({
  sales, palancaLogs, velocidadInicial, velocidadMadura,
}: {
  sales: WeeklySalePoint[];
  palancaLogs: PalancaLog[];
  velocidadInicial: number;
  velocidadMadura: number;
}) {
  const sorted = [...sales].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.week - b.week,
  );

  if (!sorted.length) return (
    <div className="h-40 flex items-center justify-center text-white/20 text-sm">
      Sin historial de ventas
    </div>
  );

  /* build palanca-week set */
  const palancaWeeks = new Set(
    palancaLogs.map(l => {
      const { year, week } = dateToISOWeek(l.fechaInicio);
      return `${year}-${week}`;
    }),
  );

  const W = 48;        /* bar width */
  const GAP = 8;       /* gap between bars */
  const STEP = W + GAP;
  const CHART_H = 180;
  const PAD_L = 36;
  const PAD_R = 16;
  const PAD_T = 20;    /* room for palanca flag above tallest bar */
  const PAD_B = 28;
  const maxVal = Math.max(velocidadMadura * 1.2, ...sorted.map(s => s.value), 1);
  const totalW = PAD_L + sorted.length * STEP - GAP + PAD_R;

  const scaleY = (v: number) => CHART_H - PAD_B - (v / maxVal) * (CHART_H - PAD_T - PAD_B);
  const barH   = (v: number) => Math.max(2, (v / maxVal) * (CHART_H - PAD_T - PAD_B));

  /* Ref line heights */
  const yInicial = scaleY(velocidadInicial);
  const yMadura  = scaleY(velocidadMadura);

  function barColor(v: number) {
    if (v >= velocidadMadura)  return "#10b981"; /* emerald */
    if (v >= velocidadInicial) return "#f59e0b"; /* yellow  */
    return "#ef4444";                            /* red     */
  }

  return (
    <svg
      viewBox={`0 0 ${totalW} ${CHART_H}`}
      className="w-full"
      style={{ fontFamily: "monospace", fontSize: 10 }}
    >
      {/* Grid background */}
      <rect x={PAD_L} y={PAD_T} width={totalW - PAD_L - PAD_R}
        height={CHART_H - PAD_T - PAD_B} fill="rgba(255,255,255,0.02)" rx="4" />

      {/* Ref lines */}
      <line x1={PAD_L} x2={totalW - PAD_R} y1={yInicial} y2={yInicial}
        stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
      <text x={PAD_L - 4} y={yInicial + 4} textAnchor="end"
        fill="#f59e0b" opacity="0.7" fontSize="9">{velocidadInicial}</text>

      <line x1={PAD_L} x2={totalW - PAD_R} y1={yMadura} y2={yMadura}
        stroke="#10b981" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
      <text x={PAD_L - 4} y={yMadura + 4} textAnchor="end"
        fill="#10b981" opacity="0.7" fontSize="9">{velocidadMadura}</text>

      {/* Bars */}
      {sorted.map((s, i) => {
        const x = PAD_L + i * STEP;
        const bH = barH(s.value);
        const y = CHART_H - PAD_B - bH;
        const key = `${s.year}-${s.week}`;
        const hasPalanca = palancaWeeks.has(key);
        const color = barColor(s.value);
        const label = `W${s.week}`;

        return (
          <g key={key}>
            {/* bar */}
            <rect x={x} y={y} width={W} height={bH}
              fill={color} opacity="0.8" rx="2" />

            {/* palanca flag */}
            {hasPalanca && (
              <g>
                <line x1={x + W / 2} x2={x + W / 2}
                  y1={y - 12} y2={y - 2}
                  stroke="#818cf8" strokeWidth="1.5" />
                <circle cx={x + W / 2} cy={y - 14} r="4"
                  fill="#818cf8" />
                <text x={x + W / 2} y={y - 13} textAnchor="middle"
                  fill="white" fontSize="6" fontWeight="bold">P</text>
              </g>
            )}

            {/* value label inside bar (if room) */}
            {bH > 20 && (
              <text x={x + W / 2} y={y + bH - 6} textAnchor="middle"
                fill="white" opacity="0.9" fontSize="10" fontWeight="600">
                {s.value}
              </text>
            )}
            {bH <= 20 && s.value > 0 && (
              <text x={x + W / 2} y={y - 3} textAnchor="middle"
                fill={color} fontSize="9">
                {s.value}
              </text>
            )}

            {/* week label */}
            <text x={x + W / 2} y={CHART_H - 6} textAnchor="middle"
              fill="rgba(255,255,255,0.35)" fontSize="10">{label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ─── Impact Analysis ────────────────────────────────────────────────────── */
function ImpactAnalysis({
  sales, palancaLogs,
}: {
  sales: WeeklySalePoint[];
  palancaLogs: PalancaLog[];
}) {
  if (!palancaLogs.length) return (
    <p className="text-white/30 text-xs">Aún no hay palancas registradas para calcular impacto.</p>
  );

  const sorted = [...sales].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.week - b.week,
  );

  /* most recent palanca */
  const recent = [...palancaLogs].sort(
    (a, b) => new Date(b.fechaInicio).getTime() - new Date(a.fechaInicio).getTime(),
  )[0];

  const { year: pYear, week: pWeek } = dateToISOWeek(recent.fechaInicio);
  const palancaOrder = pYear * 100 + pWeek;

  const before = sorted
    .filter(s => s.year * 100 + s.week < palancaOrder)
    .slice(-4)
    .map(s => s.value);

  const after = sorted
    .filter(s => s.year * 100 + s.week >= palancaOrder)
    .slice(0, 4)
    .map(s => s.value);

  const avgBefore = avg(before);
  const avgAfter  = avg(after);
  const delta     = avgAfter - avgBefore;
  const deltaPct  = avgBefore > 0 ? ((delta / avgBefore) * 100) : null;

  const sign   = delta >= 0 ? "+" : "";
  const color  = delta >= 0 ? "text-emerald-400" : "text-red-400";
  const pctStr = deltaPct !== null ? `${sign}${deltaPct.toFixed(1)}%` : "N/A";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-white/40 text-xs">Última palanca:</span>
        <span className="text-indigo-400 text-xs font-medium">{recent.tipoPalanca}</span>
        <span className="text-white/25 text-xs">·</span>
        <span className="text-white/40 text-xs">{fmtDate(recent.fechaInicio)}</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Before */}
        <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
          <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1">
            Prom. previo ({before.length} sem.)
          </p>
          <p className="text-white/70 text-xl font-mono font-semibold">
            {before.length ? avgBefore.toFixed(1) : "—"}
          </p>
          <p className="text-white/25 text-[10px] mt-0.5">unid/semana</p>
        </div>
        {/* After */}
        <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
          <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1">
            Prom. posterior ({after.length} sem.)
          </p>
          <p className="text-white/70 text-xl font-mono font-semibold">
            {after.length ? avgAfter.toFixed(1) : "—"}
          </p>
          <p className="text-white/25 text-[10px] mt-0.5">unid/semana</p>
        </div>
        {/* Delta */}
        <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
          <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1">Variación</p>
          <p className={`text-xl font-mono font-semibold ${
            before.length && after.length ? color : "text-white/30"
          }`}>
            {before.length && after.length ? pctStr : "—"}
          </p>
          <p className={`text-[10px] mt-0.5 ${
            before.length && after.length ? color : "text-white/25"
          }`}>
            {before.length && after.length ? `${sign}${delta.toFixed(1)} unid/sem` : "insuf. datos"}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Add Palanca Form ───────────────────────────────────────────────────── */
function AddPalancaForm({
  sku, onAdded,
}: {
  sku: string;
  onAdded: () => void;
}) {
  const [tipo,     setTipo]     = useState(PALANCA_OPTIONS[0]);
  const [fecha,    setFecha]    = useState(() => new Date().toISOString().slice(0, 10));
  const [comment,  setComment]  = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sku/${sku}/palanca-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipoPalanca: tipo,
          fechaInicio: fecha,
          comentario:  comment || undefined,
        }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      setComment("");
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-white/40 text-[10px] uppercase tracking-wider mb-1">
            Tipo de palanca
          </label>
          <select
            value={tipo} onChange={e => setTipo(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50"
          >
            {PALANCA_OPTIONS.map(o => (
              <option key={o} value={o} className="bg-[#1a1a1a]">{o}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-white/40 text-[10px] uppercase tracking-wider mb-1">
            Fecha de inicio
          </label>
          <input
            type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            required
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50"
          />
        </div>
      </div>
      <div>
        <label className="block text-white/40 text-[10px] uppercase tracking-wider mb-1">
          Comentario (opcional)
        </label>
        <input
          type="text" value={comment} onChange={e => setComment(e.target.value)}
          placeholder="Ej: Subimos presupuesto de $5k a $15k diarios"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/50"
        />
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <button
        type="submit" disabled={loading}
        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors"
      >
        {loading ? "Guardando…" : "Registrar palanca"}
      </button>
    </form>
  );
}

/* ─── Main Modal ─────────────────────────────────────────────────────────── */
export default function SkuDetailModal({
  sku, onClose,
}: {
  sku: string;
  onClose: () => void;
}) {
  const [data,    setData]    = useState<SkuData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sku/${sku}`);
      if (!res.ok) throw new Error("No se pudo cargar el producto");
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [sku]);

  useEffect(() => { load(); }, [load]);

  /* close on Escape */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  async function deletePalanca(id: string) {
    await fetch(`/api/sku/${sku}/palanca-log?id=${id}`, { method: "DELETE" });
    await load();
  }

  /* ─── Render ─────────────────────────────────────────────────────────── */
  return (
    /* backdrop */
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto py-8 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-3xl bg-[#111111] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

        {/* ─── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-white/5">
          <div>
            <p className="text-white/40 text-xs font-mono mb-0.5">{sku}</p>
            <h2 className="text-white text-base font-semibold leading-snug">
              {data?.product.nombre ?? "Cargando…"}
            </h2>
          </div>
          <div className="flex items-center gap-4 mt-1">
            {data && (
              <>
                <span className={`text-xs font-mono ${
                  data.product.stock <= 0  ? "text-red-400"    :
                  data.product.stock <= 5  ? "text-yellow-400" :
                  "text-white/50"
                }`}>
                  Stock: {data.product.stock}
                </span>
                <span className={`text-xs font-mono ${
                  data.product.margenPct < 0   ? "text-red-400"     :
                  data.product.margenPct < 15  ? "text-yellow-400"  :
                  "text-emerald-400"
                }`}>
                  Margen: {data.product.margenPct.toFixed(1)}%
                </span>
              </>
            )}
            <button onClick={onClose}
              className="text-white/30 hover:text-white/70 transition-colors ml-2 text-lg leading-none">
              ✕
            </button>
          </div>
        </div>

        {/* ─── Body ─────────────────────────────────────────────────────── */}
        {loading && (
          <div className="p-12 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-indigo-500/50 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="p-8 text-center text-red-400 text-sm">{error}</div>
        )}

        {!loading && !error && data && (
          <div className="p-6 space-y-6">

            {/* ── Metas ─────────────────────────────────────────────────── */}
            <div className="flex gap-4 text-xs">
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
                <p className="text-yellow-400/60 text-[10px] uppercase tracking-wider">Meta Inicial</p>
                <p className="text-yellow-400 font-mono font-semibold text-base mt-0.5">
                  {data.product.velocidadInicial}
                  <span className="text-yellow-400/50 font-normal text-xs ml-1">unid/sem</span>
                </p>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                <p className="text-emerald-400/60 text-[10px] uppercase tracking-wider">Meta Madura</p>
                <p className="text-emerald-400 font-mono font-semibold text-base mt-0.5">
                  {data.product.velocidadMadura}
                  <span className="text-emerald-400/50 font-normal text-xs ml-1">unid/sem</span>
                </p>
              </div>
              <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2">
                <p className="text-indigo-400/60 text-[10px] uppercase tracking-wider">Palancas</p>
                <p className="text-indigo-400 font-mono font-semibold text-base mt-0.5">
                  {data.palancaLogs.length}
                  <span className="text-indigo-400/50 font-normal text-xs ml-1">registradas</span>
                </p>
              </div>
            </div>

            {/* ── Bar Chart ─────────────────────────────────────────────── */}
            <div>
              <p className="text-white/40 text-[10px] uppercase tracking-wider mb-3">
                Historial de ventas semanales
                {data.palancaLogs.length > 0 && (
                  <span className="ml-2 text-indigo-400">
                    · <span className="inline-block w-2 h-2 bg-indigo-400 rounded-full mr-1 align-middle" />
                    Palanca aplicada
                  </span>
                )}
              </p>
              <div className="overflow-x-auto">
                <div style={{ minWidth: `${Math.max(400, data.weeklySales.length * 56 + 52)}px` }}>
                  <SalesChart
                    sales={data.weeklySales}
                    palancaLogs={data.palancaLogs}
                    velocidadInicial={data.product.velocidadInicial}
                    velocidadMadura={data.product.velocidadMadura}
                  />
                </div>
              </div>
            </div>

            {/* ── Impact Analysis ───────────────────────────────────────── */}
            <div>
              <p className="text-white/40 text-[10px] uppercase tracking-wider mb-3">Impacto de palancas</p>
              <ImpactAnalysis
                sales={data.weeklySales}
                palancaLogs={data.palancaLogs}
              />
            </div>

            {/* ── Palanca Timeline ──────────────────────────────────────── */}
            <div>
              <p className="text-white/40 text-[10px] uppercase tracking-wider mb-3">
                Registro de palancas ({data.palancaLogs.length})
              </p>

              {data.palancaLogs.length === 0 ? (
                <p className="text-white/25 text-xs">Sin palancas registradas aún.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {[...data.palancaLogs]
                    .sort((a, b) =>
                      new Date(b.fechaInicio).getTime() - new Date(a.fechaInicio).getTime(),
                    )
                    .map(log => {
                      const { week } = dateToISOWeek(log.fechaInicio);
                      return (
                        <div key={log.id}
                          className="flex items-start gap-3 bg-white/[0.025] rounded-lg px-3 py-2 border border-white/5 group">
                          <div className="mt-0.5">
                            <div className="w-2 h-2 rounded-full bg-indigo-400 mt-1" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-white/80 text-xs font-medium">{log.tipoPalanca}</span>
                              <span className="text-white/25 text-xs">·</span>
                              <span className="text-indigo-400/70 text-xs font-mono">W{week}</span>
                              <span className="text-white/25 text-xs">·</span>
                              <span className="text-white/30 text-xs">{fmtDate(log.fechaInicio)}</span>
                            </div>
                            {log.comentario && (
                              <p className="text-white/40 text-xs mt-0.5 truncate">{log.comentario}</p>
                            )}
                          </div>
                          <button
                            onClick={() => deletePalanca(log.id)}
                            className="text-white/15 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-xs shrink-0 mt-0.5"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* ── Add Palanca ───────────────────────────────────────────── */}
            <div className="border-t border-white/5 pt-4">
              <p className="text-white/40 text-[10px] uppercase tracking-wider mb-3">
                Registrar nueva palanca
              </p>
              <AddPalancaForm sku={sku} onAdded={load} />
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
