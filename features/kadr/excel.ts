import type { Borders, Cell, Fill, Font, Row, Workbook, Worksheet } from "exceljs";
import { rateTone, type KadrAgg, type KadrFilial, type KadrStats } from "./model";

/**
 * "Kadrlar statistikasi" — Excel (ExcelJS): ranglar sahifadagidek (styles/kadr.css).
 * Varaqlar: Filiallar kesimida (viloyat doirasida) · Bo'limlar va lavozimlar · Toifalar (viloyat doirasida).
 * Kutubxonalar faqat tugma bosilganda yuklanadi.
 */

const FONT = "Calibri";
const solid = (argb: string): Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: `FF${argb}` } });
const line = (argb = "CBD5E1") => ({ style: "thin" as const, color: { argb: `FF${argb}` } });
const BORDER: Partial<Borders> = { top: line(), left: line(), bottom: line(), right: line() };

/** Sarlavha ranglari: asosiy ustunlar — ko'k, vakant — qizil, to'lganlik — yashil */
const HEAD = {
  base: { fill: "E0F2FE", font: "0C4A6E" },
  vakant: { fill: "FEE2E2", font: "991B1B" },
  rate: { fill: "DCFCE7", font: "166534" },
} as const;
type HeadTone = keyof typeof HEAD;

/** To'lganlik: ≥95% yashil, 80–95% sariq, <80% qizil (rateTone) */
const RATE = { good: { fill: "DCFCE7", font: "16A34A" }, mid: { fill: "FEF3C7", font: "D97706" }, bad: { fill: "FEE2E2", font: "DC2626" } } as const;
const VAKANT_FONT = "DC2626";

const font = (f: Partial<Font> = {}): Partial<Font> => ({ name: FONT, size: 11, ...f });
/** Chop etish: A4 albom, kengligi bitta sahifaga sig'adi */
const PAGE = { paperSize: 9, orientation: "landscape" as const, fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true };

function styleCell(cell: Cell, opts: { fill?: string; color?: string; bold?: boolean; align?: "left" | "center" | "right"; indent?: number; wrap?: boolean } = {}) {
  cell.border = BORDER;
  cell.font = font({ bold: opts.bold, color: opts.color ? { argb: `FF${opts.color}` } : undefined });
  if (opts.fill) cell.fill = solid(opts.fill);
  cell.alignment = { horizontal: opts.align ?? "left", vertical: "middle", indent: opts.indent, wrapText: opts.wrap };
}

/** Varaq boshi: sarlavha (birlashtirilgan) va ma'lumot holati */
function addTitle(ws: Worksheet, width: number, title: string, sub: string) {
  ws.mergeCells(1, 1, 1, width);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = font({ size: 14, bold: true, color: { argb: "FF0F172A" } });
  t.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws.getRow(1).height = 30;
  ws.mergeCells(2, 1, 2, width);
  const s = ws.getCell(2, 1);
  s.value = sub;
  s.font = font({ italic: true, color: { argb: "FF475569" } });
  s.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(2).height = 20;
}

function addHeader(ws: Worksheet, rowNo: number, cols: { title: string; tone: HeadTone }[], height = 32) {
  const row = ws.getRow(rowNo);
  row.height = height;
  cols.forEach((c, i) => {
    const cell = row.getCell(i + 1);
    cell.value = c.title;
    styleCell(cell, { fill: HEAD[c.tone].fill, color: HEAD[c.tone].font, bold: true, align: "center", wrap: true });
  });
}

/** Shtat · Band · Vakant · (vakant lavozimlar) · To'lganlik kataklari */
function fillAgg(row: Row, from: number, a: KadrAgg, opts: { bold?: boolean; fill?: string; extra?: (number | null)[] } = {}) {
  const vals: (number | null)[] = [a.shtat, a.band, a.vakant, ...(opts.extra ?? [])];
  vals.forEach((v, i) => {
    const cell = row.getCell(from + i);
    // Vakant lavozimlar ustunlarida 0 — bo'sh (sahifadagidek)
    cell.value = v === null || (v === 0 && i >= 3) ? null : v;
    const isVakant = i >= 2 && (v ?? 0) > 0;
    styleCell(cell, { fill: opts.fill, bold: opts.bold || isVakant, color: isVakant ? VAKANT_FONT : undefined, align: "center" });
  });
  const rc = row.getCell(from + vals.length);
  const tone = RATE[rateTone(a.rate)];
  rc.value = a.rate;
  rc.numFmt = "0%";
  styleCell(rc, { fill: tone.fill, color: tone.font, bold: true, align: "center" });
}

