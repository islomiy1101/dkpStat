import type { ReceptionMurojaat } from "@/lib/types";
import type { Workbook, Borders, Fill } from "exceljs";
import { sameBranch } from "@/lib/roles";
import { TUMANLAR, formatFioTitleCase, parseLocalDate } from "@/features/advice/utils";
import { allMahallalar, maqsadTuri, MAQSAD_TURLARI, BOSHQA } from "./stats";

/**
 * "Filial qabulxonasi" Excel hisobotlari (ExcelJS) — Maslahat burchagi hisobotlari (features/advice/excel.ts) uslubida.
 * Kutubxonalar faqat tugma bosilganda yuklanadi.
 */

const thinBorder: Partial<Borders> = {
  top: { style: "thin", color: { argb: "FF808080" } },
  left: { style: "thin", color: { argb: "FF808080" } },
  bottom: { style: "thin", color: { argb: "FF808080" } },
  right: { style: "thin", color: { argb: "FF808080" } },
};
const headerFill: Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6EEF8" } };
const totalFill: Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
const FONT = "Cambria";

const TITLE = `Davlat kadastrlari palatasi Namangan viloyat boshqarmasi va tuman (shahar) filiallarining "Filial qabulxonasi" bo'yicha`;

async function newWorkbook() {
  const ExcelJS = (await import("exceljs")).default;
  return new ExcelJS.Workbook();
}

async function save(wb: Workbook, fileName: string) {
  const { saveAs } = await import("file-saver");
  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName);
}

const colLetter = (n: number) => String.fromCharCode(64 + n);

function titleRows(ws: ReturnType<Workbook["addWorksheet"]>, cols: number, title: string, dateRange: string | null) {
  ws.mergeCells(`A1:${colLetter(cols)}1`);
  const t = ws.getCell("A1");
  t.value = title;
  t.font = { name: FONT, size: 14, bold: true, color: { argb: "FF1F497D" } };
  t.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws.getRow(1).height = 42;
  if (dateRange) {
    ws.mergeCells(`${colLetter(cols - 2)}2:${colLetter(cols)}2`);
    const d = ws.getCell(`${colLetter(cols - 2)}2`);
    d.value = dateRange;
    d.font = { name: FONT, size: 12, italic: true };
    d.alignment = { horizontal: "right", vertical: "bottom" };
    ws.getRow(2).height = 24;
  }
}

