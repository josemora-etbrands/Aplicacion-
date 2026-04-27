/**
 * Stock desde Mercado Libre vía ProfitGuard passthrough
 *
 * Flujo:
 *   1. GET /users/{userId}/items/search  → lista de IDs de ML (MLC...)
 *   2. GET /items?ids=MLC1,MLC2,...       → available_quantity + seller_custom_field (SKU)
 *   3. Devuelve Map<sku, stock>
 */

const BASE_URL = (process.env.PROFITGUARD_API_URL ?? "https://app.profitguard.cl").replace(/\/$/, "");
const API_KEY  = process.env.PROFITGUARD_API_KEY ?? "";

const ML_USER_ID       = "613899966";
const ML_INTEGRATION_ID = 1;          // Mercado Libre
const ITEMS_PER_PAGE   = 100;
const IDS_PER_BATCH    = 20;          // ML acepta hasta 20 IDs por request
const PARALLEL_BATCHES = 5;

// ── Helper ────────────────────────────────────────────────────────

async function mlGet(mlPath: string): Promise<unknown> {
  const res = await fetch(
    `${BASE_URL}/api/v1/integrations/${ML_INTEGRATION_ID}/passthrough`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({ path: mlPath }),
    },
  );
  if (!res.ok) throw new Error(`ML passthrough ${res.status}: ${mlPath}`);
  const json = await res.json() as Record<string, unknown>;
  // El body del passthrough está en json.body
  return json.body ?? json;
}

// ── Paso 1: obtener todos los IDs de ML del vendedor ─────────────

async function fetchAllMLItemIds(): Promise<string[]> {
  const ids: string[] = [];
  let offset = 0;

  // Primera página para saber el total
  const first = await mlGet(
    `/users/${ML_USER_ID}/items/search?limit=${ITEMS_PER_PAGE}&offset=0`,
  ) as Record<string, unknown>;

  const firstResults = (first.results ?? []) as string[];
  const total = ((first.paging as Record<string, unknown>)?.total as number) ?? 0;
  ids.push(...firstResults);
  offset += firstResults.length;

  console.log(`[ML Stock] Total items en ML: ${total}`);

  // Páginas restantes en paralelo (lotes de PARALLEL_BATCHES)
  const offsets: number[] = [];
  while (offset < total) {
    offsets.push(offset);
    offset += ITEMS_PER_PAGE;
  }

  for (let i = 0; i < offsets.length; i += PARALLEL_BATCHES) {
    const batch = offsets.slice(i, i + PARALLEL_BATCHES);
    const pages = await Promise.all(
      batch.map(off =>
        mlGet(`/users/${ML_USER_ID}/items/search?limit=${ITEMS_PER_PAGE}&offset=${off}`)
          .catch(() => ({ results: [] })),
      ),
    );
    for (const page of pages) {
      ids.push(...((page as Record<string, unknown>).results as string[] ?? []));
    }
  }

  console.log(`[ML Stock] ${ids.length} IDs de items descargados`);
  return ids;
}

// ── Paso 2: obtener available_quantity y SKU para cada ID ─────────

interface MLItem {
  id:                   string;
  available_quantity:   number;
  seller_custom_field?: string | null;
  attributes?:          Array<{ id: string; value_name?: string }>;
}

async function fetchItemsBatch(ids: string[]): Promise<MLItem[]> {
  // ML acepta multi-get: /items?ids=MLC1,MLC2,...
  const data = await mlGet(`/items?ids=${ids.join(",")}`);
  // La respuesta es un array de { code, body } cuando se usan múltiples IDs
  if (Array.isArray(data)) {
    return data
      .filter((r: Record<string, unknown>) => r.code === 200 && r.body)
      .map((r: Record<string, unknown>) => r.body as MLItem);
  }
  // Respuesta de un solo item
  return [data as MLItem];
}

/** Extrae el SKU de un item de ML */
function extractSkuFromItem(item: MLItem): string | null {
  // 1. seller_custom_field suele ser el SKU del vendedor
  if (item.seller_custom_field?.trim()) return item.seller_custom_field.trim();

  // 2. Atributo SELLER_SKU en los attributes
  const skuAttr = item.attributes?.find(a => a.id === "SELLER_SKU");
  if (skuAttr?.value_name?.trim()) return skuAttr.value_name.trim();

  return null;
}

// ── Función principal ─────────────────────────────────────────────

/**
 * Descarga el stock actual de todos los productos en Mercado Libre
 * y los devuelve como Map<sku, stockTotal>.
 *
 * stockTotal = suma de available_quantity de todos los items con ese SKU
 * (un SKU puede tener múltiples publicaciones en ML).
 */
export async function fetchMLStock(): Promise<Map<string, number>> {
  console.log("[ML Stock] Iniciando descarga de stock desde ML vía passthrough…");

  const allIds    = await fetchAllMLItemIds();
  const stockMap  = new Map<string, number>();
  let   processed = 0;

  // Procesar en lotes de IDS_PER_BATCH, paralelizando PARALLEL_BATCHES lotes
  const idBatches: string[][] = [];
  for (let i = 0; i < allIds.length; i += IDS_PER_BATCH) {
    idBatches.push(allIds.slice(i, i + IDS_PER_BATCH));
  }

  for (let i = 0; i < idBatches.length; i += PARALLEL_BATCHES) {
    const parallelBatches = idBatches.slice(i, i + PARALLEL_BATCHES);
    const results = await Promise.all(
      parallelBatches.map(ids => fetchItemsBatch(ids).catch(() => [] as MLItem[])),
    );

    for (const items of results) {
      for (const item of items) {
        const sku = extractSkuFromItem(item);
        if (!sku) continue;
        const current = stockMap.get(sku) ?? 0;
        stockMap.set(sku, current + (item.available_quantity ?? 0));
        processed++;
      }
    }

    console.log(`[ML Stock] ${Math.min(i + PARALLEL_BATCHES, idBatches.length) * IDS_PER_BATCH}/${allIds.length} items procesados`);
  }

  console.log(`[ML Stock] ✓ Stock mapeado: ${stockMap.size} SKUs únicos de ${processed} items`);
  return stockMap;
}
