import type { DeadlineData, RegionSummary, RoleStats } from "@/lib/types";
import { slugify } from "./model";

/**
 * "Rollar kesimida tahlil" — avval Django hisoblardi, endi Google Sheets'dagi xom qatorlardan
 * shu yerda (serverda) hisoblanadi. Har bir qator: bitta ariza bitta rolda necha kun turgani
 * (keng jadvaldan source.ts → toDeadlineRows orqali olinadi).
 */
export type DeadlineRow = { ri: number; ariza: string; tranz: string; tuman: string; manba: string; rol: string; vaqt: string; kun: number };
export const VILOYAT_JAMI = "Viloyat jami";

type DayKey = Exclude<keyof RoleStats, "arizaSoni">;
export function dayKey(kun: number): DayKey {
  if (kun <= 1) return "day1";
  if (kun <= 5) return `day${Math.floor(kun)}` as DayKey;
  if (kun <= 10) return "day6_10";
  return "day11_plus";
}

const DAY_KEYS: DayKey[] = ["day1", "day2", "day3", "day4", "day5", "day6_10", "day11_plus"];
const emptyStats = (): Required<RoleStats> => ({ arizaSoni: 0, day1: 0, day2: 0, day3: 0, day4: 0, day5: 0, day6_10: 0, day11_plus: 0 });

function addRow(region: RegionSummary, seen: Set<string>, r: DeadlineRow, mSlug: string, rSlug: string) {
  region.manbalar ??= {};
  region.rollar ??= {};
  region.byManba ??= {};
  // Manba bo'yicha ariza bir marta sanaladi (bitta ariza bir nechta rolda bo'lishi mumkin)
  // Varaqda har bir qator — bitta tranzaksiya; "Ariza raqami" takrorlanishi (yoki bo'sh bo'lishi) mumkin
  const id = r.tranz || r.ariza;
  if (!seen.has(id)) {
    seen.add(id);
    region.manbalar[mSlug] = (region.manbalar[mSlug] || 0) + 1;
  }
  const bump = (s: RoleStats) => {
    s.arizaSoni = (s.arizaSoni || 0) + 1;
    const k = dayKey(r.kun);
    s[k] = (s[k] || 0) + 1;
  };
  bump((region.rollar[rSlug] ??= emptyStats()));
  const bm = (region.byManba[mSlug] ??= { rollar: {} });
  bump((bm.rollar![rSlug] ??= emptyStats()));
}

/** Django /summary/ javobi bilan bir xil tuzilma: { [tuman]: RegionSummary } + "Viloyat jami" */
export function buildSummary(rows: DeadlineRow[]): DeadlineData {
  const out: DeadlineData = {};
  const seen = new Map<string, Set<string>>();
  for (const r of rows) {
    const mSlug = slugify(r.manba);
    const rSlug = slugify(r.rol);
    for (const name of [r.tuman, VILOYAT_JAMI]) {
      if (!seen.has(name)) seen.set(name, new Set());
      addRow((out[name] ??= {}), seen.get(name)!, r, mSlug, rSlug);
    }
  }
  return out;
}

export type DetailFilter = { tuman?: string | null; manba?: string | null; role?: string | null; day?: string | null };

