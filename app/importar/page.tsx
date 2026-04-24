"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import Sidebar from "@/app/components/Sidebar";

const LAST_SYNC_KEY = "pg_last_sync_at";

type ReportType = "PROFIT" | "VELOCIDAD";
type Status = "idle" | "uploading" | "success" | "error" | "syncing" | "sync-success" | "sync-error";

interface ImportResult {
  reportType:       ReportType;
  sheetUsed:        string;
  detectedHeaders:  string[];
  weekColumns?:     string[];
  stats:            { total: number; updated: number; created: number; skipped: number };
  errors:           string[];
}

interface SyncResult {
  source:        string;
  syncedAt?:     string;
  elapsed?:      string;
  stats:         { total: number; updated: number; created: number; skipped: number };
  processedSkus: number;
  errors:        string[];
}

function formatSyncDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CL", {
      day:    "2-digit",
      month:  "2-digit",
      year:   "numeric",
      hour:   "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Santiago",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const PHASES = [
  "Leyendo archivo Excel…",
  "Detectando tipo de reporte…",
  "Procesando filas por SKU…",
  "Guardando en base de datos…",
  "Finalizando…",
];

const SYNC_PHASES = [
  "Conectando con ProfitGuard…",
  "Calculando catálogo completo…",
  "Descargando páginas de productos…",
  "Actualizando base de datos en lotes…",
  "Sincronización exitosa ✓",
];

const REPORT_META: Record<ReportType, { label: string; color: string; accent: string }> = {
  PROFIT:    { label: "ProfitGuard — Productos",          color: "text-emerald-400", accent: "bg-emerald-500" },
  VELOCIDAD: { label: "ProfitGuard — Velocidad de Ventas", color: "text-[#3b82f6]",  accent: "bg-[#3b82f6]"  },
};