/** 1. Filiallar kesimida (sahifadagi jadval) */
function addFilialsSheet(wb: Workbook, stats: KadrStats, filials: KadrFilial[], sub: string) {
  const lav = stats.vakantLavozimlar;
  const width = 5 + lav.length;
  const ws = wb.addWorksheet("Filiallar kesimida", { views: [{ state: "frozen", xSplit: 1, ySplit: 3 }], pageSetup: PAGE });
  ws.columns = [{ width: 34 }, { width: 10 }, { width: 10 }, { width: 10 }, ...lav.map(() => ({ width: 14 })), { width: 13 }];
  addTitle(ws, width, "Kadrlar statistikasi — filiallar kesimida", sub);
  addHeader(ws, 3, [
    { title: "Filial", tone: "base" }, { title: "Shtat", tone: "base" }, { title: "Band", tone: "base" }, { title: "Vakant", tone: "vakant" },
    ...lav.map((l) => ({ title: l, tone: "vakant" as const })),
    { title: "To'lganlik", tone: "rate" },
  ], lav.length ? 64 : 32);

  const total = ws.getRow(4);
  total.height = 22;
  total.getCell(1).value = "Viloyat jami";
  styleCell(total.getCell(1), { fill: "EEF2FF", bold: true });
  fillAgg(total, 2, stats.total, { bold: true, fill: "EEF2FF", extra: lav.map((l) => stats.vakantBy[l] ?? null) });
  for (let c = 1; c <= width; c++) total.getCell(c).border = { ...BORDER, bottom: { style: "medium", color: { argb: "FFC7D2FE" } } };

  filials.forEach((f, i) => {
    const row = ws.getRow(5 + i);
    row.height = 20;
    row.getCell(1).value = f.name;
    styleCell(row.getCell(1));
    fillAgg(row, 2, f, { extra: lav.map((l) => f.vakantBy[l] ?? null) });
  });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 4 + filials.length, column: width } };
}

/** 2. Bo'limlar va lavozimlar (har bir filial) */
function addDetailSheet(wb: Workbook, filials: KadrFilial[], sub: string) {
  const ws = wb.addWorksheet("Bo'limlar va lavozimlar", { views: [{ state: "frozen", ySplit: 3 }], pageSetup: PAGE });
  ws.columns = [{ width: 52 }, { width: 18 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 13 }];
  addTitle(ws, 6, "Kadrlar statistikasi — bo'limlar va lavozimlar kesimida", sub);
  addHeader(ws, 3, [
    { title: "Bo'lim / lavozim", tone: "base" }, { title: "Toifa", tone: "base" }, { title: "Shtat", tone: "base" },
    { title: "Band", tone: "base" }, { title: "Vakant", tone: "vakant" }, { title: "To'lganlik", tone: "rate" },
  ]);
  let r = 4;
  for (const f of filials) {
    // Filial qatori — ko'k fon, oq matn
    const fr = ws.getRow(r++);
    fr.height = 22;
    ws.mergeCells(fr.number, 1, fr.number, 2);
    fr.getCell(1).value = f.name;
    styleCell(fr.getCell(1), { fill: "0284C7", color: "FFFFFF", bold: true });
    fillAgg(fr, 3, f, { bold: true, fill: "E0F2FE" });
    for (const b of f.bolimlar) {
      const br = ws.getRow(r++);
      br.getCell(1).value = b.name;
      styleCell(br.getCell(1), { fill: "F8FAFC", bold: true, indent: 1 });
      styleCell(br.getCell(2), { fill: "F8FAFC" });
      fillAgg(br, 3, b, { bold: true, fill: "F8FAFC" });
      for (const p of b.positions) {
        const pr = ws.getRow(r++);
        pr.getCell(1).value = p.lavozim;
        styleCell(pr.getCell(1), { indent: 3, wrap: true });
        pr.getCell(2).value = p.toifa || null;
        styleCell(pr.getCell(2), { color: "4338CA", align: "center" });
        fillAgg(pr, 3, { shtat: p.shtat, band: p.band, vakant: p.vakant, rate: p.shtat ? p.band / p.shtat : 0 });
      }
    }
  }
}

/** 3. Toifalar kesimida */
function addToifaSheet(wb: Workbook, stats: KadrStats, sub: string) {
  const ws = wb.addWorksheet("Toifalar", { views: [{ state: "frozen", ySplit: 3 }], pageSetup: PAGE });
  ws.columns = [{ width: 30 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 13 }];
  addTitle(ws, 5, "Kadrlar statistikasi — toifalar kesimida", sub);
  addHeader(ws, 3, [
    { title: "Toifa", tone: "base" }, { title: "Shtat", tone: "base" }, { title: "Band", tone: "base" },
    { title: "Vakant", tone: "vakant" }, { title: "To'lganlik", tone: "rate" },
  ]);
  stats.toifalar.forEach((t, i) => {
    const row = ws.getRow(4 + i);
    row.getCell(1).value = t.name;
    styleCell(row.getCell(1));
    fillAgg(row, 2, t);
  });
}

const pad = (n: number) => String(n).padStart(2, "0");

type ExportOpts = { filials: KadrFilial[]; regional: boolean; branch: string; uploadedAt: string };

/** Excel kitobi (brauzerga bog'liq emas) */
export async function buildKadrWorkbook(stats: KadrStats, opts: ExportOpts): Promise<Workbook> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "DKP Namangan";
  const sub = [opts.regional ? "Viloyat bo'yicha" : opts.branch, opts.uploadedAt ? `ma'lumot holati: ${opts.uploadedAt}` : ""].filter(Boolean).join(" · ");

  if (opts.regional) addFilialsSheet(wb, stats, opts.filials, sub);
  addDetailSheet(wb, opts.regional ? opts.filials : stats.filials, sub);
  if (opts.regional && stats.toifalar.length) addToifaSheet(wb, stats, sub);
  return wb;
}

export async function exportKadrExcel(stats: KadrStats, opts: ExportOpts) {
  const wb = await buildKadrWorkbook(stats, opts);
  const { saveAs } = await import("file-saver");
  const now = new Date();
  const today = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `Kadrlar_statistikasi_${today}.xlsx`);
}
