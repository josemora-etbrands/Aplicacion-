/**
 * Utilidades de semanas — ET Brands Analysis
 * Maneja orden cronológico correcto incluyendo cambio de año W52→W1.
 */

export interface WeekKey {
  year: number;
  week: number;
}

/** Ordena cronológicamente: 2025-W52 < 2026-W1 < 2026-W17 */
export function weekOrder(k: WeekKey): number {
  return k.year * 100 + k.week;
}

export function weekLabel(k: WeekKey): string {
  return `W${k.week}`;
}

/**
 * Dado un array de semanas del reporte (columnas "W1"–"W52") y
 * la semana de referencia actual (año + número), asigna el año
 * correcto a cada columna con manejo de cambio de año.
 *
 * Ejemplo: refYear=2026, refWeek=17
 *   W17 → 2026, W16 → 2026, ..., W1 → 2026, W52 → 2025, W51 → 2025 ...
 */
export function assignYears(
  weekNumbers: number[],
  refYear: number,
  refWeek: number,
): WeekKey[] {
  return weekNumbers.map(w => {
    const year = w <= refWeek ? refYear : refYear - 1;
    return { year, week: w };
  });
}

/** Extrae el número de semana de una cabecera "W17" → 17. Retorna null si no es semana. */
export function parseWeekHeader(header: string): number | null {
  const m = /^W(\d{1,2})$/.exec(header.trim());
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Dada la fecha actual, calcula el número de semana ISO.
 * Usado para determinar la semana de referencia al importar.
 */
export function currentISOWeek(date = new Date()): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

/** Ordena un array de WeekKey cronológicamente (ascendente). */
export function sortWeeks(weeks: WeekKey[]): WeekKey[] {
  return [...weeks].sort((a, b) => weekOrder(a) - weekOrder(b));
}

/** Deduplica y ordena, retorna las últimas N semanas. */
export function lastNWeeks(weeks: WeekKey[], n: number): WeekKey[] {
  const unique = new Map<string, WeekKey>();
  for (const w of weeks) unique.set(`${w.year}-${w.week}`, w);
  return sortWeeks([...unique.values()]).slice(-n);
}
