import type { Murojaat } from "@/lib/types";
import type { Workbook, Worksheet, Borders, Fill } from "exceljs";
import { TUMANLAR, formatFioTitleCase, getLatestDailyAppeals, isFilial, isVakolatsiz, normalizeName, parseLocalDate } from "./utils";

/**
 * Original myjs.js dagi Excel hisobotlar (ExcelJS) — chiqadigan fayllar bir xil.
 * Kutubxonalar faqat tugma bosilganda yuklanadi (sahifa tezroq ochiladi).
 */

const thinBorder: Partial<Borders> = {
  top: { style: "thin", color: { argb: "FF808080" } },
  left: { style: "thin", color: { argb: "FF808080" } },
  bottom: { style: "thin", color: { argb: "FF808080" } },
  right: { style: "thin", color: { argb: "FF808080" } },
};
const headerFill: Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6EEF8" } };

const HUDUDLAR_KRIL = [
  "Косонсой тумани", "Мингбулоқ тумани", "Наманган тумани", "Норин тумани", "Поп тумани", "Тўрақўрғон тумани",
  "Уйчи тумани", "Учқўрғон тумани", "Чортоқ тумани", "Чуст тумани", "Янгиқўрғон тумани", "Наманган шаҳар",
  "Давлатобод тумани", "Янги Наманган тумани",
];
const HUDUD_MAP: Record<string, string> = {
  "Косонсой тумани": "Kosonsoy tumani", "Мингбулоқ тумани": "Mingbuloq tumani", "Наманган тумани": "Namangan tumani",
  "Норин тумани": "Norin tumani", "Поп тумани": "Pop tumani", "Тўрақўрғон тумани": "To'raqo'rg'on tumani",
  "Уйчи тумани": "Uychi tumani", "Учқўрғон тумани": "Uchqo'rg'on tumani", "Чортоқ тумани": "Chortoq tumani",
  "Чуст тумани": "Chust tumani", "Янгиқўрғон тумани": "Yangiqo'rg'on tumani", "Наманган шаҳар": "Namangan shahar",
  "Давлатобод тумани": "Davlatobod tumani", "Янги Наманган тумани": "Yangi Namangan tumani",
};

async function newWorkbook() {
  const ExcelJS = (await import("exceljs")).default;
  return new ExcelJS.Workbook();
}

async function save(wb: Workbook, fileName: string) {
  const { saveAs } = await import("file-saver");
  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName);
}

