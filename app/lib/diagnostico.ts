/**
 * Motor de Diagnóstico — ET Brands Analysis
 * Lógica de negocio basada en la pestaña "Revisión velocidades" del Excel
 */

export type StatusColor = "VERDE" | "AMARILLO" | "ROJO";

export interface ProductDiagnostico {
  sku:             string;
  nombre:          string;
  ultimaSemana:    number;   // ventas W17 (o último no-cero disponible)
  semanaRef:       string;   // "W17", "W16", etc.
  velocidadInicial: number;
  velocidadMadura:  number;
  margenPct:        number;
  acos:             number;
  acosDisplay:      string;  // "4.9%"
  stock:            number;
  status:           StatusColor;
  statusLabel:      string;
  brecha:           number;  // ultimaSemana - velocidadMadura
  brechaPct:        number;  // % respecto a meta madura
  palancasSugeridas: string[];
  w13: number; w14: number; w15: number; w16: number; w17: number;
}

type ProductInput = {
  sku: string; nombre: string;
  w13: number; w14: number; w15: number; w16: number; w17: number;
  velocidadInicial: number; velocidadMadura: number;
  margenPct: number; acos: number;
  stock: number; nota?: string | null;
};

/** Determina cuál semana usar como referencia (última con datos) */
export function getLastWeek(p: ProductInput): { value: number; label: string } {
  // W16 = última semana CERRADA → base del diagnóstico y palancas.
  // W17 está en curso y puede estar incompleta; se muestra en UI pero no se usa aquí.
  return { value: p.w16, label: "W16" };
}

/** Calcula estado: VERDE / AMARILLO / ROJO */
export function calculateStatus(ventaSemana: number, velocidadInicial: number, velocidadMadura: number): StatusColor {
  if (ventaSemana >= velocidadMadura)  return "VERDE";
  if (ventaSemana >= velocidadInicial) return "AMARILLO";
  return "ROJO";
}

/** Sugiere palancas según el estado y métricas del producto */
export function sugerirPalancas(p: ProductInput, status: StatusColor): string[] {
  const palancas: string[] = [];
  const lastWeek = getLastWeek(p).value;

  if (status === "ROJO") {
    // Sin ventas o muy bajas → necesita exposición urgente
    if (lastWeek === 0) {
      palancas.push("Aplicar Relámpago");
      palancas.push("Subir el gasto en publicidad");
      palancas.push("Oportunidades SEO");
    } else {
      palancas.push("Oportunidades SEO");
      palancas.push("Subir el gasto en publicidad");
    }
    // ACOS alto → publicidad ineficiente
    if (p.acos > 0.15) palancas.push("Oportunidad ficha técnica");
    if (p.stock === 0) palancas.push("Oportunidades logísticas FULL/FLEX");
  }

  if (status === "AMARILLO") {
    palancas.push("Profundizar DOD");
    if (p.acos < 0.08) palancas.push("Subir el gasto en publicidad");
    else palancas.push("Oportunidades imágenes");
  }

  if (status === "VERDE") {
    // Optimizar margen cuando está bien posicionado
    if (p.acos > 0.1) palancas.push("Disminuir inversión en ads");
  }

  return [...new Set(palancas)]; // sin duplicados
}

/** Genera diagnóstico completo de un producto */
export function diagnosticar(p: ProductInput): ProductDiagnostico {
  const { value: ultimaSemana, label: semanaRef } = getLastWeek(p);
  const status = calculateStatus(ultimaSemana, p.velocidadInicial, p.velocidadMadura);
  const brecha = ultimaSemana - p.velocidadMadura;
  const brechaPct = p.velocidadMadura > 0
    ? Math.round((ultimaSemana / p.velocidadMadura) * 100)
    : 0;

  return {
    sku:              p.sku,
    nombre:           p.nombre,
    ultimaSemana,
    semanaRef,
    velocidadInicial: p.velocidadInicial,
    velocidadMadura:  p.velocidadMadura,
    margenPct:        p.margenPct,
    acos:             p.acos,
    acosDisplay:      `${(p.acos * 100).toFixed(1)}%`,
    stock:            p.stock,
    status,
    statusLabel:      status === "VERDE" ? "Óptimo" : status === "AMARILLO" ? "Alerta" : "Crítico",
    brecha,
    brechaPct,
    palancasSugeridas: sugerirPalancas(p, status),
    w13: p.w13, w14: p.w14, w15: p.w15, w16: p.w16, w17: p.w17,
  };
}
