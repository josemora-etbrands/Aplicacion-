/**
 * Motor de Diagnóstico — ET Brands Analysis
 *
 * Semáforo dinámico:
 *   - Usa la PENÚLTIMA semana del historial (última cerrada) para el semáforo y palancas.
 *   - La ÚLTIMA semana se muestra como "en curso" (sin peso en el diagnóstico).
 *   - El historial puede ser cualquier ventana de semanas (cambio de año incluido).
 */

import { weekLabel, weekOrder, type WeekKey } from "./weekUtils";

export type StatusColor = "VERDE" | "AMARILLO" | "ROJO";

/** Una celda del historial de semanas */
export interface WeekSlot {
  year:      number;
  week:      number;
  label:     string;   // "W17"
  value:     number;
  isClosed:  boolean;  // penúltima = base del semáforo
  isCurrent: boolean;  // última = en curso, solo visual
}

export interface ProductDiagnostico {
  sku:              string;
  nombre:           string;
  velocidadInicial: number;
  velocidadMadura:  number;
  margenPct:        number;
  acos:             number;
  acosDisplay:      string;
  publicidad:       number;
  ventas:           number;
  ingresos:         number;
  stock:            number;
  status:           StatusColor;
  statusLabel:      string;
  brecha:           number;
  brechaPct:        number;
  palancasSugeridas: string[];
  // Ventana dinámica de semanas (últimas 5, ordenadas cronológicamente)
  weeks:            WeekSlot[];
  closedWeekLabel:  string;   // "W16" — base del diagnóstico
  closedWeekValue:  number;
  currentWeekLabel: string;   // "W17" — en curso
  currentWeekValue: number;
}

export type ProductInput = {
  sku: string; nombre: string;
  /** Historial de semanas ordenado cronológicamente (la ventana que se quiera mostrar) */
  weekHistory: Array<WeekKey & { value: number }>;
  velocidadInicial: number; velocidadMadura: number;
  margenPct: number; acos: number;
  publicidad?: number; ventas?: number; ingresos?: number;
  stock: number; nota?: string | null;
};

export function calculateStatus(
  ventaSemana: number,
  velocidadInicial: number,
  velocidadMadura: number,
): StatusColor {
  if (ventaSemana >= velocidadMadura)  return "VERDE";
  if (ventaSemana >= velocidadInicial) return "AMARILLO";
  return "ROJO";
}

export function sugerirPalancas(
  p: Pick<ProductInput, "acos" | "stock">,
  closedValue: number,
  status: StatusColor,
): string[] {
  const palancas: string[] = [];

  if (status === "ROJO") {
    if (closedValue === 0) {
      palancas.push("Aplicar Relámpago");
      palancas.push("Subir el gasto en publicidad");
      palancas.push("Oportunidades SEO");
    } else {
      palancas.push("Oportunidades SEO");
      palancas.push("Subir el gasto en publicidad");
    }
    if (p.acos > 0.15) palancas.push("Oportunidad ficha técnica");
    if (p.stock === 0)  palancas.push("Oportunidades logísticas FULL/FLEX");
  }

  if (status === "AMARILLO") {
    palancas.push("Profundizar DOD");
    palancas.push(p.acos < 0.08 ? "Subir el gasto en publicidad" : "Oportunidades imágenes");
  }

  if (status === "VERDE") {
    if (p.acos > 0.1) palancas.push("Disminuir inversión en ads");
  }

  return [...new Set(palancas)];
}

export function diagnosticar(p: ProductInput): ProductDiagnostico {
  // Ordenar cronológicamente (garantía aunque ya vengan ordenadas)
  const sorted = [...p.weekHistory].sort(
    (a, b) => weekOrder(a) - weekOrder(b),
  );

  const n = sorted.length;

  // Penúltima = cerrada (base del semáforo). Última = en curso.
  // Si solo hay 1 semana, usamos la misma para ambos roles.
  const closedEntry  = n >= 2 ? sorted[n - 2] : sorted[n - 1] ?? { year: 0, week: 0, value: 0 };
  const currentEntry = sorted[n - 1] ?? closedEntry;

  const closedValue  = closedEntry.value;
  const closedLabel  = weekLabel(closedEntry);
  const currentValue = currentEntry.value;
  const currentLabel = weekLabel(currentEntry);

  const status = calculateStatus(closedValue, p.velocidadInicial, p.velocidadMadura);
  const brecha = closedValue - p.velocidadMadura;
  const brechaPct = p.velocidadMadura > 0
    ? Math.round((closedValue / p.velocidadMadura) * 100) : 0;

  const weeks: WeekSlot[] = sorted.map((w, i) => ({
    year:      w.year,
    week:      w.week,
    label:     weekLabel(w),
    value:     w.value,
    isClosed:  i === n - 2 || (n === 1 && i === 0),
    isCurrent: i === n - 1,
  }));

  return {
    sku:              p.sku,
    nombre:           p.nombre,
    velocidadInicial: p.velocidadInicial,
    velocidadMadura:  p.velocidadMadura,
    margenPct:        p.margenPct,
    acos:             p.acos,
    acosDisplay:      `${(p.acos * 100).toFixed(1)}%`,
    publicidad:       p.publicidad  ?? 0,
    ventas:           p.ventas      ?? 0,
    ingresos:         p.ingresos    ?? 0,
    stock:            p.stock,
    status,
    statusLabel: status === "VERDE" ? "Óptimo" : status === "AMARILLO" ? "Alerta" : "Crítico",
    brecha,
    brechaPct,
    palancasSugeridas: sugerirPalancas(p, closedValue, status),
    weeks,
    closedWeekLabel:  closedLabel,
    closedWeekValue:  closedValue,
    currentWeekLabel: currentLabel,
    currentWeekValue: currentValue,
  };
}
