# BITÁCORA — ET Brands Analysis (`Aplicacion-`)

> **Propósito:** registro vivo de la arquitectura, errores conocidos y cambios hechos.
> **REGLA DE ORO (para Claude / CTO):** LEER este archivo COMPLETO antes de cada push.
> Después de cada cambio, agregar una entrada en el CHANGELOG (arriba del todo, orden
> cronológico inverso). Si se arregla un bug listado en "ERRORES CONOCIDOS", moverlo a
> "RESUELTOS" con la fecha y el commit. Nunca pisar código sin revisar esta bitácora.

---

## 1. QUÉ ES ESTE PROYECTO

Dashboard de análisis de rendimiento de los productos de **ET Brands en Mercado Libre 2026**.
Núcleo = "semáforo de velocidades de venta": por cada SKU compara las ventas de la última
semana cerrada contra dos metas y asigna estado + sugiere "palancas" (acciones de marketing).

- 🟢 VERDE = ventas ≥ meta madura (óptimo)
- 🟡 AMARILLO = entre meta inicial y madura (alerta)
- 🔴 ROJO = bajo meta inicial (crítico)
- ⚪ SIN_STOCK = stock ≤ 0 (tiene prioridad sobre todo lo demás)

La "semana de referencia" es la **penúltima** del historial (última cerrada); la última semana
en curso se calcula pero no se muestra en la ventana cerrada.

## 2. STACK / DESPLIEGUE

- **Next.js 16.2.4** (App Router) + **React 19.2.4** + TypeScript + Tailwind v4.
- **Prisma 7.7** con driver adapter `@prisma/adapter-pg` sobre **Postgres** (Supabase).
- **Deploy:** Vercel. Push a `main` en GitHub `josemora-etbrands/Aplicacion-` → deploy automático.
- Build: `prisma generate && next build` (NO se corre `prisma db push` en build — cuelga con el pooler de Vercel; ver commit `4e61cb2`).
- `vercel.json` installCommand: `npm install && npx prisma generate`.

### Variables de entorno (Vercel → Settings → Environment Variables)
| Variable | Uso |
|---|---|
| `DATABASE_URL` | cadena Postgres (Supabase). Requerida. |
| `PROFITGUARD_API_URL` | default `https://app.profitguard.cl` |
| `PROFITGUARD_API_KEY` | Bearer token de ProfitGuard. Sin esto, `/api/sync-api` falla con 500. |
| `INGEST_SECRET` | secreto para el endpoint `/api/ingest-velocities`. Debe ir también en el bookmarklet. Sin esto el endpoint responde 500. |
| `CRON_SECRET` | (opcional) protege el `GET /api/sync-api` que dispara el cron de Vercel. Vercel lo envía como `Authorization: Bearer`. |

## 3. MODELO DE DATOS (prisma/schema.prisma)

- **Product**: sku (único), nombre, velocidadInicial, velocidadMadura, margenPct, acos,
  precioVenta, publicidad, ventas, ingresos, stock, nota, métricas ML opcionales.
- **WeeklySales**: ventas por (productId, year, week). Único por esas 3 claves.
  ⚠️ El historial semanal vive AQUÍ, NO en columnas `w13..w17` (eso es esquema viejo).
- **Palanca** / **PalancaLog** / **ActionLog**: acciones de marketing y su registro/impacto.
- Enums: `CategoriaPalanca` (EXPOSICION|CONVERSION), `EjecutadoPor` (USUARIO|IA).

## 4. ESTRUCTURA / RUTAS

Páginas reales: `/` (dashboard), `/importar`, `/test-db`.
API:
- `POST /api/sync-api` — sync completo desde ProfitGuard (catálogo + órdenes 6 sem + stock).
- `POST /api/import-report` — importa Excel (autodetecta PROFIT vs VELOCIDAD).
- `POST /api/execute-palanca` — registra una acción de palanca.
- `GET  /api/diagnostico` — diagnóstico de todos los SKUs.
- `GET  /api/sku/[sku]` — detalle de un SKU.
- `POST|DELETE /api/sku/[sku]/palanca-log` — registro de palancas por SKU.
- `GET  /api/explore-pg` — **TEMPORAL**, explora endpoints PG. Eliminar.