const cleanKey = (s: string) => s.toLowerCase().replace(/['`ʻ’ʼ\s]/g, "");

/** Drilldown: model.ts → DrillCtx parametrlari (manba — vergul bilan ajratilgan slug'lar bo'lishi mumkin) */
export function filterDetails(rows: DeadlineRow[], f: DetailFilter) {
  const tuman = f.tuman && cleanKey(f.tuman) !== cleanKey(VILOYAT_JAMI) ? cleanKey(f.tuman) : null;
  const manbalar = f.manba ? f.manba.split(",").filter(Boolean) : null;
  const day = f.day && f.day !== "arizaSoni" ? f.day : null;
  return rows.filter(
    (r) =>
      (!tuman || cleanKey(r.tuman) === tuman) &&
      (!manbalar || manbalar.includes(slugify(r.manba))) &&
      (!f.role || slugify(r.rol) === f.role) &&
      (!day || dayKey(r.kun) === day)
  );
}

/** Xom varaq: sarlavhalar (sheetHeaders), ma'lumot qatorlari va ulardan olingan ariza × rol qatorlari */
export type DeadlineSheet = { headers: string[]; raw: string[][]; rows: DeadlineRow[] };

/**
 * Drilldown jadvali va Excel eksporti: filtrdan o'tgan arizalar varaqdagi BARCHA ustunlari bilan
 * (bir qator — bir ariza, varaqdagi tartibda).
 */
export function detailTable(sheet: DeadlineSheet, filtered: DeadlineRow[]) {
  const ris = [...new Set(filtered.map((r) => r.ri))].sort((a, b) => a - b);
  const width = sheet.headers.length;
  const data = ris.map((ri, i) => {
    const row = sheet.raw[ri] || [];
    return [i + 1, ...Array.from({ length: width }, (_, c) => row[c] ?? "")];
  });
  return { headers: ["№", ...sheet.headers], data };
}

/**
 * Svod varaq ("YakunlanganSvod" / "JarayondagiSvod") — tayyor jamlanma, yuklash paytida brauzerda hisoblanib yoziladi.
 * Sahifa katta xom varaq o'rniga shu kichik varaqni o'qiydi. Har bir qator:
 *  - [tuman, manbaSlug, "", soni] — manba bo'yicha noyob arizalar;
 *  - [tuman, manbaSlug, rolSlug, arizaSoni, day1 … day11_plus] — byManba statistikasi
 *    (rollar jami — barcha manbalar yig'indisi, o'qishda tiklanadi);
 *  - [tuman, SPAN_MARK, "", birinchi, oxirgi] — tumanning xom varaqdagi qatorlari (yuklashda tuman bo'yicha saralanadi):
 *    drilldown va Excel butun varaqni emas, faqat shu oraliqni o'qiydi (Netlify funksiyasi vaqti cheklangan).
 */
export const SVOD_HEADERS = ["Tuman", "Manba", "Rol", "Ariza soni", "1-kun", "2-kun", "3-kun", "4-kun", "5-kun", "6-10-kun", "11+ kun"];
const SPAN_MARK = "#qatorlar";

/** Tuman → xom varaqdagi [birinchi, oxirgi] qator raqami (1 dan, sarlavhalar bilan) */
export type SvodSpans = Record<string, [number, number]>;

export function flattenSummary(data: DeadlineData, spans: SvodSpans = {}): string[][] {
  const out: string[][] = [SVOD_HEADERS];
  for (const [tuman, [a, b]] of Object.entries(spans)) out.push([tuman, SPAN_MARK, "", String(a), String(b)]);
  for (const [tuman, reg] of Object.entries(data)) {
    for (const [m, n] of Object.entries(reg.manbalar || {})) out.push([tuman, m, "", String(n)]);
    for (const [m, bm] of Object.entries(reg.byManba || {})) {
      for (const [rol, st] of Object.entries(bm.rollar || {})) {
        out.push([tuman, m, rol, String(st.arizaSoni || 0), ...DAY_KEYS.map((k) => String(st[k] || 0))]);
      }
    }
  }
  return out;
}

/** flattenSummary'ning teskarisi; sarlavha mos kelmasa — null (eski yo'lga qaytiladi) */
export function unflattenSummary(rows: readonly (readonly string[])[]): DeadlineData | null {
  if (!rows.length || String(rows[0][0] ?? "").trim() !== SVOD_HEADERS[0] || String(rows[0][2] ?? "").trim() !== SVOD_HEADERS[2]) return null;
  const out: DeadlineData = {};
  const num = (v: unknown) => Number(String(v ?? "").replace(/\s/g, "")) || 0;
  for (const r of rows.slice(1)) {
    const tuman = String(r[0] ?? "").trim();
    const m = String(r[1] ?? "").trim();
    const rol = String(r[2] ?? "").trim();
    if (!tuman || !m || m === SPAN_MARK) continue;
    const reg = (out[tuman] ??= {});
    if (!rol) {
      (reg.manbalar ??= {})[m] = num(r[3]);
      continue;
    }
    const st: RoleStats = { arizaSoni: num(r[3]) };
    DAY_KEYS.forEach((k, i) => (st[k] = num(r[4 + i])));
    (((reg.byManba ??= {})[m] ??= { rollar: {} }).rollar ??= {})[rol] = st;
    const tot = ((reg.rollar ??= {})[rol] ??= emptyStats());
    tot.arizaSoni = (tot.arizaSoni || 0) + (st.arizaSoni || 0);
    for (const k of DAY_KEYS) tot[k] = (tot[k] || 0) + (st[k] || 0);
  }
  return out;
}

/** Svod varaqdagi tumanlar qator oraliqlari (eski svod'da yo'q — bo'sh obyekt) */
export function svodSpans(rows: readonly (readonly string[])[]): SvodSpans {
  const out: SvodSpans = {};
  for (const r of rows.slice(1)) {
    if (String(r[1] ?? "").trim() !== SPAN_MARK) continue;
    const a = Number(r[3]);
    const b = Number(r[4]);
    if (a > 0 && b >= a) out[String(r[0]).trim()] = [a, b];
  }
  return out;
}
