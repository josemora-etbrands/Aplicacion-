/**
 * SYNC FINANCIERO POR SKU — ProfitGuard → App  (margen estilo PG)
 * ---------------------------------------------------------------
 * Agrega TODAS las órdenes (≈36k / 6 semanas) desde el endpoint interno de PG
 * (/api/internal/orders), que entrega financiero por orden ya calculado:
 *   realIncome = ingreso − comisión − envío_neto
 * Lo prorratea por SKU (por share de totalPrice en órdenes multi-ítem) y lo envía a
 * /api/ingest-finance, donde el servidor completa con COGS (catálogo) y publicidad (ads)
 * y calcula el margen con la misma fórmula de PG.
 *
 * POR QUÉ NAVEGADOR: son ~36k órdenes; agregar eso excede los límites de Vercel y el
 * rate limit de la API pública. El endpoint interno solo responde con la sesión del browser.
 *
 * CÓMO USAR: logueado en app.profitguard.cl, pega esto en la consola (F12). Tarda ~10-13 min.
 * Ajusta FROM/TO (ventana de 6 semanas) y SECRET (= INGEST_SECRET) si cambian.
 */
(async () => {
  const APP = "https://aplicacion-neon.vercel.app";
  const SECRET = "__INGEST_SECRET__"; // = INGEST_SECRET de Vercel
  const FROM = "2026-05-08", TO = "2026-06-19"; // ventana de 6 semanas (ajustar)

  if (!location.host.includes("profitguard.cl")) { alert("Ejecuta esto en app.profitguard.cl logueado."); return; }

  const fin = {};
  const isoWeek = ds => { const [y,m,d]=ds.split("-").map(Number); const dt=new Date(Date.UTC(y,m-1,d)); dt.setUTCDate(dt.getUTCDate()+4-(dt.getUTCDay()||7)); const ys=new Date(Date.UTC(dt.getUTCFullYear(),0,1)); return {year:dt.getUTCFullYear(), week:Math.ceil((((dt-ys)/86400000)+1)/7)}; };
  const acc = order => {
    const items = order.orderItems || [];
    const gross = items.reduce((s,i)=>s+(i.totalPrice?.cents||0),0) || 1;
    const real = order.realIncome?.cents||0, cc = order.creditCardExtraRevenue?.cents||0;
    const {year,week} = isoWeek(order.date);
    for (const it of items) {
      const sku = it.product?.sku?.trim(); if (!sku) continue;
      const lp = it.totalPrice?.cents||0, share = lp/gross, qty = it.quantity||1;
      const e = fin[sku] || (fin[sku] = {income:0,realIncome:0,ccExtra:0,units:0,weeks:{}});
      e.income += lp; e.realIncome += real*share; e.ccExtra += cc*share; e.units += qty;
      const wk = year+"-"+week; e.weeks[wk] = (e.weeks[wk]||0)+qty;
    }
  };

  const first = await (await fetch(`/api/internal/orders?page=1&page_size=100&from=${FROM}&to=${TO}`,{headers:{Accept:"application/json"},credentials:"include"})).json();
  const T = first.meta?.total_pages || 1;
  (first.items||[]).forEach(acc);
  console.log(`[finance] ${T} páginas…`);
  const P = 8;
  for (let p=2; p<=T; p+=P) {
    const nums=[]; for(let k=p;k<Math.min(p+P,T+1);k++) nums.push(k);
    const res = await Promise.all(nums.map(n=>fetch(`/api/internal/orders?page=${n}&page_size=100&from=${FROM}&to=${TO}`,{headers:{Accept:"application/json"},credentials:"include"}).then(r=>r.json()).catch(()=>({items:[]}))));
    res.forEach(j=>(j.items||[]).forEach(acc));
    if (p % 40 === 1) console.log(`[finance] ${Math.min(p+P-1,T)}/${T}`);
  }

  const items = Object.entries(fin).map(([sku,e])=>({
    sku, income:Math.round(e.income), realIncome:Math.round(e.realIncome),
    ccExtra:Math.round(e.ccExtra), units:e.units,
    weeks:Object.entries(e.weeks).map(([k,u])=>{const [year,week]=k.split("-").map(Number);return {year,week,units:u};}),
  }));
  console.log(`[finance] Enviando ${items.length} SKUs…`);
  const r = await fetch(APP+"/api/ingest-finance",{method:"POST",headers:{"Content-Type":"application/json","x-ingest-secret":SECRET},body:JSON.stringify({items})});
  const o = await r.json();
  console.log("[finance] Resultado:", o);
  alert(r.ok ? `✓ Financiero sincronizado: ${o.stats?.updated} SKUs` : `✗ ${o.error||r.status}`);
})();
