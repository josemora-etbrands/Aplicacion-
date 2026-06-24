"use client";
import { useSyncExternalStore } from "react";

/**
 * Store local (localStorage) — reemplaza a la base de datos en modo demo.
 * Persiste por navegador: palancas, marca "Listo" y overlay de "producto nuevo".
 */
export interface Palanca {
  id: string; sku: string; nombre: string; tipoPalanca: string;
  fechaInicio: string; comentario: string | null; implementado: boolean;
}

const SEED_PALANCAS: Palanca[] = [
  { id: "seed1", sku: "DEMO007", nombre: "Freidora de Aire 5L Demo", tipoPalanca: "Aplicar Relámpago", fechaInicio: "2026-06-18", comentario: "Demo: oferta relámpago fin de semana", implementado: false },
  { id: "seed2", sku: "DEMO002", nombre: "Cámara de Seguridad WiFi 2K Demo", tipoPalanca: "Subir el gasto en publicidad", fechaInicio: "2026-06-15", comentario: "Demo: subir presupuesto a $20k/día", implementado: false },
  { id: "seed3", sku: "DEMO003", nombre: "Aspiradora Robot Inteligente Demo", tipoPalanca: "Oportunidades SEO", fechaInicio: "2026-06-12", comentario: "Demo: optimizar título y bullets", implementado: true },
  { id: "seed4", sku: "DEMO010", nombre: "Mochila Antirrobo USB Demo", tipoPalanca: "Profundizar DOD", fechaInicio: "2026-06-10", comentario: "Demo: activar Deal of the Day", implementado: false },
];

const K = { pal: "demo_palancas_v1", listo: "demo_listo_v1", nadd: "demo_nuevos_add_v1", ndel: "demo_nuevos_del_v1" };

function read<T>(key: string, def: T): T {
  if (typeof window === "undefined") return def;
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : def; } catch { return def; }
}
function writeRaw(key: string, val: unknown) { if (typeof window !== "undefined") localStorage.setItem(key, JSON.stringify(val)); }
function write(key: string, val: unknown) { writeRaw(key, val); emit(); }

const listeners = new Set<() => void>();
function emit() { listeners.forEach(l => l()); }

function ensureSeed() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(K.pal) === null) writeRaw(K.pal, SEED_PALANCAS);
}

/* ── Palancas ── */
export function getPalancas(): Palanca[] { ensureSeed(); return read(K.pal, SEED_PALANCAS); }
export function addPalanca(p: Omit<Palanca, "id">) {
  write(K.pal, [{ ...p, id: "p" + Date.now() + Math.random().toString(36).slice(2, 6) }, ...getPalancas()]);
}
export function updatePalanca(id: string, patch: Partial<Palanca>) {
  write(K.pal, getPalancas().map(x => x.id === id ? { ...x, ...patch } : x));
}
export function deletePalanca(id: string) { write(K.pal, getPalancas().filter(x => x.id !== id)); }

/* ── Listo ── */
export function getListo(): string[] { return read(K.listo, []); }
export function toggleListo(sku: string) {
  const s = new Set(getListo()); s.has(sku) ? s.delete(sku) : s.add(sku); write(K.listo, [...s]);
}

/* ── Overlay "producto nuevo" ── */
export function getNuevosOverlay(): { add: string[]; del: string[] } {
  return { add: read<string[]>(K.nadd, []), del: read<string[]>(K.ndel, []) };
}
export function addNuevo(sku: string) {
  const a = new Set(read<string[]>(K.nadd, [])); a.add(sku);
  const d = new Set(read<string[]>(K.ndel, [])); d.delete(sku);
  writeRaw(K.ndel, [...d]); write(K.nadd, [...a]);
}
export function removeNuevo(sku: string) {
  const d = new Set(read<string[]>(K.ndel, [])); d.add(sku);
  const a = new Set(read<string[]>(K.nadd, [])); a.delete(sku);
  writeRaw(K.nadd, [...a]); write(K.ndel, [...d]);
}

/* ── Suscripción para re-render ── */
function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = () => cb();
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => { listeners.delete(cb); if (typeof window !== "undefined") window.removeEventListener("storage", onStorage); };
}
function snapshot(): string {
  if (typeof window === "undefined") return "";
  return [K.pal, K.listo, K.nadd, K.ndel].map(k => localStorage.getItem(k) ?? "").join("|");
}
export function useStoreVersion(): string {
  return useSyncExternalStore(subscribe, snapshot, () => "");
}
