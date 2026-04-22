"use client";
import { useState, useCallback } from "react";
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

const REPORT_META: Record<ReportType, { label: string; color: string; fields: string }> = {
  PROFIT:    { label: "ProfitGuard — Productos",         color: "text-emerald-400", fields: "Margen %, Publicidad, Ventas, Ingresos" },
  VELOCIDAD: { label: "ProfitGuard — Velocidad de Ventas", color: "text-[#3b82f6]",  fields: "Semanas dinámicas (W##), Stock Total" },
};

export default function ImportarPage() {
  const [status, setStatus]     = useState<Status>("idle");
  const [result, setResult]     = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [dragging, setDragging] = useState(false);

  const upload = useCallback(async (file: File) => {
    setStatus("uploading");
    setResult(null);
    setErrorMsg("");

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/import-report", { method: "POST", body: form });
      const json = await res.json();

      if (!res.ok) {
        setErrorMsg(json.error ?? "Error desconocido");
        setStatus("error");
      } else {
        setResult(json);
        setStatus("success");
      }
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
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  };

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

          {/* Tipos de reporte soportados */}
          <div className="grid grid-cols-2 gap-4">
            {(Object.entries(REPORT_META) as [ReportType, typeof REPORT_META[ReportType]][]).map(([type, meta]) => (
              <div key={type} className="rounded-xl border border-white/5 bg-[#111111] p-4 space-y-1">
                <span className={`text-xs font-semibold ${meta.color}`}>{type}</span>
                <p className="text-white text-sm font-medium">{meta.label}</p>
                <p className="text-white/30 text-xs">Actualiza: {meta.fields}</p>
              </div>
            ))}
          </div>

          {/* Zona de carga */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`relative rounded-xl border-2 border-dashed transition-colors p-12 flex flex-col items-center justify-center gap-4 text-center
              ${dragging
                ? "border-[#3b82f6]/60 bg-[#3b82f6]/5"
                : "border-white/10 bg-[#111111] hover:border-white/20"}`}
          >
            {status === "uploading" ? (
              <>
                <div className="h-8 w-8 rounded-full border-2 border-[#3b82f6] border-t-transparent animate-spin" />
                <p className="text-white/50 text-sm">Procesando archivo…</p>
              </>
            ) : (
              <>
                <div className="text-4xl text-white/20">⬆</div>
                <div>
                  <p className="text-white/70 text-sm font-medium">Arrastra tu reporte aquí</p>
                  <p className="text-white/30 text-xs mt-1">o haz clic para seleccionar</p>
                </div>
                <label className="cursor-pointer bg-[#3b82f6]/10 hover:bg-[#3b82f6]/20 border border-[#3b82f6]/30 text-[#3b82f6] text-xs font-medium px-4 py-2 rounded-lg transition-colors">
                  Seleccionar archivo .xlsx
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onFileChange} />
                </label>
                <p className="text-white/20 text-[11px]">
                  Detecta automáticamente si es reporte de Productos o Velocidad
                </p>
              </>
            )}
          </div>

          {/* Resultado exitoso */}
          {status === "success" && result && (() => {
            const meta = REPORT_META[result.reportType];
            return (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-emerald-400 text-lg">✓</span>
                  <div>
                    <p className="text-emerald-400 text-sm font-semibold">Importación completada</p>
                    <p className={`text-xs ${meta.color} mt-0.5`}>{meta.label} · hoja: {result.sheetUsed}</p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Total",       value: result.stats.total,   color: "text-white/70"    },
                    { label: "Actualizados",value: result.stats.updated,  color: "text-emerald-400" },
                    { label: "Creados",     value: result.stats.created,  color: "text-[#3b82f6]"  },
                    { label: "Omitidos",    value: result.stats.skipped,  color: "text-yellow-400" },
                  ].map(s => (
                    <div key={s.label} className="rounded-lg bg-white/5 p-3 text-center">
                      <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
                      <p className="text-white/30 text-[10px] uppercase tracking-wider mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
                {/* Diagnóstico: columnas detectadas */}
                <details className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
                  <summary className="text-white/30 text-xs cursor-pointer select-none">
                    Columnas detectadas ({result.detectedHeaders.length})
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {result.detectedHeaders.map(h => (
                      <span key={h} className="text-[10px] font-mono bg-white/5 text-white/40 px-1.5 py-0.5 rounded">{h}</span>
                    ))}
                  </div>
                  {result.weekColumns && result.weekColumns.length > 0 && (
                    <div className="mt-2">
                      <p className="text-white/20 text-[10px] mb-1">Semanas mapeadas:</p>
                      <div className="flex flex-wrap gap-1">
                        {result.weekColumns.map(w => (
                          <span key={w} className="text-[10px] font-mono bg-[#3b82f6]/10 text-[#3b82f6]/70 px-1.5 py-0.5 rounded">{w}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </details>
                {result.errors.length > 0 && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 space-y-1">
                    <p className="text-red-400 text-xs font-semibold">SKUs con error ({result.errors.length}):</p>
                    {result.errors.map((e, i) => (
                      <p key={i} className="text-red-400/70 text-xs font-mono">{e}</p>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => { setStatus("idle"); setResult(null); }}
                  className="text-xs text-white/30 hover:text-white/60 transition-colors"
                >
                  Importar otro archivo →
                </button>
              </div>
            );
          })()}

          {/* Error */}
          {status === "error" && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 flex items-start gap-3">
              <span className="text-red-400 text-lg">⚠</span>
              <div className="space-y-2">
                <p className="text-red-400 text-sm font-semibold">Error al procesar el archivo</p>
                <p className="text-red-400/70 text-xs">{errorMsg}</p>
                <button
                  onClick={() => setStatus("idle")}
                  className="text-xs text-white/30 hover:text-white/60 transition-colors"
                >
                  Intentar de nuevo →
                </button>
              </div>
            </div>
          )}

          {/* Instrucciones */}
          <div className="rounded-xl border border-white/5 bg-[#111111] p-5 space-y-3">
            <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">Cómo exportar desde ProfitGuard</p>
            <ol className="space-y-2 text-white/40 text-xs list-decimal list-inside">
              <li>Abre ProfitGuard y selecciona el rango de fechas deseado</li>
              <li>En <span className="text-white/60">Productos</span>: exporta como Excel (.xlsx) — detectado por columnas <span className="text-emerald-400 font-mono">Margen %</span> y <span className="text-emerald-400 font-mono">Publicidad</span></li>
              <li>En <span className="text-white/60">Velocidad de Ventas</span>: exporta como Excel (.xlsx) — detectado por columnas de semana <span className="text-[#3b82f6] font-mono">W##</span> y <span className="text-[#3b82f6] font-mono">Stock Total</span> (la ventana se ajusta automáticamente)</li>
              <li>Arrastra el archivo aquí — el sistema detecta el tipo automáticamente</li>
            </ol>
          </div>

        </div>
      </main>
    </div>
  );
}
