/**
 * SYNC DE VELOCIDADES — ProfitGuard → App
 * ----------------------------------------
 * Las metas de velocidad (weeklySalesSpeed) y la categoría ABC SOLO son accesibles
 * desde el panel de ProfitGuard con la sesión del navegador (la API key no sirve:
 * /api/internal/* redirige a login). Por eso este script corre EN TU NAVEGADOR.
 *
 * CÓMO USARLO
 *   1. Inicia sesión en https://app.profitguard.cl
 *   2. Abre la consola del navegador (F12 → Console) estando en app.profitguard.cl
 *   3. Edita CONFIG.APP_URL y CONFIG.SECRET abajo (el SECRET = INGEST_SECRET de Vercel)
 *   4. Pega TODO este script y presiona Enter. Verás el progreso y el resultado.
 *
 * (Más abajo hay una versión "bookmarklet" de un clic.)
 */
(async () => {
  const CONFIG = {
    // URL pública de la app en Vercel (sin slash final)
    APP_URL: "https://aplicacion-neon.vercel.app",
    // Debe coincidir con INGEST_SECRET configurado en Vercel
    SECRET: "PEGA_AQUI_EL_INGEST_SECRET",
    WEEK_COUNT: 5,
  };

  if (!location.host.includes("profitguard.cl")) {
    alert("Ejecuta este script estando en app.profitguard.cl (con sesión iniciada).");
    return;
  }

  const PER = "page_size=100"; // el endpoint interno acepta page_size
  const all = [];
  let page = 1, totalPages = 1;

  console.log("[sync-velocidades] Descargando velocidades desde ProfitGuard…");
  do {
    const url = `/api/internal/sales_speed/product_items?page=${page}&` +
      `week_count=${CONFIG.WEEK_COUNT}&sort_key=weekly_sales_speed&sort_dir=desc&active=active&${PER}`;
    const r = await fetch(url, { headers: { Accept: "application/json" }, credentials: "include" });
    if (r.status === 302 || r.redirected || r.url.includes("/session/new")) {
      alert("Tu sesión de ProfitGuard expiró. Vuelve a iniciar sesión y reintenta.");
      return;
    }
    const j = await r.json();
    totalPages = j.meta?.total_pages ?? 1;
    for (const it of (j.items ?? [])) {
      all.push({
        sku: it.sku,
        weeklySalesSpeed: it.weeklySalesSpeed,
        category: it.category,
        averageWeeklySales: it.averageWeeklySales,
      });
    }
    console.log(`  · página ${page}/${totalPages} (${all.length} SKUs)`);
    page++;
  } while (page <= totalPages);

  console.log(`[sync-velocidades] ${all.length} SKUs leídos. Enviando a la app…`);

  const res = await fetch(`${CONFIG.APP_URL}/api/ingest-velocities`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-ingest-secret": CONFIG.SECRET },
    body: JSON.stringify({ items: all }),
  });
  const out = await res.json();
  console.log("[sync-velocidades] Respuesta de la app:", out);
  alert(
    res.ok
      ? `✓ Velocidades sincronizadas\nRecibidos: ${out.received}\nActualizados: ${out.stats?.updated}\nCreados: ${out.stats?.created}\nOmitidos: ${out.stats?.skipped}`
      : `✗ Error: ${out.error ?? res.status}`,
  );
})();

/* ─────────────────────────────────────────────────────────────────────────────
 * VERSIÓN BOOKMARKLET (un clic):
 * Crea un marcador en el navegador y pega esto como URL (reemplaza APP_URL y SECRET).
 * Luego, estando en app.profitguard.cl, haz clic en el marcador.
 *
 * javascript:(async()=>{const A="https://TU-APP.vercel.app",S="TU_SECRET";const all=[];let p=1,T=1;do{const r=await fetch(`/api/internal/sales_speed/product_items?page=${p}&week_count=5&sort_key=weekly_sales_speed&sort_dir=desc&active=active&page_size=100`,{headers:{Accept:"application/json"},credentials:"include"});if(r.url.includes("/session/new")){alert("Sesión PG expirada");return}const j=await r.json();T=j.meta?.total_pages||1;(j.items||[]).forEach(i=>all.push({sku:i.sku,weeklySalesSpeed:i.weeklySalesSpeed,category:i.category,averageWeeklySales:i.averageWeeklySales}));p++}while(p<=T);const res=await fetch(A+"/api/ingest-velocities",{method:"POST",headers:{"Content-Type":"application/json","x-ingest-secret":S},body:JSON.stringify({items:all})});const o=await res.json();alert(res.ok?`✓ ${o.received} velocidades (act ${o.stats.updated}/creados ${o.stats.created})`:"✗ "+(o.error||res.status))})();
 * ───────────────────────────────────────────────────────────────────────────── */