Librerías clave: `app/lib/profitguard-api.ts` (catálogo+stock), `profitguard-orders.ts`
(órdenes→ventas semanales), `profitguard-passthrough.ts` (stock ML), `diagnostico.ts`
(motor del semáforo), `weekUtils.ts` (manejo de semanas ISO).

## 5. ⚠️ ERRORES / DEUDAS CONOCIDAS (revisar antes de tocar lo relacionado)

1. **`prisma/seeds/seed.ts` está roto contra el esquema actual.** Usa campos `w13..w17`
   en `product.upsert` que YA NO existen (migrados a `WeeklySales`). Correrlo fallará.
   No ejecutar el seed sin reescribirlo para usar la relación `weeklySales`.
2. **`POST /api/execute-palanca` está roto.** Llama `diagnosticar(product)` pasándole un
   objeto Prisma `Product` que NO tiene `weekHistory` → `diagnosticar` hace `[...p.weekHistory]`
   y revienta. Además lee `diagnostico.ultimaSemana`, campo que no existe en `ProductDiagnostico`.
   Hay que mapear el product a `ProductInput` (con weekHistory) y usar campos válidos.
3. **Sidebar apunta a rutas inexistentes.** `/red-zone`, `/ia-history`, `/api-config` no
   tienen página → dan 404. Falta crearlas o quitar los links.
4. **Prisma client duplicado.** Existen `lib/prisma.ts` y `app/lib/prisma.ts` idénticos.
   Los imports usan `@/lib/prisma`. El de `app/lib/prisma.ts` parece no usarse. Consolidar.
5. ~~`acos` en DB casi siempre 0~~ → **RESUELTO 2026-06-18**: sync-api ahora trae gasto
   publicitario vía `/api/v1/product_ads` y llena `publicidad` + calcula `acos`.
6. ~~`/api/explore-pg` es temporal~~ → **RESUELTO 2026-06-18**: eliminada.

### Deudas nuevas / pendientes
7. **Categoría ABC pendiente de migración.** PG entrega `category` (a/b/c/d) en el endpoint
   interno, pero la tabla `Product` no tiene columna `categoria`. Falta migración + persistir.
   El bookmarklet ya captura `category` en el payload; `/api/ingest-velocities` aún la ignora.
8. **PG tiene UNA sola meta de velocidad (`weeklySalesSpeed`), la app usa dos.**
   `/api/ingest-velocities` mapea: `velocidadMadura = weeklySalesSpeed`,
   `velocidadInicial = round(weeklySalesSpeed * 0.3)`. El 0.3 es un default a validar con negocio.
9. **Bookmarklet sin configurar.** En `/importar` y `scripts/sync-velocities.js` hay que
   reemplazar `__APP_URL__` (URL de Vercel) y `__SECRET__` (= INGEST_SECRET) por los valores reales.

### 🔑 HALLAZGO CLAVE — velocidades y auth
Las metas de velocidad y la categoría ABC viven en `GET /api/internal/sales_speed/product_items`
(campos `weeklySalesSpeed`, `category`, `averageWeeklySales`, `weeklySales[]`, `totalStock`).
**Ese endpoint NO acepta el Bearer API key** (responde 302 → `/session/new`): solo funciona con
la cookie de sesión del navegador. Por eso se sincroniza vía bookmarklet desde el browser logueado,
no desde el server de Vercel. Todo lo demás SÍ sale con el Bearer (`/api/v1/*`).

## 6. FLUJO DE TRABAJO (CTO ↔ usuario)

1. Usuario manda prompt con lo que quiere.
2. Claude LEE esta bitácora completa.
3. Implementa el cambio en `C:\Users\Lenovo\Aplicacion-`.
4. (Si aplica) verifica build/typecheck localmente.
5. Agrega entrada al CHANGELOG.
6. `git add -A && git commit && git push origin main` → Vercel despliega.
7. Si algo falla en Vercel, registrar el error aquí en ERRORES CONOCIDOS.

---

## 7. CHANGELOG (más reciente arriba)

### 2026-06-19 (noche 8) — Gestión del filtro "Producto nuevo" desde la app ✓
- Migración: columnas `esNuevo` (bool) + `ordenLlegada` (int) en products. El filtro y el orden
  de llegada ahora viven en la DB (no en código). Sembrados los 69 desde el código (orden 0..68).