export default function ImportarPage() {
  const [status,      setStatus]      = useState<Status>("idle");
  const [result,      setResult]      = useState<ImportResult | null>(null);
  const [syncResult,  setSyncResult]  = useState<SyncResult | null>(null);
  const [errorMsg,    setErrorMsg]    = useState("");
  const [dragging,    setDragging]    = useState(false);
  const [progress,    setProgress]    = useState(0);
  const [phase,       setPhase]       = useState(0);
  const [lastSyncAt,  setLastSyncAt]  = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Leer timestamp de última sync desde localStorage al montar
  useEffect(() => {
    const stored = typeof window !== "undefined"
      ? localStorage.getItem(LAST_SYNC_KEY)
      : null;
    if (stored) setLastSyncAt(stored);
  }, []);

  // Animación progreso genérica (subida o sync)
  const isLoading = status === "uploading" || status === "syncing";
  const phases    = status === "syncing" ? SYNC_PHASES : PHASES;

  useEffect(() => {
    if (!isLoading) return;
    setProgress(0);
    setPhase(0);
    let current = 0;
    // Para sync (catálogo grande) avanzamos más despacio — tope en 82%
    const isSyncing = status === "syncing";
    const step      = isSyncing ? () => Math.random() * 1.5 + 0.5 : () => Math.random() * 6 + 2;
    const cap       = isSyncing ? 82 : 88;
    const tick      = isSyncing ? 500 : 350;

    intervalRef.current = setInterval(() => {
      current += step();
      if (current >= cap) current = cap;
      setProgress(current);
      setPhase(Math.min(Math.floor(current / 20), phases.length - 1));
    }, tick);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Al completar → 100%
  useEffect(() => {
    if (status === "success" || status === "sync-success") {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setProgress(100);
      setPhase(phases.length - 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // ── Upload Excel ──────────────────────────────────────────────
  const upload = useCallback(async (file: File) => {
    setStatus("uploading");
    setResult(null);
    setSyncResult(null);
    setErrorMsg("");
    const form = new FormData();
    form.append("file", file);
    try {
      const res  = await fetch("/api/import-report", { method: "POST", body: form });
      const text = await res.text();
      let json: Record<string, unknown>;
      try { json = JSON.parse(text); }
      catch {
        setErrorMsg(`El servidor devolvió una respuesta inesperada (HTTP ${res.status}):\n${text.slice(0, 300)}`);
        setStatus("error");
        return;
      }
      if (!res.ok) { setErrorMsg((json.error as string) ?? "Error desconocido"); setStatus("error"); }
      else         { setResult(json as unknown as ImportResult); setStatus("success"); }
    } catch (e) {
      setErrorMsg(`Error de red: ${String(e)}`);
      setStatus("error");
    }
  }, []);

  // ── Sync API ──────────────────────────────────────────────────
  const syncWithAPI = useCallback(async () => {
    setStatus("syncing");
    setResult(null);
    setSyncResult(null);
    setErrorMsg("");
    try {
      const res  = await fetch("/api/sync-api", { method: "POST" });
      const text = await res.text();
      let json: Record<string, unknown>;
      try { json = JSON.parse(text); }
      catch {
        setErrorMsg(`Respuesta inesperada del servidor (HTTP ${res.status}):\n${text.slice(0, 300)}`);
        setStatus("sync-error");
        return;
      }
      if (!res.ok) { setErrorMsg((json.error as string) ?? "Error desconocido"); setStatus("sync-error"); }
      else {
        const sr = json as unknown as SyncResult;
        setSyncResult(sr);
        setStatus("sync-success");
        // Guardar timestamp de la sync exitosa
        const ts = sr.syncedAt ?? new Date().toISOString();
        localStorage.setItem(LAST_SYNC_KEY, ts);
        setLastSyncAt(ts);
      }
    } catch (e) {
      setErrorMsg(`Error de red: ${String(e)}`);
      setStatus("sync-error");
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
  const reset = () => { setStatus("idle"); setResult(null); setSyncResult(null); setProgress(0); };

  return (
    <div className="flex h-full min-h-screen bg-[#0a0a0a]">
      <Sidebar />
      <main className="flex-1 overflow-auto">

        {/* Header */}
        <div className="border-b border-white/5 px-8 py-4 sticky top-0 bg-[#0a0a0a]/90 backdrop-blur-sm z-10">
          <h1 className="text-base font-semibold text-white">Importar / Sincronizar</h1>
          <p className="text-xs text-white/30 mt-0.5">ET Brands · Carga desde archivo Excel o API de ProfitGuard</p>
        </div>

        <div className="px-8 py-8 max-w-2xl mx-auto space-y-6">

          {/* ── IDLE ── */}
          {status === "idle" && (
            <>
              {/* Sync API — card destacada */}
              <div className="rounded-xl border border-[#3b82f6]/25 bg-[#3b82f6]/5 p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">⚡</span>
                    <div>
                      <p className="text-[#3b82f6] text-sm font-semibold">Sincronizar con API en Tiempo Real</p>
                      <p className="text-white/30 text-xs">Jala productos, stock y métricas directamente desde ProfitGuard</p>
                    </div>
                  </div>
                  {/* Badge última sync */}
                  {lastSyncAt && (
                    <div className="flex-shrink-0 text-right">
                      <p className="text-[10px] text-white/20 uppercase tracking-wider">Última sync</p>
                      <p className="text-[11px] text-emerald-400/70 font-mono whitespace-nowrap">
                        ✓ {formatSyncDate(lastSyncAt)}
                      </p>
                    </div>
                  )}
                </div>
                <button
                  onClick={syncWithAPI}
                  className="w-full bg-[#3b82f6] hover:bg-[#3b82f6]/90 active:scale-[0.98] text-white text-sm font-semibold px-6 py-3 rounded-xl transition-all duration-150"
                >
                  ⚡ Sincronizar ahora →
                </button>
                <p className="text-white/15 text-[11px] text-center">
                  Requiere <code className="font-mono">PROFITGUARD_API_KEY</code> en .env.local · No reemplaza el historial semanal (usa Excel para eso)
                </p>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/5" />
                <span className="text-white/20 text-xs uppercase tracking-wider">o importa desde Excel</span>
                <div className="flex-1 h-px bg-white/5" />
              </div>

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
                  <li>Usa <span className="text-[#3b82f6]">⚡ Sync API</span> para traer productos y stock en tiempo real</li>
                  <li>Importa <span className="text-[#3b82f6]">Velocidad de Ventas</span> (Excel) para cargar el historial semanal</li>
                  <li>Importa <span className="text-emerald-400">Productos</span> (Excel) si necesitas margen, publicidad e ingresos históricos</li>
                  <li>El ACOS se calcula automáticamente en el Dashboard</li>
                </ol>
              </div>
            </>
          )}

          {/* ── UPLOADING / SYNCING: barra de progreso ── */}
          {(status === "uploading" || status === "syncing") && (
            <div className="rounded-xl border border-white/5 bg-[#111111] p-8 space-y-6">
              <div className="text-center space-y-1">
                <p className="text-white text-sm font-semibold">
                  {status === "syncing" ? "Sincronizando con ProfitGuard…" : "Procesando archivo…"}
                </p>
                <p className="text-white/30 text-xs">{phases[phase]}</p>
              </div>

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

              <div className="flex justify-between">
                {["Inicio", "Datos", "Proceso", "Guardado", "Listo"].map((label, i) => (
                  <div key={label} className="flex flex-col items-center gap-1">
                    <div className={`h-2 w-2 rounded-full transition-colors duration-300 ${i <= phase ? "bg-[#3b82f6]" : "bg-white/10"}`} />
                    <span className={`text-[9px] transition-colors ${i <= phase ? "text-white/40" : "text-white/15"}`}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── SUCCESS (Excel) ── */}
          {status === "success" && result && (() => {
            const meta = REPORT_META[result.reportType];
            return (
              <div className="space-y-4">
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

          {/* ── SYNC SUCCESS ── */}
          {status === "sync-success" && syncResult && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[#3b82f6]/20 bg-[#3b82f6]/5 p-6 space-y-4">
                {/* Barra completada */}
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-[#3b82f6] rounded-full w-full transition-all duration-700" />
                </div>
                <div className="text-center space-y-2">
                  <p className="text-[#3b82f6] text-4xl font-black tracking-tight drop-shadow-lg">⚡ ¡LISTO!</p>
                  <p className="text-white font-semibold text-base">
                    Sincronización exitosa: {syncResult.processedSkus} productos procesados
                  </p>
                  <p className="text-white/40 text-xs">
                    {syncResult.source}
                    {syncResult.stats.created > 0 ? ` · ${syncResult.stats.created} nuevos` : ""}
                    {syncResult.stats.updated > 0 ? ` · ${syncResult.stats.updated} actualizados` : ""}
                    {syncResult.elapsed ? ` · ${syncResult.elapsed}` : ""}
                  </p>
                  {lastSyncAt && (
                    <p className="text-emerald-400/60 text-[11px] font-mono">
                      ✓ Última sincronización exitosa: {formatSyncDate(lastSyncAt)}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Total",        value: syncResult.stats.total,   color: "text-white/60"    },
                  { label: "Actualizados", value: syncResult.stats.updated,  color: "text-emerald-400" },
                  { label: "Creados",      value: syncResult.stats.created,  color: "text-[#3b82f6]"   },
                  { label: "Omitidos",     value: syncResult.stats.skipped,  color: "text-yellow-400"  },
                ].map(s => (
                  <div key={s.label} className="rounded-xl border border-white/5 bg-[#111111] p-3 text-center">
                    <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
                    <p className="text-white/25 text-[10px] uppercase tracking-wider mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <Link href="/"
                  className="flex-1 text-center bg-[#3b82f6] hover:bg-[#3b82f6]/90 text-white text-sm font-semibold px-6 py-3 rounded-xl transition-colors">
                  Ir al Dashboard →
                </Link>
                <button onClick={reset}
                  className="px-6 py-3 rounded-xl border border-white/10 text-white/40 hover:text-white/70 text-sm transition-colors">
                  Volver
                </button>
              </div>

              {syncResult.errors.length > 0 && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 space-y-1">
                  <p className="text-red-400 text-xs font-semibold">Errores parciales ({syncResult.errors.length})</p>
                  {syncResult.errors.map((e, i) => (
                    <p key={i} className="text-red-400/60 text-xs font-mono">{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── ERROR (Excel o Sync) ── */}
          {(status === "error" || status === "sync-error") && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 space-y-4">
              <div className="flex items-start gap-3">
                <span className="text-red-400 text-xl">⚠</span>
                <div>
                  <p className="text-red-400 text-sm font-semibold">
                    {status === "sync-error" ? "Error al sincronizar con la API" : "Error al procesar el archivo"}
                  </p>
                  <pre className="text-red-400/60 text-xs mt-1 whitespace-pre-wrap font-mono">{errorMsg}</pre>
                </div>
              </div>
              {status === "sync-error" && errorMsg.includes("API_KEY") && (
                <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3">
                  <p className="text-yellow-400 text-xs font-semibold mb-1">¿Falta la API key?</p>
                  <p className="text-yellow-400/60 text-xs">
                    Agrega <code className="font-mono bg-black/30 px-1 rounded">PROFITGUARD_API_KEY=tu_key</code> a tu archivo <code className="font-mono bg-black/30 px-1 rounded">.env.local</code> y reinicia el servidor de desarrollo.
                  </p>
                </div>
              )}
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