function headerRow(ws: ReturnType<Workbook["addWorksheet"]>, rowNum: number, labels: string[], height: number) {
  const row = ws.getRow(rowNum);
  row.height = height;
  labels.forEach((h, i) => {
    const cell = row.getCell(i + 1);
    cell.value = h;
    cell.fill = headerFill;
    cell.border = thinBorder;
    cell.font = { name: FONT, size: 12, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
}

/** "Murojaatlar ro'yxati" varag'i */
function addListSheet(wb: Workbook, list: ReceptionMurojaat[], title: string, dateRange: string | null) {
  const ws = wb.addWorksheet("Murojaatlar ro'yxati", { views: [{ showGridLines: true }] });
  const widths = [7, 13, 14, 32, 20, 30, 10, 10, 40, 30, 22, 10];
  ws.columns = widths.map((width, i) => ({ key: `c${i + 1}`, width }));
  titleRows(ws, widths.length, title, dateRange);
  headerRow(ws, 3, [
    "T/R", "Sana", "Passport", "Fuqaro F.I.Sh", "Tuman (shahar)", "MFY / Manzil", "Keldi", "Ketdi",
    "Kelishdan maqsad", "Qabul qilgan xodim", "Lavozimi", "Murojaat\nsoni",
  ], 36);

  list.forEach((m, idx) => {
    const row = ws.getRow(4 + idx);
    row.height = 30;
    [
      idx + 1, m.sana, m.passport, m.fio ? formatFioTitleCase(m.fio.trim()) : "Mavjud emas", m.tuman, m.manzil,
      m.keldi, m.ketdi || "-", m.maqsad, m.qabulQildi, m.lavozim, m.qaytaMurojaat,
    ].forEach((v, i) => (row.getCell(i + 1).value = v));
    for (let c = 1; c <= widths.length; c++) {
      const cell = row.getCell(c);
      cell.border = thinBorder;
      cell.font = { name: FONT, size: 11 };
      const wrap = c === 4 || c === 6 || c === 9 || c === 10 || c === 11;
      cell.alignment = { horizontal: wrap || c === 5 ? "left" : "center", vertical: "middle", wrapText: wrap };
    }
  });
}

type Stat = { jami: number; birinchi: number; qayta: number; yakunlangan: number; ketmagan: number };
const zero = (): Stat => ({ jami: 0, birinchi: 0, qayta: 0, yakunlangan: 0, ketmagan: 0 });

function perTuman(list: ReceptionMurojaat[]) {
  const by: Record<string, Stat> = Object.fromEntries(TUMANLAR.map((t) => [t, zero()]));
  const total = zero();
  for (const m of list) {
    const name = TUMANLAR.find((t) => sameBranch(t, m.tuman)) || m.tuman || "Mavjud emas";
    if (!by[name]) by[name] = zero();
    for (const s of [by[name], total]) {
      s.jami++;
      if (m.qaytaMurojaat > 1) s.qayta++;
      else s.birinchi++;
      if (m.ketdi) s.yakunlangan++;
      else s.ketmagan++;
    }
  }
  return { by, total };
}

/** "Filiallar kesimida" (yig'ma) varag'i */
function addSummarySheet(wb: Workbook, list: ReceptionMurojaat[], title: string, dateRange: string | null) {
  const ws = wb.addWorksheet("Filiallar kesimida", { views: [{ showGridLines: true }] });
  const widths = [7, 32, 16, 18, 18, 18, 20];
  ws.columns = widths.map((width, i) => ({ key: `c${i + 1}`, width }));
  titleRows(ws, widths.length, title, dateRange);
  headerRow(ws, 3, [
    "T/R", "Hudud nomi", "Jami\nmurojaatlar", "Birinchi marta\nmurojaat qilgan", "Qayta\nmurojaat qilgan",
    "Qabul\nyakunlangan", "Ketish vaqti\nbelgilanmagan",
  ], 48);

  const { by, total } = perTuman(list);
  const fill = (rowNum: number, values: (string | number)[], bold: boolean) => {
    const row = ws.getRow(rowNum);
    row.height = bold ? 28 : 24;
    values.forEach((v, i) => (row.getCell(i + 1).value = v));
    for (let c = 1; c <= widths.length; c++) {
      const cell = row.getCell(c);
      cell.border = thinBorder;
      cell.font = { name: FONT, size: 12, bold };
      if (bold) cell.fill = totalFill;
      cell.alignment = { horizontal: c === 2 ? "left" : "center", vertical: "middle" };
    }
  };
  const vals = (s: Stat) => [s.jami, s.birinchi, s.qayta, s.yakunlangan, s.ketmagan];

  fill(4, ["", "Namangan viloyati (jami)", ...vals(total)], true);
  Object.keys(by).forEach((name, idx) => fill(5 + idx, [idx + 1, name, ...vals(by[name])], false));
}

/** "Murojaat turlari" varag'i: tur bo'yicha, tumanlar kesimida */
function addTurlarSheet(wb: Workbook, list: ReceptionMurojaat[], title: string, dateRange: string | null) {
  const ws = wb.addWorksheet("Murojaat turlari", { views: [{ showGridLines: true }] });
  const turlar = [...MAQSAD_TURLARI.map((t) => t.name), BOSHQA];
  const widths = [7, 34, 14, 12];
  ws.columns = widths.map((width, i) => ({ key: `c${i + 1}`, width }));
  titleRows(ws, widths.length, title, dateRange);
  headerRow(ws, 3, ["T/R", "Murojaat turi", "Soni", "Ulushi"], 30);
  const count: Record<string, number> = Object.fromEntries(turlar.map((t) => [t, 0]));
  for (const m of list) count[maqsadTuri(m.maqsad)]++;
  const total = list.length || 1;
  const rows = turlar.map((t) => [t, count[t]] as const).sort((a, b) => (a[0] === BOSHQA ? 1 : b[0] === BOSHQA ? -1 : b[1] - a[1]));
  const put = (r: number, vals: (string | number)[], bold: boolean) => {
    const row = ws.getRow(r);
    row.height = 22;
    vals.forEach((v, i) => (row.getCell(i + 1).value = v));
    for (let c = 1; c <= widths.length; c++) {
      const cell = row.getCell(c);
      cell.border = thinBorder;
      cell.font = { name: FONT, size: 12, bold };
      if (bold) cell.fill = totalFill;
      cell.alignment = { horizontal: c === 2 ? "left" : "center", vertical: "middle" };
      if (c === 4) cell.numFmt = "0.0%";
    }
  };
  put(4, ["", "Jami", list.length, 1], true);
  rows.forEach(([t, n], i) => put(5 + i, [i + 1, t, n, n / total], false));
}

/** "Mahallalar" varag'i: tuman · mahalla · soni */
function addMahallaSheet(wb: Workbook, list: ReceptionMurojaat[], title: string, dateRange: string | null) {
  const ws = wb.addWorksheet("Mahallalar", { views: [{ showGridLines: true }] });
  const widths = [7, 26, 34, 12];
  ws.columns = widths.map((width, i) => ({ key: `c${i + 1}`, width }));
  titleRows(ws, widths.length, title, dateRange);
  headerRow(ws, 3, ["T/R", "Tuman (shahar)", "Mahalla (MFY)", "Murojaatlar\nsoni"], 32);
  allMahallalar(list).forEach((m, i) => {
    const row = ws.getRow(4 + i);
    row.height = 20;
    [i + 1, m.tuman, m.name, m.count].forEach((v, k) => (row.getCell(k + 1).value = v));
    for (let c = 1; c <= widths.length; c++) {
      const cell = row.getCell(c);
      cell.border = thinBorder;
      cell.font = { name: FONT, size: 11 };
      cell.alignment = { horizontal: c === 2 || c === 3 ? "left" : "center", vertical: "middle" };
    }
  });
  ws.autoFilter = { from: "A3", to: "D3" };
}

const pad = (n: number) => String(n).padStart(2, "0");
const dmy = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;

function filterByRange(list: ReceptionMurojaat[], start: number, end: number) {
  return list.filter((m) => {
    const d = m.sana ? parseLocalDate(m.sana) : null;
    if (!d || isNaN(d.getTime())) return false;
    const t = d.getTime();
    return t >= start && t <= end;
  });
}

async function buildAndDownload(list: ReceptionMurojaat[], dateRange: string, fileName: string) {
  const wb = await newWorkbook();
  addSummarySheet(wb, list, `${TITLE} HISOBOTI`, dateRange);
  addTurlarSheet(wb, list, `${TITLE} murojaat turlari`, dateRange);
  addMahallaSheet(wb, list, `${TITLE} mahallalar kesimida`, dateRange);
  addListSheet(wb, list, `${TITLE} murojaatlar ro'yxati`, dateRange);
  await save(wb, fileName);
}

/** Sana oralig'i bo'yicha hisobot (yig'ma + ro'yxat) */
export async function exportByDates(source: ReceptionMurojaat[], startDate: Date, endDate: Date) {
  const sStr = dmy(startDate);
  const eStr = dmy(endDate);
  const rangeStr = `${sStr}-yildan ${eStr}-yilgacha`;
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999).getTime();
  const filtered = filterByRange(source, start, end);
  if (filtered.length === 0) {
    alert(`Tanlangan muddatda (${rangeStr}) birorta ham murojaat topilmadi!`);
    return;
  }
  await buildAndDownload(filtered, rangeStr, `qabulxona_${sStr}_${eStr}.xlsx`);
}

/** Joriy hafta (dushanba — juma yoki bugun) bo'yicha hisobot */
export async function exportWeekly(source: ReceptionMurojaat[]) {
  const today = new Date();
  const dow = today.getDay();
  const diffToMonday = (dow === 0 ? -6 : 1) - dow;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diffToMonday, 0, 0, 0, 0);
  const friday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4, 23, 59, 59, 999);
  let endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
  if (today > friday) endDate = friday;
  const weekRangeStr = `${dmy(monday)}-yildan ${dmy(endDate)}-yilgacha`;

  let data = filterByRange(source, monday.getTime(), endDate.getTime());
  if (data.length === 0) {
    if (!confirm(`Joriy haftada (${weekRangeStr}) birorta ham murojaat topilmadi.\nBarcha mavjud murojaatlarni yuklab olishni xohlaysizmi?`)) return;
    data = [...source];
  }
  await buildAndDownload(data, weekRangeStr, "qabulxonaWeekly.xlsx");
}

/** Viloyat yig'ma hisoboti — butun baza bo'yicha (yig'ma + ro'yxat) */
export async function exportRegionalSummary(all: ReceptionMurojaat[]) {
  try {
    if (all.length === 0) {
      alert("Bazada hali birorta ham murojaat mavjud emas!");
      return;
    }
    const wb = await newWorkbook();
    addSummarySheet(wb, all, `${TITLE} YIG'MA HISOBOTI`, null);
    addTurlarSheet(wb, all, `${TITLE} murojaat turlari`, null);
    addMahallaSheet(wb, all, `${TITLE} mahallalar kesimida`, null);
    addListSheet(wb, all, `${TITLE} murojaatlar ro'yxati`, null);
    await save(wb, "qabulxonaAll.xlsx");
  } catch (err) {
    console.error("Yig'ma hisobot eksportida xatolik:", err);
    alert("Hisobotni shakllantirishda xatolik: " + (err as Error).message);
  }
}