- `/api/productos-nuevos` (GET/POST/DELETE + seed). POST solo marca SKUs EXISTENTES (no crea);
  ordenLlegada = último + 1. UI en la tabla: agregar SKU al filtro + quitar (✕) por fila.
- Coloreo de ventas semanales: verde ≥ madura, amarillo ≥ inicial, blanco < inicial.
- Detalle por SKU: agregada "Publicidad $" (KPI + serie) derivada de % × unidades × ticket.
- Las velocidades manuales de los 69 siguen en `VELOCIDADES_NUEVOS` (código); SKUs agregados por
  la app usan madura PG / inicial = ¼ salvo que se les setee target manual.

### 2026-06-19 (noche 7) — Velocidad Inicial/Madura + targets manuales nuevos ✓
- Columna "Velocidad" → "Velocidad Madura"; agregada "Velocidad Inicial" antes = 1/4 de la madura.
- Los 69 productos nuevos usan velocidades inicial/madura SETEADAS A MANO (targets ET Brands),
  en `VELOCIDADES_NUEVOS` (productosNuevos.ts). Aplica a columnas y al semáforo.
- Resto de productos: madura = velocidad PG, inicial = madura/4. INICIAL_RATIO ingest → 0.25.
- Helpers `maduraOf/inicialOf` en la tabla (override manual si existe). Validado: WIPESBEBE001
  15,3/46,7; WIPESADULTO001 11,6/35.

### 2026-06-19 (noche 6) — Mejoras de detalle + filtro Producto nuevo ✓
- Modal de detalle: **tooltip** al pasar el puntero (todas las métricas de la semana, como PG);
  palancas con **comentario**, **editar** (nuevo PATCH en palanca-log) y **eliminar**; e **impacto
  en unidades** por palanca (prom 4 sem después vs 4 antes → "▲ aumentó en X uds" / "▼ bajó en X").
- Quitada la sección "Acciones IA — SKUs Críticos" de la home (a pedido del usuario).
- **Filtro "Producto nuevo"** en la tabla: lista en `app/lib/productosNuevos.ts` (69 SKUs en
  ORDEN DE LLEGADA = orden del array). Al activarlo, muestra solo esos SKUs y SIEMPRE en orden
  de llegada (override del sort). **Para agregar nuevos: añadirlos AL FINAL del array.**

### 2026-06-19 (noche 5) — Modal de detalle por SKU estilo ProfitGuard ✓
- Clon del detalle de PG (`/sales_speed/product_items/{id}`). Fuente: endpoint interno
  `/api/internal/sales_speed/product_items/{id}/performance?group_by=week&from=YYYY-01-01&to=hoy`
  → KPIs (totalUnits, averageIncome, marginPercentage, adSpendPercentage) + `chart.series`
  semanal (units, stock, averageTicket, marginPercentage, adSpendPercentage).
- El sync de navegador ahora baja TAMBIÉN el detalle por SKU (1 call /performance por item, en
  lotes de 8). Se guarda en `velocidadData.detalle`. Esto alarga el sync a ~5 min (803 calls).
- `/api/sku/[sku]` devuelve `detalle`. `SkuDetailModal` reescrito: KPIs estilo PG + gráfico
  multilínea con 5 series toggleables (Inventario/Ventas/Ticket/Margen %/Publicidad %) + registro
  de palancas. Se abre al clic en el SKU en la home.
- Validado: CAMZEK005 → Ventas 680, Ticket $19.555, Margen 32.7%, Pub 5.2%, 26 semanas (idéntico a PG).
- NOTA: el bookmarklet de "Datos / Sync" ahora también trae el detalle (sync ~5 min, no 30s).

### 2026-06-19 (noche 4) — Fusión Dashboard + Velocidad de Ventas ✓
- A pedido del usuario: se eliminó el Dashboard y se llevó lo útil a Velocidad de Ventas, que
  ahora es la **home (`/`)**. La tabla de velocidad se mantuvo igual (no se tocó su funcionamiento).
