import { prisma } from "@/lib/prisma";
import Sidebar from "@/app/components/Sidebar";
import MetricCard from "@/app/components/MetricCard";
import VelocityChart from "@/app/components/VelocityChart";
import DiagnosticoTable from "@/app/components/DiagnosticoTable";
import { diagnosticar } from "@/app/lib/diagnostico";
import { lastNWeeks, type WeekKey } from "@/app/lib/weekUtils";

export const dynamic = "force-dynamic";

async function getDashboardData() {
  try {
    const [products, recentActions] = await Promise.all([
      prisma.product.findMany({
        orderBy: [{ sku: "asc" }],
        include: { weeklySales: { orderBy: [{ year: "asc" }, { week: "asc" }] } },
      }),
      prisma.actionLog.findMany({
        take: 6, orderBy: { createdAt: "desc" },
        include: { product: true, palanca: true },
      }),
    ]);
    return { products, recentActions, error: null };
  } catch (e) {
    return { products: [], recentActions: [], error: String(e) };
  }
}

export default async function DashboardPage() {
  const { products, recentActions, error } = await getDashboardData();

  // Compute global week window from weeklySales
  const allWeekKeys: WeekKey[] = [];
  for (const p of products) {
    for (const ws of p.weeklySales) allWeekKeys.push({ year: ws.year, week: ws.week });
  }
  const weekWindow = lastNWeeks(allWeekKeys, 5);

  const diagnosticos = products.map(p => {
    const weekHistory = p.weeklySales.map(ws => ({ year: ws.year, week: ws.week, value: ws.value }));
    return diagnosticar({
      sku: p.sku, nombre: p.nombre,
      weekHistory,
      velocidadInicial: p.velocidadInicial, velocidadMadura: p.velocidadMadura,
      margenPct: p.margenPct, acos: p.acos,
      publicidad: p.publicidad, ventas: p.ventas, ingresos: p.ingresos,
      stock: p.stock, nota: p.nota,
    });
  });

  const criticos  = diagnosticos.filter(d => d.status === "ROJO").length;
  const alertas   = diagnosticos.filter(d => d.status === "AMARILLO").length;
  const optimos   = diagnosticos.filter(d => d.status === "VERDE").length;
  const saludPct  = diagnosticos.length ? Math.round((optimos / diagnosticos.length) * 100) : 0;
  const totalPalancasSugeridas = diagnosticos.reduce((acc, d) => acc + d.palancasSugeridas.length, 0);

  const topCriticos = diagnosticos
    .filter(d => d.status === "ROJO")
    .sort((a, b) => a.brechaPct - b.brechaPct)
    .slice(0, 5);

  const velocityData = diagnosticos
    .filter(d => d.currentWeekValue > 0)
    .slice(0, 5)
    .map(d => ({
      label:  d.sku.slice(0, 10),
      before: Math.min(d.weeks[0]?.value ?? 0, d.velocidadMadura * 2),
      after:  d.currentWeekValue,
    }));

  return (
    <div className="flex h-full min-h-screen bg-[#0a0a0a]">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        {/* Header */}
        <div className="border-b border-white/5 px-8 py-4 flex items-center justify-between sticky top-0 bg-[#0a0a0a]/90 backdrop-blur-sm z-10">
          <div>
            <h1 className="text-base font-semibold text-white">Dashboard de Cuenta</h1>
            <p className="text-xs text-white/30 mt-0.5">ET Brands · Mercado Libre 2026 · Revisión Velocidades</p>
          </div>
          <div className="flex items-center gap-3">
            {error && (
              <span className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-full">
                ⚠ Sin conexión DB
              </span>
            )}
            <div className="flex items-center gap-2 text-xs bg-[#3b82f6]/10 border border-[#3b82f6]/20 px-3 py-1.5 rounded-full text-[#3b82f6]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#3b82f6] animate-pulse" />
              Agente IA · {diagnosticos.length} productos
            </div>
          </div>
        </div>

        <div className="px-8 py-6 space-y-7">

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Score de Salud"        value={`${saludPct}%`}          sub="productos en meta madura"                accent="blue"   trend={saludPct > 50 ? "up" : "down"} />
            <MetricCard label="Críticos 🔴"           value={criticos}                 sub="bajo velocidad inicial"                  accent="red"    trend={criticos > 0 ? "down" : "neutral"} />
            <MetricCard label="En Alerta 🟡"          value={alertas}                  sub="entre meta 1 y meta 2"                   accent="yellow" trend="neutral" />
            <MetricCard label="Palancas sugeridas"    value={totalPalancasSugeridas}   sub="acciones IA pendientes"                  accent="green"  trend="neutral" />
          </div>

          {/* Tabla principal de diagnóstico */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider">
                Revisión Velocidades — Todos los SKUs
              </h2>
              <div className="flex gap-2 text-xs text-white/30">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500"/>Crítico</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-yellow-500"/>Alerta</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500"/>Óptimo</span>
              </div>
            </div>
            <DiagnosticoTable diagnosticos={diagnosticos} weekWindow={weekWindow} />
          </section>

          {/* Acciones IA + Historial */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* SKUs críticos */}
            <section>
              <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
                ◈ Acciones IA — SKUs Críticos Prioritarios
              </h2>
              <div className="rounded-xl border border-white/5 bg-[#111111]">
                {topCriticos.length === 0 ? (
                  <div className="p-6 text-center text-emerald-400 text-sm">✓ Sin SKUs críticos</div>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {topCriticos.map(d => (
                      <li key={d.sku} className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-mono text-[#3b82f6] text-xs">{d.sku}</span>
                            <p className="text-white text-xs font-medium mt-0.5 truncate max-w-[220px]">{d.nombre}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs text-red-400 font-mono">{d.closedWeekValue} / {d.velocidadMadura} uds</p>
                            <p className="text-xs text-white/30">{d.closedWeekLabel} vs Meta Madura</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {d.palancasSugeridas.map(p => (
                            <span key={p} className="text-xs bg-[#3b82f6]/10 text-[#3b82f6] border border-[#3b82f6]/20 px-2 py-0.5 rounded-full">
                              {p}
                            </span>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Gráfica + historial acciones */}
            <section className="space-y-4">
              {velocityData.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
                    Velocidad — Primera vs Última Semana
                  </h2>
                  <VelocityChart data={velocityData} title="Evolución de ventas semanales" />
                </div>
              )}
              {recentActions.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
                    Historial de Palancas
                  </h2>
                  <div className="rounded-xl border border-white/5 bg-[#111111]">
                    <ul className="divide-y divide-white/5">
                      {recentActions.map(log => (
                        <li key={log.id} className="px-4 py-3 flex items-center gap-3">
                          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${log.ejecutadoPor === "IA" ? "bg-[#3b82f6]" : "bg-emerald-400"}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-white truncate">
                              {log.palanca.nombre} → <span className="font-mono text-[#3b82f6]">{log.product.sku}</span>
                            </p>
                            <p className="text-xs text-white/30">{log.ejecutadoPor === "IA" ? "◈ Agente IA" : "● Usuario"}</p>
                          </div>
                          {log.impacto != null && (
                            <span className="text-xs text-emerald-400 font-mono">+{log.impacto.toFixed(1)}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
