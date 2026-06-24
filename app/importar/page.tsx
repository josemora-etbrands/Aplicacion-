"use client";
import { useState } from "react";
import Link from "next/link";
import Sidebar from "@/app/components/Sidebar";

/**
 * Página de Datos / Sincronización.
 *
 * - La data operacional (catálogo, stock, ACoS real) se sincroniza SOLA vía cron diario.
 * - Las VELOCIDADES + categoría ABC (página Velocidad de Ventas) se refrescan con el
 *   bookmarklet de abajo: corre en tu sesión de ProfitGuard y manda todo a la app de un clic.
 *
 * El secreto NO está en el código de la página; lo pegas tú una vez y se arma el bookmarklet.
 */
const APP_URL = "https://aplicacion-neon.vercel.app";

function buildBookmarklet(secret: string): string {
  const s = JSON.stringify(secret);
  // Lee sales_speed + el detalle (performance) de cada SKU y envía a /api/ingest-velocities.
  return `javascript:(async()=>{const A=${JSON.stringify(APP_URL)},S=${s};try{const items=[];let p=1,T=1;do{const r=await fetch('/api/internal/sales_speed/product_items?page='+p+'&week_count=5&sort_key=weekly_sales_speed&sort_dir=desc&active=active&page_size=100',{headers:{Accept:'application/json'},credentials:'include'});if(r.url.indexOf('/session/new')>-1){alert('Tu sesión de ProfitGuard expiró. Inicia sesión y reintenta.');return;}const j=await r.json();T=(j.meta&&j.meta.total_pages)||1;(j.items||[]).forEach(function(i){items.push(i);});p++;}while(p<=T);const yr=new Date().getFullYear();const FR=yr+'-01-01';const TO=new Date().toISOString().slice(0,10);function iso(b){var dt=new Date(b);var d=new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth(),dt.getUTCDate()));d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));var ys=new Date(Date.UTC(d.getUTCFullYear(),0,1));return d.getUTCFullYear()+'-'+Math.ceil((((d-ys)/86400000)+1)/7);}
async function perf(id){try{const bs='/api/internal/sales_speed/product_items/'+id+'/performance?date_range_key=custom&from='+FR+'&to='+TO+'&group_by=';const rr=await Promise.all([fetch(bs+'day',{headers:{Accept:'application/json'},credentials:'include'}),fetch(bs+'week',{headers:{Accept:'application/json'},credentials:'include'})]);const d=await rr[0].json();const w=await rr[1].json();const ws={};((w.chart&&w.chart.series)||[]).forEach(function(x){ws[iso(x.bucket)]=x.stock;});return{totalUnits:d.totalUnits,averageIncomeCents:(d.averageIncome&&d.averageIncome.cents)||0,marginPercentage:d.marginPercentage,adSpendPercentage:d.adSpendPercentage,series:((d.chart&&d.chart.series)||[]).map(function(x){return{date:x.bucket,label:x.label,units:x.units,stock:ws[iso(x.bucket)]||0,averageTicketCents:(x.averageTicket&&x.averageTicket.cents)||0,marginPercentage:x.marginPercentage,adSpendPercentage:x.adSpendPercentage};})};}catch(e){return null;}}const payload=[];for(let i=0;i<items.length;i+=8){const b=items.slice(i,i+8);const det=await Promise.all(b.map(function(it){return perf(it.id);}));b.forEach(function(it,k){payload.push({sku:it.sku,weeklySalesSpeed:it.weeklySalesSpeed,category:it.category,averageWeeklySales:it.averageWeeklySales,totalStock:it.totalStock,associationsCount:it.associationsCount,weeks:(it.weeklySales||[]).map(function(w){return{number:w.number,year:w.year,units:w.units};}),detalle:det[k]});});}let proc=0;for(let i=0;i<payload.length;i+=150){const res=await fetch(A+'/api/ingest-velocities',{method:'POST',headers:{'Content-Type':'application/json','x-ingest-secret':S},body:JSON.stringify({items:payload.slice(i,i+150)})});const o=await res.json();if(!res.ok){alert('Error: '+(o.error||res.status));return;}proc+=(o.stats&&o.stats.processed)||0;}alert('\\u2713 Velocidad de Ventas + detalle actualizados: '+proc+' productos');}catch(e){alert('Error: '+e);}})();`;
}

export default function DatosPage() {
  const [secret, setSecret] = useState("");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!secret.trim()) return;
    try {
      await navigator.clipboard.writeText(buildBookmarklet(secret.trim()));
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch { /* ignore */ }
  };

  return (
    <div className="flex h-full min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="border-b border-slate-200 px-8 py-4 sticky top-0 bg-white/90 backdrop-blur-sm z-10">
          <h1 className="text-lg font-semibold text-slate-900">Datos / Sincronización</h1>
          <p className="text-xs text-slate-400 mt-0.5">ET Brands · 100% desde ProfitGuard</p>
        </div>

        <div className="px-8 py-8 max-w-2xl mx-auto space-y-6">
          {/* Estado automático */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-emerald-700 text-sm font-semibold">Sincronización automática activa</p>
            </div>
            <p className="text-slate-500 text-xs leading-relaxed">
              Catálogo, stock y ACoS real se traen solos desde ProfitGuard con un cron diario.
              Sin carga manual de Excel.
            </p>
          </div>

          {/* Velocidades — bookmarklet de 1 clic */}
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 space-y-4">
            <div>
              <p className="text-blue-700 text-sm font-semibold">⚡ Actualizar Velocidad de Ventas (1 clic)</p>
              <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                Las velocidades, categoría ABC y semanas solo se leen con tu sesión de ProfitGuard.
                Crea este bookmarklet una vez y haz clic cuando quieras refrescar.
              </p>
            </div>

            {/* Paso 1: secreto */}
            <div>
              <label className="block text-slate-500 text-[10px] uppercase tracking-wider mb-1">
                1. Pega tu INGEST_SECRET (el de Vercel)
              </label>
              <input
                type="password" value={secret} onChange={e => setSecret(e.target.value)}
                placeholder="INGEST_SECRET"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {/* Paso 2: copiar */}
            <div>
              <label className="block text-slate-500 text-[10px] uppercase tracking-wider mb-1">
                2. Copia el bookmarklet y guárdalo como marcador
              </label>
              <button
                onClick={copy} disabled={!secret.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 active:scale-[0.98] text-white text-sm font-semibold px-6 py-3 rounded-xl transition-all shadow-sm"
              >
                {copied ? "✓ Copiado — pégalo como URL de un marcador nuevo" : "Copiar bookmarklet"}
              </button>
            </div>

            {/* Paso 3 */}
            <ol className="space-y-1.5 text-slate-500 text-xs list-decimal list-inside">
              <li>Crea un marcador nuevo en tu navegador y pega el bookmarklet como URL (nómbralo &quot;Sync Velocidades&quot;).</li>
              <li>Inicia sesión en <code className="font-mono text-slate-700">app.profitguard.cl</code>.</li>
              <li>Estando ahí, haz clic en el marcador. Verás &quot;✓ Velocidad de Ventas actualizada&quot;.</li>
            </ol>
          </div>

          <div className="flex">
            <Link href="/" className="flex-1 text-center bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-sm font-medium px-6 py-3 rounded-xl transition-colors">
              ← Ver Velocidad de Ventas
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
