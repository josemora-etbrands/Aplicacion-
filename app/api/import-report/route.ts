import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

type ReportType = "PROFIT" | "VELOCIDAD" | "UNKNOWN";

function detectType(headers: string[]): ReportType {
  const h = new Set(headers.map(s => s?.toString().trim()));
  if (h.has("Margen %") && h.has("Publicidad"))           return "PROFIT";
  if (h.has("W16") && h.has("W17") && h.has("Stock Total")) return "VELOCIDAD";
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

    // Preferir hoja "Report"; si no existe, usar la primera
    const sheetName = wb.SheetNames.includes("Report") ? "Report" : wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets[sheetName],
      { defval: null }
    );

    if (rows.length === 0)
      return NextResponse.json({ error: "El archivo no contiene datos" }, { status: 400 });

    const headers = Object.keys(rows[0]);
    const reportType = detectType(headers);

    if (reportType === "UNKNOWN")
      return NextResponse.json({
        error: "Tipo de reporte no reconocido. Debe contener 'Margen %' + 'Publicidad' (Profit) o 'W16' + 'W17' + 'Stock Total' (Velocidad).",
      }, { status: 422 });

    let updated = 0, created = 0, skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const sku = row["SKU"]?.toString().trim();
      if (!sku) { skipped++; continue; }

      try {
        if (reportType === "PROFIT") {
          const data = {
            margenPct:  num(row["Margen %"]),
            publicidad: num(row["Publicidad"]),
            ventas:     num(row["Ventas"]),
            ingresos:   num(row["Ingresos"]),
          };
          const nombre = row["Nombre"]?.toString().trim() ?? sku;
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
          const data = {
            w13:   num(row["W13"]),
            w14:   num(row["W14"]),
            w15:   num(row["W15"]),
            w16:   num(row["W16"]),
            w17:   num(row["W17"]),
            stock: Math.round(num(row["Stock Total"])),
          };
          const nombre = row["Nombre"]?.toString().trim() ?? sku;
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
      stats: { total: rows.length, updated, created, skipped },
      errors,
    });
  } catch (error) {
    console.error("[POST /api/import-report]", error);
    return NextResponse.json({ error: "Error interno al procesar el archivo" }, { status: 500 });
  }
}