- Agregado a la home: **semáforo por SKU** (columna Estado, vía `diagnosticar()` usando la meta
  de velocidad + semanas de PG), **lista de SKUs críticos prioritarios + palancas IA**, y
  **modal de detalle al clic** en el SKU (SkuDetailModal).
- Semáforo solo se calcula si velocidad > 0. Resultado: 45 🔴 / 113 🟡 / 109 🟢 / 110 ⚪.
- Sidebar simplificado: "Velocidad de Ventas" (/) + "Datos / Sync". Eliminada ruta `/velocidad`
  duplicada y links muertos (red-zone, ia-history, api-config).
- Componentes viejos del dashboard (MetricCard, VelocityChart, DiagnosticoTable) quedan sin uso.

### 2026-06-19 (noche 3) — Página "Velocidad de Ventas" (espejo de PG) ✓
- **Migración aplicada** vía `/api/admin/migrate` (raw ALTER con DATABASE_URL de Vercel, sin
  password local): columnas `categoria` TEXT, `velocidadPromedio` DOUBLE, `velocidadData` JSONB.
  Resuelve la deuda #7 (categoría ABC).
- `ingest-velocities` ahora guarda categoría ABC, promedio, semanas y asociaciones (bloque
  `velocidadData`) para TODOS los productos (incluso velocidad 0, para mostrarlos como PG).
  Las metas del semáforo solo se actualizan si velocidad > 0.
