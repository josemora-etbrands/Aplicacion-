"use client";
import { useState } from "react";
import Link from "next/link";
import Sidebar from "@/app/components/Sidebar";

/**
 * Página de Datos / Sincronización.
 *
 * Ya NO hay carga de Excel ni botón de sync manual: la data operacional
 * (catálogo, ventas, stock, publicidad, ACOS) se sincroniza SOLA desde la
 * API de ProfitGuard mediante un cron diario de Vercel.
 *
 * Lo único que requiere intervención son las METAS DE VELOCIDAD + categoría ABC,
 * que solo se pueden leer con la sesión del navegador (la API key no sirve).
 * Para eso está el bookmarklet de un clic de abajo.
 */

const BOOKMARKLET =
  `javascript:(async()=>{const A="https://aplicacion-neon.vercel.app",S="__SECRET__";const all=[];let p=1,T=1;do{const r=await fetch(\`/api/internal/sales_speed/product_items?page=\${p}&week_count=5&sort_key=weekly_sales_speed&sort_dir=desc&active=active&page_size=100\`,{headers:{Accept:"application/json"},credentials:"include"});if(r.url.includes("/session/new")){alert("Sesión PG expirada");return}const j=await r.json();T=j.meta?.total_pages||1;(j.items||[]).forEach(i=>all.push({sku:i.sku,weeklySalesSpeed:i.weeklySalesSpeed,category:i.category,averageWeeklySales:i.averageWeeklySales}));p++}while(p<=T);const res=await fetch(A+"/api/ingest-velocities",{method:"POST",headers:{"Content-Type":"application/json","x-ingest-secret":S},body:JSON.stringify({items:all})});const o=await res.json();alert(res.ok?\`✓ \${o.received} velocidades (act \${o.stats.updated}/creados \${o.stats.created})\`:"✗ "+(o.error||res.status))})();`;

export default function DatosPage() {
  const [copied, setCopied] = useState(false);

  const copyBookmarklet = async () => {
    try {
      await navigator.clipboard.writeText(BOOKMARKLET);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex h-full min-h-screen bg-[#0a0a0a]">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="border-b border-white/5 px-8 py-4 sticky top-0 bg-[#0a0a0a]/90 backdrop-blur-sm z-10">
          <h1 className="text-base font-semibold text-white">Datos / Sincronización</h1>
          <p className="text-xs text-white/30 mt-0.5">ET Brands · 100% desde ProfitGuard API</p>
        </div>

        <div className="px-8 py-8 max-w-2xl mx-auto space-y-6">

          {/* Estado: automático */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-emerald-400 text-sm font-semibold">Sincronización automática activa</p>
            </div>
            <p className="text-white/40 text-xs leading-relaxed">
              El catálogo, historial de ventas, stock, publicidad y ACOS se traen solos desde la
              API de ProfitGuard mediante un cron diario (Vercel). Ya no hay carga manual de Excel
              ni botón de sincronización.
            </p>
          </div>

          {/* Velocidades por navegador */}
          <div className="rounded-xl border border-[#3b82f6]/25 bg-[#3b82f6]/5 p-5 space-y-4">
            <div>
              <p className="text-[#3b82f6] text-sm font-semibold">⚡ Sincronizar metas de velocidad + ABC</p>
              <p className="text-white/35 text-xs mt-1 leading-relaxed">
                Las metas de velocidad y la categoría ABC solo son accesibles con tu sesión de
                ProfitGuard (la API key no sirve para ese dato). Usa este bookmarklet de un clic:
              </p>
            </div>

            <ol className="space-y-2 text-white/45 text-xs list-decimal list-inside">
              <li>Copia el bookmarklet con el botón de abajo.</li>
              <li>Crea un marcador nuevo en tu navegador y pega el código como URL.</li>
              <li>Inicia sesión en <code className="font-mono text-white/60">app.profitguard.cl</code>.</li>
              <li>Estando ahí, haz clic en el marcador. Verás un aviso con el resultado.</li>
            </ol>

            <button
              onClick={copyBookmarklet}
              className="w-full bg-[#3b82f6] hover:bg-[#3b82f6]/90 active:scale-[0.98] text-white text-sm font-semibold px-6 py-3 rounded-xl transition-all"
            >
              {copied ? "✓ Copiado al portapapeles" : "Copiar bookmarklet"}
            </button>
            <p className="text-white/15 text-[11px] text-center">
              Solo reemplaza <code className="font-mono">__SECRET__</code> en el código por el valor
              de <code className="font-mono">INGEST_SECRET</code> (la URL ya viene incrustada).
            </p>
          </div>

          <div className="flex">
            <Link href="/"
              className="flex-1 text-center bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-sm font-medium px-6 py-3 rounded-xl transition-colors">
              ← Volver al Dashboard
            </Link>
          </div>

        </div>
      </main>
    </div>
  );
}
