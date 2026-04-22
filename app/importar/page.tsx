"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import Sidebar from "@/app/components/Sidebar";

type ReportType = "PROFIT" | "VELOCIDAD";
type Status = "idle" | "uploading" | "success" | "error";

interface ImportResult {
  reportType:       ReportType;
  sheetUsed:        string;
  detectedHeaders:  string[];
  weekColumns?:     string[];
  stats:            { total: number; updated: number; created: number; skipped: number };
  errors:           string[];
}

const PHASES = [
  "Leyendo archivo Excel…",
  "Detectando tipo de reporte…",
  "Procesando filas por SKU…",
  "Guardando en base de datos…",
  "Finalizando…",
];

const REPORT_META: Record<ReportType, { label: string; color: string; accent: string }> = {
  PROFIT:    { label: "ProfitGuard — Productos",          color: "text-emerald-400", accent: "bg-emerald-500" },
  VELOCIDAD: { label: "ProfitGuard — Velocidad de Ventas", color: "text-[#3b82f6]",  accent: "bg-[#3b82f6]"  },
};

export default function ImportarPage() {
  const [status,   setStatus]   = useState<Status>("idle");
  const [result,   setResult]   = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase,    setPhase]    = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animación de progreso mientras se sube
  useEffect(() => {
    if (status !== "uploading") return;
    setProgress(0);
    setPhase(0);
    let current = 0;
    intervalRef.current = setInterval(() => {
      current += Math.random() * 6 + 2;
      if (current >= 88) current = 88;
      setProgress(current);
      setPhase(Math.min(Math.floor(current / 20), PHASES.length - 1));
    }, 350);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [status]);

  // Al completar → 100%
  useEffect(() => {
    if (status === "success") {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setProgress(100);
      setPhase(PHASES.length - 1);
    }
  }, [status]);

  const upload = useCallback(async (file: File) => {
    setStatus("uploading");
    setResult(null);
    setErrorMsg("");
    const form = new FormData();
    form.append("file", file);
    try {
      const res  = await fetch("/api/import-report", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) { setErrorMsg(json.error ?? "Error desconocido"); setStatus("error"); }
      else         { setResult(json); setStatus("success"); }
    } catch {
      setErrorMsg("No se pudo conectar con el servidor");
      setStatus("error");
    }
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
    e.target.value = "";
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  };
  const reset = () => { setStatus("idle"); setResult(null); setProgress(0); };

  return (
    <div className="flex h-full min-h-screen bg-[#0a0a0a]">
      <Sidebar />
      <main className="flex-1 overflow-auto">

        {/* Header */}
        <div className="border-b border-white/5 px-8 py-4 sticky top-0 bg-[#0a0a0a]/90 backdrop-blur-sm z-10">
          <h1 className="text-base font-semibold text-white">Importar Reporte</h1>
          <p className="text-xs text-white/30 mt-0.5">ET Brands · Carga automática desde ProfitGuard</p>
        </div>

        <div className="px-8 py-8 max-w-2xl mx-auto space-y-6">

          {/* ── IDLE: zona de carga ── */}
          {status === "idle" && (
            <>
              {/* Tipos de reporte */}
              <div className="grid grid-cols-2 gap-4">
                {([
                  { type: "VELOCIDAD" as ReportType, icon: "📊", fields: "SKU · Nombre · Stock Total · W## (semanas)" },
                  { type: "PROFIT"    as ReportType, icon: "💰", fields: "SKU · Margen % · Publicidad · Ingresos · Ventas" },
                ] as const).map(({ type, icon, fields }) => (
                  <div key={type} className="rounded-xl border border-white/5 bg-[#111111] p-4 space-y-1">
                    <span className="text-lg">{icon}</span>
                    <p className={`text-xs font-semibold ${REPORT_META[type].color}`}>{type}</p>
                    <p className="text-white text-sm font-medium">{REPORT_META[type].label}</p>
                    <p className="text-white/25 text-[11px]">{fields}</p>
                  </div>
                ))}
              </div>

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`rounded-xl border-2 border-dashed transition-all duration-200 p-14 flex flex-col items-center justify-center gap-4 text-center cursor-pointer
                  ${dragging ? "border-[#3b82f6]/70 bg-[#3b82f6]/5 scale-[1.01]" : "border-white/10 bg-[#111111] hover:border-white/25 hover:bg-white/[0.02]"}`}
              >
                <div className="text-5xl text-white/15">⬆</div>
                <div>
                  <p className="text-white/70 text-sm font-medium">Arrastra tu reporte aquí</p>
                  <p className="text-white/30 text-xs mt-1">o haz clic para seleccionar</p>
                </div>
                <label className="cursor-pointer bg-[#3b82f6]/10 hover:bg-[#3b82f6]/20 border border-[#3b82f6]/30 text-[#3b82f6] text-xs font-medium px-5 py-2 rounded-lg transition-colors">
                  Seleccionar archivo .xlsx
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onFileChange} />
                </label>
                <p className="text-white/15 text-[11px]">Detecta automáticamente si es Velocidad o Productos</p>
              </div>

              {/* Instrucciones */}
              <div className="rounded-xl border border-white/5 bg-[#111111] p-5 space-y-3">
                <p className="text-white/40 text-xs font-semibold uppercase tracking-wider">Orden recomendado</p>
                <ol className="space-y-2 text-white/35 text-xs list-decimal list-inside">
                  <li>Importa <span className="text-[#3b82f6]">Velocidad de Ventas</span> primero — crea los productos, stock e historial semanal</li>
                  <li>Importa <span className="text-emerald-400">Productos</span> después — agrega margen, publicidad e ingresos</li>
                  <li>El ACOS se calcula automáticamente en el Dashboard</li>
                </ol>
              </div>
            </>
          )}

          {/* ── UPLOADING: barra de progreso ── */}
          {status === "uploading" && (
            <div className="rounded-xl border border-white/5 bg-[#111111] p-8 space-y-6">
              <div className="text-center space-y-1">
                <p className="text-white text-sm font-semibold">Procesando archivo…</p>
                <p className="text-white/30 text-xs">{PHASES[phase]}</p>
              </div>

              {/* Barra de progreso */}
              <div className="space-y-2">
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#3b82f6] rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-white/20">
                  <span>0%</span>
                  <span className="text-white/40 font-mono">{Math.round(progress)}%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Pasos visuales */}
              <div className="flex justify-between">
                {["Lectura", "Detección", "Proceso", "Guardado", "Listo"].map((label, i) => (
                  <div key={label} className="flex flex-col items-center gap-1">
                    <div className={`h-2 w-2 rounded-full transition-colors duration-300 ${
                      i <= phase ? "bg-[#3b82f6]" : "bg-white/10"
                    }`} />
                    <span className={`text-[9px] transition-colors ${i <= phase ? "text-white/40" : "text-white/15"}`}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── SUCCESS ── */}
          {status === "success" && result && (() => {
            const meta = REPORT_META[result.reportType];
            return (
              <div className="space-y-4">
                {/* Barra completada */}
                <div className="rounded-xl border border-white/5 bg-[#111111] p-5 space-y-3">
                  <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full w-full transition-all duration-700" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-emerald-400 text-xl font-bold tracking-tight">¡LISTO!</p>
                    <p className="text-white/60 text-sm">Datos actualizados correctamente</p>
                    <p className={`text-xs ${meta.color}`}>{meta.label} · hoja: {result.sheetUsed}</p>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Total",        value: result.stats.total,   color: "text-white/60"    },
                    { label: "Actualizados", value: result.stats.updated,  color: "text-emerald-400" },
                    { label: "Creados",      value: result.stats.created,  color: "text-[#3b82f6]"   },
                    { label: "Omitidos",     value: result.stats.skipped,  color: "text-yellow-400"  },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl border border-white/5 bg-[#111111] p-3 text-center">
                      <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
                      <p className="text-white/25 text-[10px] uppercase tracking-wider mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Botones de acción */}
                <div className="flex gap-3">
                  <Link href="/"
                    className="flex-1 text-center bg-[#3b82f6] hover:bg-[#3b82f6]/90 text-white text-sm font-semibold px-6 py-3 rounded-xl transition-colors">
                    Ir al Dashboard →
                  </Link>
                  <button onClick={reset}
                    className="px-6 py-3 rounded-xl border border-white/10 text-white/40 hover:text-white/70 text-sm transition-colors">
                    Importar otro
                  </button>
                </div>

                {/* Diagnóstico colapsable */}
                <details className="rounded-xl border border-white/5 bg-[#111111] p-4">
                  <summary className="text-white/25 text-xs cursor-pointer select-none hover:text-white/40 transition-colors">
                    Ver detalles técnicos — {result.detectedHeaders.length} columnas detectadas
                  </summary>
                  <div className="mt-3 space-y-3">
                    <div className="flex flex-wrap gap-1">
                      {result.detectedHeaders.map(h => (
                        <span key={h} className="text-[10px] font-mono bg-white/5 text-white/35 px-1.5 py-0.5 rounded">{h}</span>
                      ))}
                    </div>
                    {result.weekColumns && result.weekColumns.length > 0 && (
                      <div>
                        <p className="text-white/20 text-[10px] mb-1 uppercase tracking-wider">Semanas mapeadas ({result.weekColumns.length})</p>
                        <div className="flex flex-wrap gap-1">
                          {result.weekColumns.map(w => (
                            <span key={w} className="text-[10px] font-mono bg-[#3b82f6]/10 text-[#3b82f6]/60 px-1.5 py-0.5 rounded">{w}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {result.errors.length > 0 && (
                      <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 space-y-1">
                        <p className="text-red-400 text-xs font-semibold">SKUs con error ({result.errors.length})</p>
                        {result.errors.map((e, i) => (
                          <p key={i} className="text-red-400/60 text-xs font-mono">{e}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              </div>
            );
          })()}

          {/* ── ERROR ── */}
          {status === "error" && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 space-y-4">
              <div className="flex items-start gap-3">
                <span className="text-red-400 text-xl">⚠</span>
                <div>
                  <p className="text-red-400 text-sm font-semibold">Error al procesar el archivo</p>
                  <p className="text-red-400/60 text-xs mt-1">{errorMsg}</p>
                </div>
              </div>
              <button onClick={reset}
                className="text-xs text-white/30 hover:text-white/60 transition-colors">
                ← Intentar de nuevo
              </button>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
