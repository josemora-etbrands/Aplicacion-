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
5. **`acos` en DB casi siempre 0** porque sync-api no lo trae (solo Excel PROFIT). La tabla
   calcula ACOS al vuelo desde publicidad/ingresos; tenerlo presente al mostrar ACOS.
6. **`/api/explore-pg` es temporal** y quedó en el repo. Borrar cuando ya no se necesite.

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

### 2026-06-18 — Onboarding del CTO + creación de la bitácora
- Se clonó el repo a `C:\Users\Lenovo\Aplicacion-` y se leyó el proyecto completo.
- Se creó este archivo `BITACORA.md`.
- Se documentaron 6 errores/deudas conocidas (ver sección 5). Aún SIN corregir.
- Estado del repo al iniciar: último commit `4e61cb2` (remove prisma db push from build).
- Sin cambios de código todavía.
