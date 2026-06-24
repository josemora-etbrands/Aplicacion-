/**
 * MODO DEMO — productos nuevos inventados.
 * (La data real fue retirada; estos son SKUs ficticios para mostrar la app.)
 */
export const PRODUCTOS_NUEVOS: string[] = [
  "DEMO001",
  "DEMO002",
  "DEMO003",
  "DEMO004",
  "DEMO005",
];

/** Map SKU → índice de llegada (0 = primero en llegar). */
export const ORDEN_LLEGADA: Record<string, number> = Object.fromEntries(
  PRODUCTOS_NUEVOS.map((sku, i) => [sku, i]),
);

/** Velocidades [inicial, madura] manuales de los productos nuevos demo. */
export const VELOCIDADES_NUEVOS: Record<string, { inicial: number; madura: number }> = {
  DEMO001: { inicial: 3,   madura: 12 },
  DEMO002: { inicial: 5,   madura: 20 },
  DEMO003: { inicial: 2,   madura: 8 },
  DEMO004: { inicial: 4,   madura: 15 },
  DEMO005: { inicial: 2.5, madura: 10 },
};

/** Fecha de llegada (ISO) de los productos nuevos demo. */
export const FECHAS_LLEGADA_NUEVOS: Record<string, string> = {
  DEMO001: "2026-05-20",
  DEMO002: "2026-05-25",
  DEMO003: "2026-06-01",
  DEMO004: "2026-06-05",
  DEMO005: "2026-06-10",
};