/** "Murojaatlar ro'yxati" varag'i */
function addListSheet(wb: Workbook, list: Murojaat[], title: string, dateRange: string | null) {
  const ws = wb.addWorksheet("Murojaatlar ro'yxati", { views: [{ showGridLines: true }] });
  ws.columns = [8, 18, 34, 55, 18, 18, 20].map((width, i) => ({ key: `col${i + 1}`, width }));

  ws.mergeCells("A1:G1");
  const t = ws.getCell("A1");
  t.value = title;
  t.font = { name: "Cambria", size: 14, bold: true, color: { argb: "FF1F497D" } };
  t.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws.getRow(1).height = 42;

  if (dateRange) {
    ws.mergeCells("E2:G2");
    const d = ws.getCell("E2");
    d.value = dateRange;
    d.font = { name: "Cambria", size: 12, italic: true };
    d.alignment = { horizontal: "right", vertical: "bottom" };
    ws.getRow(2).height = 24;
  }

  ws.mergeCells("A3:A4"); ws.getCell("A3").value = "T/R";
  ws.mergeCells("B3:D3"); ws.getCell("B3").value = "Murojaatchi haqida";
  ws.mergeCells("E3:G3"); ws.getCell("E3").value = "Murojaatga ko'rilgan choralar";
  ws.getCell("B4").value = 'Yuridikga\n"1" raqami\nJismoniyga\n"2" raqami\nqo\'yiladi';
  ws.getCell("C4").value = "F.I.SH";
  ws.getCell("D4").value = "Murojaat mazmuni";
  ws.getCell("E4").value = "Ijobiy hal\netilgan\nmurojaatlar";
  ws.getCell("F4").value = "Filialga\nyo'naltirilgan\nmurojaatlar";
  ws.getCell("G4").value = "Vakolati\ndoirasiga\nkirmaydigan\nmurojaatlar";
  ws.getRow(3).height = 30;
  ws.getRow(4).height = 80;
  for (let r = 3; r <= 4; r++)
    for (let c = 1; c <= 7; c++) {
      const cell = ws.getRow(r).getCell(c);
      cell.fill = headerFill;
      cell.border = thinBorder;
      cell.font = { name: "Cambria", size: 14, bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    }

  let cI = 0, cF = 0, cV = 0;
  for (const item of list) {
    if (isFilial(item)) cF++;
    else if (isVakolatsiz(item)) cV++;
    else cI++;
  }
  ws.getRow(5).height = 28;
  ws.getCell("A5").value = "";
  ws.getCell("B5").value = "";
  ws.getCell("C5").value = "Jami";
  ws.getCell("D5").value = "";
  ws.getCell("E5").value = cI;
  ws.getCell("F5").value = cF;
  ws.getCell("G5").value = cV;
  for (let c = 1; c <= 7; c++) {
    const cell = ws.getRow(5).getCell(c);
    cell.border = thinBorder;
    cell.font = { name: "Cambria", size: 14, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  }

  list.forEach((item, idx) => {
    const row = ws.getRow(6 + idx);
    row.height = 30;
    const f = isFilial(item) ? 1 : "";
    const v = isVakolatsiz(item) ? 1 : "";
    row.getCell(1).value = idx + 1;
    row.getCell(2).value = item.shaxsTuri == 1 || item.shaxsTuri === "Yuridik" ? 1 : 2;
    row.getCell(3).value = item.fio ? formatFioTitleCase(String(item.fio).trim()) : "Mavjud emas";
    row.getCell(4).value = item.maqsad || "";
    row.getCell(5).value = !f && !v ? 1 : "";
    row.getCell(6).value = f;
    row.getCell(7).value = v;
    for (let c = 1; c <= 7; c++) {
      const cell = row.getCell(c);
      cell.border = thinBorder;
      cell.font = { name: "Cambria", size: 14 };
      cell.alignment = { horizontal: c === 1 || c === 2 || c >= 5 ? "center" : "left", vertical: "middle", wrapText: c < 5 && c > 2 };
    }
  });
  return ws;
}

/** "Filiallar kesimida" varag'i */
function addFilialSheet(wb: Workbook, list: Murojaat[], masullar: Record<string, string>, dateRange: string | null) {
  const ws: Worksheet = wb.addWorksheet("Filiallar kesimida", { views: [{ showGridLines: true }] });
  ws.columns = [6, 24, 32, 15, 17, 17, 18, 18, 19].map((width, i) => ({ key: `c${i + 1}`, width }));

  ws.mergeCells("A1:I1");
  const t = ws.getCell("A1");
  t.value = `Давлат кадастрлари палатаси Наманган вилоят бошқармасининг "Кадастр маслаҳат бурчаги" бўйича ҲИСОБОТИ`;
  t.font = { name: "Cambria", size: 14, bold: true };
  t.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws.getRow(1).height = 36;

  if (dateRange) {
    ws.mergeCells("G2:I2");
    const d = ws.getCell("G2");
    d.value = dateRange;
    d.font = { name: "Cambria", size: 12, italic: true };
    d.alignment = { horizontal: "right", vertical: "middle" };
    ws.getRow(2).height = 22;
  }

  ws.mergeCells("A3:A4"); ws.getCell("A3").value = "T.p";
  ws.mergeCells("B3:B4"); ws.getCell("B3").value = "Ҳудуд номи";
  ws.mergeCells("C3:C4"); ws.getCell("C3").value = "Бириктирилган масъул\nходим\n(Ф.И.Ш. лавозими ва\nтелефон рақами)";
  ws.mergeCells("D3:D4"); ws.getCell("D3").value = "Жами\nмурожаатлар\nсони";
  ws.mergeCells("E3:F3"); ws.getCell("E3").value = "шундан";
  ws.getCell("E4").value = "Юридик шахс-\nлар томонидан\nбилдирилган\nмурожаат";
  ws.getCell("F4").value = "Жисмоний шахс-\nлар томонидан\nбилдирилган\nмурожаат";
  ws.mergeCells("G3:I3"); ws.getCell("G3").value = "шундан";
  ws.getCell("G4").value = "Ижобий ҳал\nэтилган\nмурожаатлар\nсони";
  ws.getCell("H4").value = "Филиалга\nйўналтирилган\nмурожаатлар\nсони";
  ws.getCell("I4").value = "Ваколати\nдоирасига\nкирмайдиган\nмурожаатлар\nсони";
  ws.getRow(3).height = 26;
  ws.getRow(4).height = 68;
  for (let r = 3; r <= 4; r++)
    for (let c = 1; c <= 9; c++) {
      const cell = ws.getRow(r).getCell(c);
      cell.fill = headerFill;
      cell.border = thinBorder;
      cell.font = { name: "Cambria", size: 12, bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    }

  const stats: Record<string, { jami: number; yuridik: number; jismoniy: number; ijobiy: number; filial: number; vakolat: number }> = {};
  HUDUDLAR_KRIL.forEach((h) => (stats[h] = { jami: 0, yuridik: 0, jismoniy: 0, ijobiy: 0, filial: 0, vakolat: 0 }));
  for (const m of list) {
    const t = m.tuman ? m.tuman.trim() : "";
    let matched = HUDUDLAR_KRIL.find((k) => normalizeName(t) === normalizeName(HUDUD_MAP[k]) || normalizeName(t) === normalizeName(k));
    if (!matched) matched = "Наманган шаҳар";
    const st = stats[matched];
    st.jami++;
    if (m.shaxsTuri == 1 || m.shaxsTuri === "Yuridik") st.yuridik++;
    else st.jismoniy++;
    if (isFilial(m)) st.filial++;
    else if (isVakolatsiz(m)) st.vakolat++;
    else st.ijobiy++;
  }

  const vil = { jami: 0, yuridik: 0, jismoniy: 0, ijobiy: 0, filial: 0, vakolat: 0 };
  for (const h of HUDUDLAR_KRIL) for (const k of Object.keys(vil) as (keyof typeof vil)[]) vil[k] += stats[h][k];

  const viloyatMasuli = masullar[normalizeName("boshqarma")] || masullar[normalizeName("superadmin")] || masullar[normalizeName("namangan viloyati")] || "";
  const vRow = ws.getRow(5);
  vRow.height = viloyatMasuli ? 42 : 28;
  [ "", "Наманган вилояти", viloyatMasuli, vil.jami, vil.yuridik, vil.jismoniy, vil.ijobiy, vil.filial, vil.vakolat ]
    .forEach((v, i) => (vRow.getCell(i + 1).value = v));
  for (let c = 1; c <= 9; c++) {
    const cell = vRow.getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    cell.border = thinBorder;
    cell.font = { name: "Cambria", size: 12, bold: true };
    cell.alignment = { horizontal: c === 2 ? "left" : "center", vertical: "middle", wrapText: c === 3 };
  }

  HUDUDLAR_KRIL.forEach((hName, idx) => {
    const s = stats[hName];
    const masul = masullar[normalizeName(HUDUD_MAP[hName])] || masullar[normalizeName(hName)] || "";
    const row = ws.getRow(6 + idx);
    row.height = 42;
    [idx + 1, hName, masul, s.jami, s.yuridik, s.jismoniy, s.ijobiy, s.filial, s.vakolat].forEach((v, i) => (row.getCell(i + 1).value = v));
    for (let c = 1; c <= 9; c++) {
      const cell = row.getCell(c);
      cell.border = thinBorder;
      cell.font = { name: "Cambria", size: 12, bold: c === 3 };
      cell.alignment = { horizontal: c === 2 ? "left" : "center", vertical: "middle", wrapText: c === 3 };
    }
  });
}

type Ctx = { isAdmin: boolean; sessionTuman: string; masullar: Record<string, string> };

/** Haftalik / sana bo'yicha hisobot (original buildAndDownloadExcel) */
export async function buildAndDownloadExcel(dataList: Murojaat[], dateRangeTitle: string, fileName: string, ctx: Ctx) {
  const valid = getLatestDailyAppeals(dataList, true);
  if (valid.length === 0) {
    alert("Tanlangan muddatda to'liq yakunlangan (chora ko'rilgan va ketdi vaqti belgilangan) murojaatlar mavjud emas!");
    return;
  }
  const wb = await newWorkbook();
  const title = ctx.isAdmin
    ? `Davlat kadastrlari palatasi Namangan viloyat boshqarmasi va tuman (shahar) filiallarining "Kadastr maslahat burchagi" bo'yicha HISOBOTI`
    : `Davlat kadastrlari palatasi Namangan viloyat boshqarmasi ${ctx.sessionTuman} filialining "Kadastr maslahat burchagi" bo'yicha HISOBOTI`;
  addListSheet(wb, valid, title, dateRangeTitle);
  addFilialSheet(wb, valid, ctx.masullar, dateRangeTitle);
  await save(wb, fileName);
}

const pad = (n: number) => String(n).padStart(2, "0");
const dmy = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;

function filterByRange(list: Murojaat[], start: number, end: number) {
  return list.filter((item) => {
    if (!item.sana) return false;
    const d = parseLocalDate(item.sana);
    if (!d || isNaN(d.getTime())) return false;
    const t = d.getTime();
    return t >= start && t <= end;
  });
}

export async function generateExcelReportByDates(source: Murojaat[], startDate: Date, endDate: Date, ctx: Ctx) {
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
  await buildAndDownloadExcel(filtered, rangeStr, `dkpreport_${sStr}_${eStr}.xlsx`, ctx);
}

export async function exportWeekly(source: Murojaat[], ctx: Ctx) {
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
    if (!confirm(`Tanlangan haftada (${weekRangeStr}) birorta ham murojaat topilmadi.\nBarcha mavjud murojaatlarni yuklab olishni xohlaysizmi?`)) return;
    data = [...source];
  }
  await buildAndDownloadExcel(data, weekRangeStr, `dkpreportWeekly.xlsx`, ctx);
}

/** SuperAdmin: viloyat yig'ma hisoboti (3 varaq) */
export async function exportRegionalSummary(all: Murojaat[], masullar: Record<string, string>) {
  try {
    const valid = getLatestDailyAppeals(all, true);
    if (valid.length === 0) {
      alert("Viloyat bo'yicha to'liq yakunlangan (chora ko'rilgan va ketdi vaqti belgilangan) murojaatlar mavjud emas!");
      return;
    }
    const wb = await newWorkbook();

    // 1-LIST: Qisqa umumiy jadval
    const ws1 = wb.addWorksheet("Viloyat yig'ma hisoboti", { views: [{ showGridLines: true }] });
    ws1.columns = [8, 32, 16, 16, 16, 18].map((width, i) => ({ key: `col${i + 1}`, width }));
    const summary: Record<string, { total: number; ijobiy: number; filial: number; vakolatsiz: number }> = {};
    TUMANLAR.forEach((t) => (summary[t] = { total: 0, ijobiy: 0, filial: 0, vakolatsiz: 0 }));
    for (const m of valid) {
      const t = m.tuman ? m.tuman.trim() : "";
      const match = TUMANLAR.find((b) => normalizeName(b) === normalizeName(t));
      if (!match) continue;
      summary[match].total++;
      if (isFilial(m)) summary[match].filial++;
      else if (isVakolatsiz(m)) summary[match].vakolatsiz++;
      else summary[match].ijobiy++;
    }
    ws1.mergeCells("A1:F1");
    const t1 = ws1.getCell("A1");
    t1.value = `Davlat kadastrlari palatasi Namangan viloyat boshqarmasi va tuman (shahar) filiallarining "Kadastr maslahat burchagi" bo'yicha YIG'MA HISOBOTI`;
    t1.font = { name: "Cambria", size: 14, bold: true, color: { argb: "FF1F497D" } };
    t1.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    ws1.getRow(1).height = 40;

    const hRow = ws1.getRow(3);
    hRow.height = 32;
    ["T/R", "Filial nomi", "Jami murojaat", "Ijobiy hal etilgan", "Filialga yo'naltirilgan", "Vakolatsiz murojaat"].forEach((h, i) => {
      const cell = hRow.getCell(i + 1);
      cell.value = h;
      cell.fill = headerFill;
      cell.border = thinBorder;
      cell.font = { name: "Cambria", size: 13, bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });

    let cur = 4;
    const tot = { all: 0, ij: 0, fil: 0, vak: 0 };
    TUMANLAR.forEach((name, idx) => {
      const d = summary[name];
      tot.all += d.total; tot.ij += d.ijobiy; tot.fil += d.filial; tot.vak += d.vakolatsiz;
      const row = ws1.getRow(cur++);
      row.height = 24;
      [idx + 1, name, d.total, d.ijobiy, d.filial, d.vakolatsiz].forEach((v, i) => (row.getCell(i + 1).value = v));
      for (let c = 1; c <= 6; c++) {
        const cell = row.getCell(c);
        cell.border = thinBorder;
        cell.font = { name: "Cambria", size: 13 };
        cell.alignment = { horizontal: c === 2 ? "left" : "center", vertical: "middle" };
      }
    });
    const fRow = ws1.getRow(cur);
    fRow.height = 28;
    ["", "JAMI:", tot.all, tot.ij, tot.fil, tot.vak].forEach((v, i) => (fRow.getCell(i + 1).value = v));
    for (let c = 1; c <= 6; c++) {
      const cell = fRow.getCell(c);
      cell.border = thinBorder;
      cell.font = { name: "Cambria", size: 13, bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      cell.alignment = { horizontal: c === 2 ? "left" : "center", vertical: "middle" };
    }

    // 2-LIST va 3-LIST
    addListSheet(wb, valid, `Davlat kadastrlari palatasi Namangan viloyat boshqarmasi va tuman (shahar) filiallarining "Kadastr maslahat burchagi" bo'yicha HISOBOTI`, null);
    addFilialSheet(wb, valid, masullar, null);

    await save(wb, "dkpreportAll.xlsx");
  } catch (err) {
    console.error("Yig'ma hisobot eksportida xatolik:", err);
    alert("Hisobotni shakllantirishda xatolik: " + (err as Error).message);
  }
}