- **Nueva página `/velocidad`** (+ link en Sidebar): clon de la tabla de PG — Producto (+ N
  productos/asociaciones), Categoría, Velocidad, columnas de semanas dinámicas (W##), Promedio,
  Stock Total. Buscador, orden por cualquier columna, export CSV.
- Validado: WIPESBEBE001 cat D / vel 400 / prom 658 / stock 15.849 (idéntico a PG). 803 productos.
- **"Tiempo real":** el endpoint de PG es cookie-only, así que la app no puede leerlo server-side.
  La página refleja el último sync de navegador (script `sync-velocities.js` ahora envía el bloque
  completo). No es live al segundo, pero un clic lo deja idéntico a PG.

### 2026-06-19 (noche 2) — ACoS REAL de Mercado Libre ✓
- Implementado el ACoS real (gasto / ventas atribuidas a ads), reemplazando el TACOS provisional.
- Fuente: passthrough ML `/advertising/advertisers/78477/product_ads/items?metrics=cost,total_amount`
  (server-side con Bearer, ~10s). Mapeo item MLC→SKU vía `/items?attributes=seller_custom_field`.
  Agrega por SKU: `acos = Σcost / Σtotal_amount`. Lib: `app/lib/profitguard-acos.ts`.
- Nuevo `/api/sync-acos` = dueño del campo `acos`. `ingest-finance` ya NO setea acos.
  Agregado al cron diario (paralelo con stock). 139 SKUs con ACoS real.
- Dashboard (`DiagnosticoTable`) ahora muestra `d.acos` (real) en vez de recalcular TACOS.
- Validado vs ML: MASHOM002 6.3%/6.9%, MAN15KG001 14.1%/12.4%. Difieren un poco porque las
  métricas de ads de ML son casi en tiempo real (la ventana incluye hoy). Resuelve deuda del ACoS.
- Solo SKUs con actividad publicitaria tienen ACoS; el resto muestra "—" (correcto).

### 2026-06-19 (noche) — Margen estilo-PG + fix escala /100 ✓
- **BUG CRÍTICO de escala:** los montos CLP de PG en `cents` SON pesos enteros (CLP no tiene
  decimales). El código dividía por 100 → ingresos/ventas/publicidad quedaban 100× chicos.
  Corregido en orders y ads (cents = pesos). Verificado: `cents:66656` ↔ `"$66.656"`.
- **Margen replicado de PG** (fórmula del `/dashboard/financial_summary`):
  `margen = realIncome + extraTarjeta − COGS − publicidad`, `margen% = margen / ingresos`.
- **PG no expone margen por-SKU de todos los productos** (solo global + top 10). Solución:
  agregar TODAS las órdenes (≈36k/6sem) vía navegador desde `/api/internal/orders`
  (`realIncome` por orden ya trae comisión y envío), prorratear por SKU, y enviar a
  **`/api/ingest-finance`** (servidor completa con COGS + ads). Script: `scripts/sync-finance.js`.
- **Resultado validado vs PG:** MASHOM002 34.5% (PG 34.3%), HOWELL001GRI 36.8% (36.0%),
  CAMZEK001 25.6% (24.3%). Calza dentro de ~1-4pp. Antes daba 14.5% (mal).
- Diferencia residual: ingresos app ~3-10% > PG → probablemente incluyo órdenes que PG
  excluye (canceladas/devueltas). Pendiente afinar filtro de `status` si se requiere exactitud.
- **El cron diario YA NO toca el financiero** (`sync-orders` sacado del orquestador): solo
  catálogo + stock. Así el financiero del navegador no se sobreescribe con datos parciales.
  El financiero y las velocidades se actualizan vía sync de navegador (manual, ~10-13 min).
- `acos` sigue siendo TACOS provisional (= publicidad/ingresos). ACoS real de ML: PENDIENTE.
- `/api/sync-orders` y `/api/sync-api` quedan legacy (no usados por el cron).

### 2026-06-19 (tarde 5) — Definición de metas confirmada con negocio ✓
- Confirmado: **Meta Madura = `weeklySalesSpeed`** ("la velocidad" de PG), NO `averageWeeklySales`
  ("la velocidad promedio"). El usuario quiere "la velocidad".
- **Meta Inicial = 27.5%** de la madura (punto medio entre 25% y 30%, definido por el usuario).
  `INICIAL_RATIO` en `ingest-velocities` cambiado 0.3 → 0.275.
- Re-sincronizado: 377 metas. Verificado: WIPESBEBE001 400→inicial 110, CAMZEK001 350→inicial 96.
- Resuelve la deuda #8 (mapeo de meta única→doble).

### 2026-06-19 (tarde 4) — Solo productos activos ✓
- `sync-catalog` ahora filtra por `pg.active === true` (solo trae activos) y **elimina** de la app
  los productos que NO estén en el set de activos (`deleteMany where sku notIn activeSkus`).
  ActionLog se borra primero (no tiene cascade); WeeklySales/PalancaLog caen en cascada.
- Guard: si no hay activos, NO borra (evita vaciar la DB por una respuesta vacía de PG).
- **Ejecutado:** 798 totales → 489 activos (quedan) + 309 inactivos (eliminados). App = 489 productos.

### 2026-06-19 (tarde 3) — Sync dividido + orquestador cron ✓
- Creados endpoints livianos: `/api/sync-catalog` (~18s), `/api/sync-stock` (~47s),
  `/api/sync-orders`, `/api/sync-ads`. Cada uno corre como invocación serverless propia.
- **`/api/cron/sync`** orquesta: catálogo primero, luego stock+órdenes+ads en paralelo.
  Cada fase escribe por su cuenta → aunque el orquestador llegue a 300s, los datos aterrizan.
- `vercel.json`: el cron diario (09:00) ahora apunta a `/api/cron/sync` (antes al sync-api pesado).
- **Probado:** tras correr el orquestador, catálogo creció 700→798 productos y el semáforo se
  actualizó (55🔴/145🟡/100🟢). Funciona.
- **ACOS:** sync-ads corre en paralelo a sync-orders, así que usa los ingresos del ciclo previo
  (desfase de 1 día, aceptable para cron diario; se corrige solo).
- **Legacy:** `/api/sync-api` (monolítico) queda solo para debug manual; ya NO lo usa el cron.

### 2026-06-19 (tarde 2) — Fix de stock + sync dividido en fases ✓
- **Bug de stock encontrado:** `fetchProductStocks` leía `item.product_sku` (plano) pero el SKU
  viene anidado en `item.product.sku` → stock siempre 0. Corregido.
- **Causa raíz de timeouts:** `/api/sync-api` (catálogo+órdenes+ads+stock) excede los 300s de
  Vercel y lo matan antes de escribir stock. Solución: **dividir en endpoints livianos.**
- Nuevo **`/api/sync-stock`** (solo stock): corre en ~47s. Ejecutado → 798 SKUs mapeados,
  312 con stock>0, 700 productos actualizados.
- **RESULTADO:** dashboard con datos reales. Semáforo: 95 🔴 / 123 🟡 / 82 🟢 (resto sin stock).
- **Pendiente:** dividir también órdenes y ads en endpoints livianos y apuntar el/los cron(s)
  a ellos (hoy `vercel.json` apunta al sync-api pesado que puede no completar).

### 2026-06-19 (tarde) — DB restaurada + velocidades cargadas ✓
- Usuario restauró Supabase (estaba pausado). `/api/diagnostico` → 200. DB con ~697 productos.
- **Sync de velocidades ejecutado** (vía navegador, en 3 lotes de ~300): **377 metas escritas**,
  el resto (425) tenía `weeklySalesSpeed=0` en PG y se omitió correctamente.
- Verificado en DB: WIPESBEBE001 madura=400/inicial=120, CAMZEK001 madura=350/inicial=105.
- Disparado `sync-api` (POST) para poblar catálogo/órdenes/stock/ads.

### 2026-06-19 — Sync de velocidades (CORS + perf) y caída de DB
- **CORS** agregado a `/api/ingest-velocities` (OPTIONS + headers) porque el bookmarklet
  corre en `app.profitguard.cl` y envía a `aplicacion-neon.vercel.app` (cross-origin).
- **Perf:** `ingest-velocities` ahora hace upserts en paralelo por lotes de 25 (antes 1×1,
  802 ítems excedían el timeout de 45s del navegador). Stats ahora: `{processed, skipped}`.
- **Verificado:** el endpoint autentica OK con `INGEST_SECRET = etb_vel_7Kq2mZ9xR4pL8nW`
  (responde 400 "No se recibieron items" con items vacíos; 401 con secret malo).
- 🚩 **INCIDENTE — DB caída:** `/api/diagnostico`, `/api/sku/*` y el dashboard devuelven
  "Sin conexión DB" (HTTP 500). Causa probable: **proyecto Supabase pausado por inactividad**
  (plan free pausa tras ~7 días; el repo no se tocaba desde abr-27). **Acción del usuario:**
  Supabase dashboard → restaurar/resume el proyecto. Una vez arriba, re-correr el sync de
  velocidades (vía navegador) y un sync-api para poblar catálogo/ventas/stock/ads.

### 2026-06-18 — Migración a ProfitGuard API (eliminar subida de datos)
**Instrucción:** eliminar toda la subida de datos (Excel + botón manual) y traer todo desde ProfitGuard.
- **Eliminado:** `app/api/import-report` (Excel), `app/api/explore-pg` (temporal), dependencia `xlsx`.
- **`/api/sync-api` potenciado:** nueva lib `app/lib/profitguard-ads.ts` (gasto vía `/api/v1/product_ads`).
  Ahora llena `publicidad` y calcula `acos` automáticamente (antes requería Excel PROFIT).
- **Sync automático:** `vercel.json` con cron diario (`0 9 * * *`) que dispara `GET /api/sync-api`
  (protegido por `CRON_SECRET`). Se eliminó el botón manual de la UI.
- **Velocidades por navegador:** nuevo `POST /api/ingest-velocities` (protegido con `INGEST_SECRET`)
  + bookmarklet (`scripts/sync-velocities.js` y botón "Copiar bookmarklet" en `/importar`).
- **UI:** `/importar` reescrita (sin Excel ni botón sync) → página de estado + sync de velocidades.
  Sidebar: "Importar Reporte" → "Datos / Sync".
- **Verificado:** `next build` ✓ (los errores TS de `execute-palanca`/`seed.ts` son preexistentes
  y no rompen por `ignoreBuildErrors: true`).
- **Pendiente:** setear `INGEST_SECRET` (y opcional `CRON_SECRET`) en Vercel; configurar el bookmarklet;
  migración para la columna `categoria` ABC (ver deudas 7-9).

### 2026-06-18 — Onboarding del CTO + creación de la bitácora
- Se clonó el repo a `C:\Users\Lenovo\Aplicacion-` y se leyó el proyecto completo.
- Se creó este archivo `BITACORA.md`.
- Se documentaron 6 errores/deudas conocidas (ver sección 5). Aún SIN corregir.
- Estado del repo al iniciar: último commit `4e61cb2` (remove prisma db push from build).
- Sin cambios de código todavía.
