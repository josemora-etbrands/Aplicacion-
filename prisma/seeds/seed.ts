/**
 * ET Brands Analysis — Seed Script
 * Pobla la base de datos con los 48 productos reales del Excel
 * "Performance nuevos - SEO y Velocidades"
 *
 * Ejecutar: npx ts-node prisma/seeds/seed.ts
 * (requiere DATABASE_URL en .env)
 */
import { PrismaClient, CategoriaPalanca } from "@prisma/client";
import productsData from "./products-data.json";

const prisma = new PrismaClient();

// Palancas reales del Excel (pestaña "Palancas")
const PALANCAS = [
  // EXPOSICIÓN — aumentar visibilidad y tráfico
  { nombre: "Oportunidades SEO",                   categoria: CategoriaPalanca.EXPOSICION, descripcion: "Optimizar títulos, bullets y descripción para mejorar posicionamiento en búsqueda ML" },
  { nombre: "Oportunidades imágenes",              categoria: CategoriaPalanca.EXPOSICION, descripcion: "Mejorar imágenes de portada y galería para aumentar CTR" },
  { nombre: "Oportunidad clip",                    categoria: CategoriaPalanca.EXPOSICION, descripcion: "Agregar video clip al listing para mejorar conversión y visibilidad" },
  { nombre: "Republicar por mala experiencia",     categoria: CategoriaPalanca.EXPOSICION, descripcion: "Republicar producto por bajas reseñas o mala experiencia acumulada" },
  { nombre: "Profundizar DOD",                     categoria: CategoriaPalanca.EXPOSICION, descripcion: "Activar o intensificar oferta Deal Of the Day para boost de tráfico" },
  { nombre: "Aplicar descuentos mayoristas",       categoria: CategoriaPalanca.EXPOSICION, descripcion: "Configurar descuentos por volumen para atraer compradores mayoristas" },
  { nombre: "Aplicar Relámpago",                   categoria: CategoriaPalanca.EXPOSICION, descripcion: "Activar oferta relámpago para generar pico de ventas y mejorar ranking" },
  { nombre: "Subir el gasto en publicidad",        categoria: CategoriaPalanca.EXPOSICION, descripcion: "Aumentar presupuesto de Producto Patrocinado para ganar más impresiones" },
  { nombre: "Profundizar AON",                     categoria: CategoriaPalanca.EXPOSICION, descripcion: "Activar o intensificar campaña Always On para mantener presencia constante" },
  { nombre: "Aplicar CMR",                         categoria: CategoriaPalanca.EXPOSICION, descripcion: "Usar cupones o descuentos CMR para atraer segmento de clientes objetivo" },
  { nombre: "Oportunidades logísticas FULL/FLEX",  categoria: CategoriaPalanca.EXPOSICION, descripcion: "Migrar a FULL o agregar FLEX para mejorar promesa de envío y posición" },
  { nombre: "Mayoristas",                          categoria: CategoriaPalanca.EXPOSICION, descripcion: "Activar canal mayorista / B2B para aumentar volumen de ventas" },
  { nombre: "Imágenes con IA",                     categoria: CategoriaPalanca.EXPOSICION, descripcion: "Generar imágenes profesionales con IA para mejorar presentación del producto" },
  // CONVERSIÓN — mejorar tasa de cierre
  { nombre: "Oportunidad ficha técnica",           categoria: CategoriaPalanca.CONVERSION, descripcion: "Completar y optimizar ficha técnica del producto para mejorar conversión" },
  { nombre: "Disminuir inversión en ads",          categoria: CategoriaPalanca.CONVERSION, descripcion: "Reducir gasto en publicidad cuando ACOS es ineficiente para mejorar margen" },
  { nombre: "Sacar/Modificar AON",                 categoria: CategoriaPalanca.CONVERSION, descripcion: "Pausar o modificar campaña Always On por bajo rendimiento" },
  { nombre: "Sacar/Modificar DOD/Relámpago",       categoria: CategoriaPalanca.CONVERSION, descripcion: "Pausar oferta DOD o Relámpago que genera ventas sin margen" },
];

async function main() {
  console.log("🌱 Iniciando seed de ET Brands Analysis...\n");

  // 1. Palancas
  console.log("→ Insertando palancas...");
  for (const p of PALANCAS) {
    await prisma.palanca.upsert({
      where:  { nombre: p.nombre },
      update: { categoria: p.categoria, descripcion: p.descripcion },
      create: p,
    });
  }
  console.log(`   ✓ ${PALANCAS.length} palancas listas\n`);

  // 2. Productos reales del Excel
  console.log("→ Insertando productos del Excel...");
  let created = 0, updated = 0;
  for (const p of productsData as typeof productsData) {
    const result = await prisma.product.upsert({
      where:  { sku: p.sku },
      update: {
        nombre: p.nombre, margenPct: p.margenPct, acos: p.acos,
        precioVenta: p.precioVenta, velocidadInicial: p.velocidadInicial,
        velocidadMadura: p.velocidadMadura,
        w13: p.w13, w14: p.w14, w15: p.w15, w16: p.w16, w17: p.w17,
        stock: p.stock, nota: p.nota,
      },
      create: {
        sku: p.sku, nombre: p.nombre, margenPct: p.margenPct, acos: p.acos,
        precioVenta: p.precioVenta, velocidadInicial: p.velocidadInicial,
        velocidadMadura: p.velocidadMadura,
        w13: p.w13, w14: p.w14, w15: p.w15, w16: p.w16, w17: p.w17,
        stock: p.stock, nota: p.nota,
      },
    });
    if (result) created++;
  }
  console.log(`   ✓ ${created} productos insertados/actualizados\n`);

  const counts = await prisma.product.count();
  const palCount = await prisma.palanca.count();
  console.log(`✅ Seed completo: ${counts} productos, ${palCount} palancas en Supabase.`);
}

main()
  .catch(e => { console.error("❌ Error en seed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
