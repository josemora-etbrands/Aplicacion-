import { prisma } from "@/lib/prisma";
import Sidebar from "@/app/components/Sidebar";
import MetricCard from "@/app/components/MetricCard";
import VelocityChart from "@/app/components/VelocityChart";

export const dynamic = "force-dynamic";

// Umbrales de negocio ML 2026
const UMBRAL_VISITAS  = 50;
const UMBRAL_CONV     = 1.5;

async function getDashboardData() {
  try {
    const [products, recentActions, totalPalancas] = await Promise.all([
      prisma.product.findMany({ orderBy: { ventasSemanales: "asc" } }),
      prisma.actionLog.findMany({
        take: 8,
        orderBy: { createdAt: "desc" },
        include: { product: true, palanca: true },
      }),
      prisma.palanca.count(),
    ]);
    return { products, recentActions, totalPalancas };
  } catch {
    return { products: [], recentActions: [], totalPalancas: 0 };
  }
}

function getStatus(p: { visitas: number; conversion: number; ventasSemanales: number; metaInicial: number }) {
  if (p.visitas < UMBRAL_VISITAS || p.conversion < UMBRAL_CONV) return "critico";
  if (p.ventasSemanales < p.metaInicial) return "alerta";
  return "ok";
}

const statusConfig = {
  critico: { label: "Crítico",  color: "bg-red-500/10 text-red-400 border-red-500/20"     },
  alerta:  { label: "Alerta",   color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  ok:      { label: "Óptimo",   color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
};

// Demo velocity data (reemplazar con datos reales cuando haya ActionLogs)
const velocityDemo = [
  { label: "SKU-001",  before: 12, after: 38 },
  { label: "SKU-047",  before: 8,  after: 31 },
  { label: "SKU-112",  before: 21, after: 54 },
];

export default async function DashboardPage() {
  const { products, recentActions, totalPalancas } = await getDashboardData();

  const criticos  = products.filter(p => getStatus(p) === "critico").length;
  const alertas   = products.filter(p => getStatus(p) === "alerta").length;
  const optimos   = products.filter(p => getStatus(p) === "ok").length;
  const saludPct  = products.length ? Math.round((optimos / products.length) * 100) : 0;

  const accionesSugeridas = products
    .filter(p => getStatus(p) === "critico")
    .slice(0, 5)
    .map(p => ({
      sku:    p.sku,
      nombre: p.nombre,
      razon:  p.visitas < UMBRAL_VISITAS
        ? `Visitas bajas (${p.visitas} / mín ${UMBRAL_VISITAS})`
        : `Conversión baja (${p.conversion.toFixed(1)}% / mín ${UMBRAL_CONV}%)`,
      palanca: p.visitas < UMBRAL_VISITAS ? "Boost de Exposición" : "Optimizar Listing",
    }));

  return (
    <div className="flex h-full min-h-screen bg-[#0a0a0a]">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        {/* Header */}
        <div className="border-b border-white/5 px-8 py-5 flex items-center justify-between sticky top-0 bg-[#0a0a0a]/80 backdrop-blur-sm z-10">
          <div>
            <h1 className="text-lg font-semibold text-white">Dashboard de Cuenta</h1>
            <p className="text-xs text-white/30 mt-0.5">ET Brands · Mercado Libre 2026</p>
          </div>
          <div className="flex items-center gap-2 text-xs bg-[#3b82f6]/10 border border-[#3b82f6]/20 px-3 py-1.5 rounded-full text-[#3b82f6]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#3b82f6] animate-pulse" />
            Agente IA conectado
          </div>
        </div>

        <div className="px-8 py-6 space-y-8">

          {/* Salud de Cuenta */}
          <section>
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4">
              Salud de la Cuenta
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard label="Score de Salud"   value={`${saludPct}%`}        sub="productos en rango óptimo"   accent="blue"   trend={saludPct > 60 ? "up" : "down"} />
              <MetricCard label="Críticos"          value={criticos}              sub={`Visitas < ${UMBRAL_VISITAS} o Conv < ${UMBRAL_CONV}%`}  accent="red"    trend="down" />
              <MetricCard label="En Alerta"         value={alertas}               sub="bajo meta inicial"           accent="yellow" trend="neutral" />
              <MetricCard label="Palancas Activas"  value={totalPalancas}         sub="en catálogo del sistema"     accent="green"  trend="neutral" />
            </div>
          </section>

          {/* Acciones sugeridas por IA */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider">
                Acciones Sugeridas por IA
              </h2>
              <span className="text-xs text-white/20">
                {accionesSugeridas.length} producto{accionesSugeridas.length !== 1 ? "s" : ""} crítico{accionesSugeridas.length !== 1 ? "s" : ""}
              </span>
            </div>

            {accionesSugeridas.length === 0 ? (
              <div className="rounded-xl border border-white/5 bg-[#111111] p-8 text-center">
                <p className="text-emerald-400 font-medium">✓ Sin acciones urgentes</p>
                <p className="text-white/30 text-sm mt-1">Todos los productos están sobre los umbrales críticos.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-white/5 bg-[#111111] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left px-5 py-3 text-xs text-white/30 font-medium uppercase tracking-wider">SKU</th>
                      <th className="text-left px-5 py-3 text-xs text-white/30 font-medium uppercase tracking-wider">Producto</th>
                      <th className="text-left px-5 py-3 text-xs text-white/30 font-medium uppercase tracking-wider">Diagnóstico</th>
                      <th className="text-left px-5 py-3 text-xs text-white/30 font-medium uppercase tracking-wider">Palanca IA</th>
                      <th className="text-right px-5 py-3 text-xs text-white/30 font-medium uppercase tracking-wider">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accionesSugeridas.map((a, i) => (
                      <tr key={a.sku} className={i < accionesSugeridas.length - 1 ? "border-b border-white/5" : ""}>
                        <td className="px-5 py-3 font-mono text-[#3b82f6] text-xs">{a.sku}</td>
                        <td className="px-5 py-3 text-white font-medium">{a.nombre}</td>
                        <td className="px-5 py-3 text-white/50 text-xs">{a.razon}</td>
                        <td className="px-5 py-3">
                          <span className="text-xs bg-[#3b82f6]/10 text-[#3b82f6] border border-[#3b82f6]/20 px-2 py-0.5 rounded-full">
                            {a.palanca}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">
                            Crítico
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Grid inferior: Historial + Gráfica */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Últimas acciones del agente */}
            <section>
              <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4">
                Últimas Acciones del Agente
              </h2>
              <div className="rounded-xl border border-white/5 bg-[#111111]">
                {recentActions.length === 0 ? (
                  <div className="p-6 text-center text-white/20 text-sm">
                    Sin historial de acciones aún.
                  </div>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {recentActions.map((log) => (
                      <li key={log.id} className="px-4 py-3 flex items-start gap-3">
                        <span className={`mt-0.5 h-2 w-2 rounded-full flex-shrink-0 ${log.ejecutadoPor === "IA" ? "bg-[#3b82f6]" : "bg-emerald-400"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white font-medium truncate">
                            {log.palanca.nombre} → <span className="font-mono text-[#3b82f6]">{log.product.sku}</span>
                          </p>
                          <p className="text-xs text-white/30 mt-0.5">
                            {log.ejecutadoPor === "IA" ? "◈ Agente IA" : "● Usuario"}
                            {log.impacto != null && (
                              <span className="ml-2 text-emerald-400">+{log.impacto.toFixed(1)} ventas</span>
                            )}
                          </p>
                        </div>
                        <time className="text-xs text-white/20 flex-shrink-0">
                          {new Date(log.createdAt).toLocaleDateString("es", { day: "2-digit", month: "short" })}
                        </time>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Velocidad de venta */}
            <section>
              <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4">
                Velocidad de Venta — Antes vs Después
              </h2>
              <VelocityChart data={velocityDemo} />
            </section>
          </div>

          {/* Inventario completo */}
          {products.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4">
                Inventario Completo
              </h2>
              <div className="rounded-xl border border-white/5 bg-[#111111] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      {["SKU", "Nombre", "Visitas", "Conversión", "Ventas/Sem", "SEO Pos.", "Rating", "Estado"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs text-white/30 font-medium uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p, i) => {
                      const status = getStatus(p);
                      const s = statusConfig[status];
                      return (
                        <tr key={p.id} className={i < products.length - 1 ? "border-b border-white/5 hover:bg-white/2" : "hover:bg-white/2"}>
                          <td className="px-4 py-3 font-mono text-[#3b82f6] text-xs">{p.sku}</td>
                          <td className="px-4 py-3 text-white text-xs font-medium max-w-[160px] truncate">{p.nombre}</td>
                          <td className={`px-4 py-3 text-xs font-mono ${p.visitas < UMBRAL_VISITAS ? "text-red-400" : "text-white/60"}`}>
                            {p.visitas.toLocaleString()}
                          </td>
                          <td className={`px-4 py-3 text-xs font-mono ${p.conversion < UMBRAL_CONV ? "text-red-400" : "text-white/60"}`}>
                            {p.conversion.toFixed(1)}%
                          </td>
                          <td className="px-4 py-3 text-xs text-white/60 font-mono">{p.ventasSemanales.toFixed(1)}</td>
                          <td className="px-4 py-3 text-xs text-white/60 font-mono">{p.posicionSEO ?? "—"}</td>
                          <td className="px-4 py-3 text-xs text-white/60">{"★".repeat(Math.round(p.calificacion))}{p.calificacion.toFixed(1)}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs border px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
