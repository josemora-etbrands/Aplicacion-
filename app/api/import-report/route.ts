import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import {
  parseWeekHeader,
  assignYears,
  currentISOWeek,
} from "@/app/lib/weekUtils";

type ReportType = "PROFIT" | "VELOCIDAD" | "UNKNOWN";

function detectType(headers: string[]): ReportType {
  const h = new Set(headers.map(s => s?.toString().trim()));
  if (h.has("Margen %") && h.has("Publicidad"))              return "PROFIT";
  if (h.has("Stock Total") && headers.some(hdr => /^W\d+$/.test(hdr.trim()))) return "VELOCIDAD";
  return "UNKNOWN";
}

function num(v: unknown): number {
  const n = parseFloat(String(v ?? 0).replace(",", "."));
  return isNaN(n) ? 0 : n;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No se recibió ningún archivo" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheetName = wb.SheetNames.includes("Report") ? "Report" : wb.SheetNames[0];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets[sheetName],
      { defval: null },
    );
    // Normalizar claves: recortar espacios para evitar fallos en row["Stock Total"] etc.
    const rows = rawRows.map(r =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim(), v]))
    );

    if (rows.length === 0)
      return NextResponse.json({ error: "El archivo no contiene datos" }, { status: 400 });

    const headers = Object.keys(rows[0]);
    const reportType = detectType(headers);

    if (reportType === "UNKNOWN")
      return NextResponse.json({
        error: "Reporte no reconocido. Debe tener 'Margen %' + 'Publicidad' (Profit) o columnas 'W##' + 'Stock Total' (Velocidad).",
      }, { status: 422 });

    let updated = 0, created = 0, skipped = 0;
    const errors: string[] = [];

    // ── VELOCIDAD: detectar semanas dinámicamente ──────────────────────
    let weekCols: Array<{ header: string; week: number; year: number }> = [];

    if (reportType === "VELOCIDAD") {
      const { year: refYear, week: refWeek } = currentISOWeek();
      const weekHeaders = headers.filter(h => parseWeekHeader(h) !== null);
      const weekNumbers = weekHeaders.map(h => parseWeekHeader(h)!);
      const assigned   = assignYears(weekNumbers, refYear, refWeek);
      weekCols = weekHeaders.map((h, i) => ({
        header: h,
        week:   assigned[i].week,
        year:   assigned[i].year,
      }));
    }

    for (const row of rows) {
      const sku = row["SKU"]?.toString().trim();
      if (!sku) { skipped++; continue; }

      try {
        if (reportType === "PROFIT") {
          const publicidad = num(row["Publicidad"]);
          const ingresos   = num(row["Ingresos"]);
          const data = {
            margenPct:  num(row["Margen %"]),
            publicidad,
            ventas:     num(row["Ventas"]),
            ingresos,
            acos:       ingresos > 0 ? publicidad / ingresos : 0,
          };
          const nombre  = row["Nombre"]?.toString().trim() ?? sku;
          const existing = await prisma.product.findUnique({ where: { sku } });
          if (existing) {
            await prisma.product.update({ where: { sku }, data });
            updated++;
          } else {
            await prisma.product.create({
              data: { sku, nombre, ...data, velocidadInicial: 1.2, velocidadMadura: 4.7 },
            });
            created++;
          }

        } else {
          // VELOCIDAD
          const stock   = Math.round(num(row["Stock Total"]));
          const nombre  = row["Nombre"]?.toString().trim() ?? sku;

          // Asegurar que el producto exista
          let product = await prisma.product.findUnique({ where: { sku } });
          if (!product) {
            product = await prisma.product.create({
              data: { sku, nombre, stock, velocidadInicial: 1.2, velocidadMadura: 4.7 },
            });
            created++;
          } else {
            await prisma.product.update({ where: { sku }, data: { stock } });
            updated++;
          }

          // Guardar TODAS las semanas en weekly_sales (upsert)
          for (const col of weekCols) {
            const value = num(row[col.header]);
            await prisma.weeklySales.upsert({
              where:  { productId_year_week: { productId: product.id, year: col.year, week: col.week } },
              update: { value },
              create: { productId: product.id, year: col.year, week: col.week, value },
            });
          }

        }
      } catch (err) {
        if (errors.length < 5) errors.push(`SKU ${sku}: ${String(err)}`);
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      reportType,
      sheetUsed: sheetName,
      weekColumns: reportType === "VELOCIDAD" ? weekCols.length : undefined,
      stats: { total: rows.length, updated, created, skipped },
      errors,
    });
  } catch (error) {
    console.error("[POST /api/import-report]", error);
    return NextResponse.json({ error: "Error interno al procesar el archivo" }, { status: 500 });
  }
}
