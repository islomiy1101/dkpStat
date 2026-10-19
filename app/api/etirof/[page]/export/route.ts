import { NextResponse } from "next/server";
import { requireArea } from "@/lib/auth";
import { loadEtirofRows } from "@/lib/etirof-server";
import { ETIROF_PAGES, isEtirofPage, isTotalName } from "@/features/etirof/config";

/**
 * GET /api/etirof/<page>/export?tuman=… — shu tumanning xom ro'yxat varaqlaridagi qatorlari (.xlsx, har bir varaq alohida).
 * tuman — Свод'ning A ustunidagi lotincha nom (kirillchasi ham bo'ladi, features/etirof/config.ts → tumanKey).
 * "Viloyat jami" (yoki tuman berilmasa) — butun viloyat.
 */
export const dynamic = "force-dynamic";

const numLike = /^-?\d{1,15}([.,]\d+)?$/;

export async function GET(req: Request, ctx: { params: Promise<{ page: string }> }) {
  const u = await requireArea("etirof");
  if (u instanceof Response) return u;
  const { page } = await ctx.params;
  if (!isEtirofPage(page)) return NextResponse.json({ error: "Noma'lum sahifa" }, { status: 404 });
  const q = new URL(req.url).searchParams;
  const tuman = (q.get("tuman") || "").trim().slice(0, 100);

  try {
    const sheets = await loadEtirofRows(page, tuman, q.has("fresh"));
    if (sheets.every((s) => !s.rows.length)) return NextResponse.json({ error: `"${tuman}" bo'yicha qatorlar topilmadi` }, { status: 404 });

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    // Har bir xom varaq — Excel'da alohida varaq (qatori bo'lmasa ham, sarlavhasi bilan)
    for (const { sheet, headers, rows } of sheets) {
      const ws = wb.addWorksheet(sheet.replace(/[\\/?*[\]:]/g, " ").slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
      ws.addRow(headers);
      for (const r of rows) {
        // Kichik butun/kasr sonlar son bo'lib yoziladi (Excel'da yig'indi chiqsin); uzun ID'lar va 0 bilan boshlanganlar — matn
        ws.addRow(headers.map((_, i) => {
          const v = String(r[i] ?? "").trim();
          return numLike.test(v) && !/^-?0\d/.test(v) && v.replace(/\D/g, "").length <= 12 ? Number(v.replace(",", ".")) : v;
        }));
      }
      const head = ws.getRow(1);
      head.height = 32;
      head.eachCell((c) => {
        c.font = { bold: true, color: { argb: "FFFFFFFF" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
        c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      });
      ws.columns.forEach((col, i) => {
        const longest = Math.max(headers[i]?.length || 0, ...rows.slice(0, 500).map((r) => String(r[i] ?? "").length));
        col.width = Math.min(Math.max(longest + 2, 8), 50);
      });
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
    }

    const buf = await wb.xlsx.writeBuffer();
    const name = !tuman || isTotalName(tuman) ? "Viloyat" : tuman;
    const date = new Date().toISOString().slice(0, 10);
    const file = `${name.replace(/\s+/g, "_")}_${ETIROF_PAGES[page].title.replace(/['\s]+/g, "_")}_${date}.xlsx`;
    return new Response(new Uint8Array(buf as ArrayBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
