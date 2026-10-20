import { config } from "./config";
import { MOCK, readMock } from "./mock";
import { cached, invalidate } from "./cache";
import { fetchGvizCsv } from "./gviz";
import { deadlineRepair } from "./auth-server";
import {
  buildSummary, svodSpans, unflattenSummary, type DeadlineRow, type DeadlineSheet, type SvodSpans,
} from "@/features/deadline/aggregate";
import { DISTRICTS } from "@/features/deadline/model";
import {
  DEADLINE_HEADER_ROWS, DEADLINE_LISTS, locateColumns, makeTumanResolver, sheetHeaders, toDeadlineRows, type DeadlineList,
} from "@/features/deadline/source";
import type { DeadlineData } from "./types";

const resolveTuman = makeTumanResolver(DISTRICTS.map((d) => d.name));

/** Demo rejimida yuklangan fayl xotirada turadi (Sheets'ga yozilmaydi) */
const mockUploaded: Partial<Record<DeadlineList, DeadlineSheet>> = {};
const mockBuffer: Partial<Record<DeadlineList, unknown[][]>> = {};

/** Ikki sarlavha qatori + ma'lumotdan xom varaq tuzilmasi */
function toSheet(all: readonly (readonly unknown[])[], sheetName: string): DeadlineSheet {
  let cols;
  try {
    cols = locateColumns(all[0] || [], all[1] || []);
  } catch (e) {
    throw new Error(`"${sheetName}" varag'i: ${(e as Error).message}`);
  }
  const raw = all.slice(DEADLINE_HEADER_ROWS).map((r) => r.map((v) => String(v ?? "")));
  return { headers: sheetHeaders(all[0] || [], all[1] || []), raw, rows: toDeadlineRows(raw, cols, resolveTuman) };
}

/** Demo: yuklash qismlarini yig'ish; oxirgi qism kelganda qatorlarga aylantiriladi */
export function mockAppendChunk(list: DeadlineList, startRow: number, values: unknown[][], last: boolean) {
  const buf = startRow === 1 ? (mockBuffer[list] = []) : (mockBuffer[list] ??= []);
  buf.push(...values);
  if (!last) return;
  mockUploaded[list] = toSheet(buf, DEADLINE_LISTS[list].sheet);
  delete mockBuffer[list];
}

async function loadMock(list: DeadlineList): Promise<DeadlineSheet> {
  if (mockUploaded[list]) return mockUploaded[list]!;
  // Eski formatdagi namunaviy fayl (har bir qator — ariza × rol) ikkala ro'yxat uchun; keng jadval shundan yasaladi
  const m = await readMock<{ headers: string[]; data: unknown[][] }>("deadline_details");
  const at = (h: string) => m.headers.indexOf(h);
  const roles = [...new Set(m.data.map((r) => String(r[at("Rol")])))];
  const byAriza = new Map<string, { ri: number; wide: string[] }>();
  const rows: DeadlineRow[] = [];
  for (const r of m.data) {
    const kun = Number(r[at("Kun")]) || 1;
    const ariza = String(r[at("Ariza raqami")]);
    const tuman = String(r[at("Tuman")]);
    const manba = String(r[at("Manba")]);
    const rol = String(r[at("Rol")]);
    let e = byAriza.get(ariza);
    if (!e) byAriza.set(ariza, (e = { ri: byAriza.size, wide: [tuman, ariza, ariza, manba, ...roles.map(() => "-")] }));
    e.wide[4 + roles.indexOf(rol)] = `${kun} kun`;
    rows.push({ ri: e.ri, ariza, tranz: ariza, tuman, manba, rol, vaqt: `${kun} kun`, kun });
  }
  return { headers: ["Tuman", "Tranzaksiya raqami", "Ariza raqami", "Ariza manbasi", ...roles], raw: [...byAriza.values()].map((e) => e.wide), rows };
}

/** Ma'lumot faqat "Bazaga yuklash" orqali o'zgaradi — kesh uzoqroq (yuklashda tozalanadi, "Yangilash" chetlab o'tadi) */
const TTL = Math.max(config.cacheTtlMs, config.deadlineCacheTtlMs);

/**
 * Bo'sh natija (varaq yuklanayotgan payt — birinchi qism uni tozalaydi) faqat qisqa muddat saqlanadi,
 * aks holda ma'lumot qayta yozilgandan keyin ham sahifa 10 daqiqagacha bo'sh ko'rinardi.
 */
const EMPTY_TTL = 30_000;

/**
 * Xom varaqlar katta (Yakunlangan ~90 ming qator, ~80 MB) — Google uni 25+ soniyada beradi, Netlify funksiyasi esa
 * 10 soniyada uziladi (HTTP 502). Shuning uchun sahifa faqat kichik svod varaqni o'qiydi, drilldown va Excel —
 * faqat kerakli tumanning qator oralig'ini (svod'da yoziladi; yuklashda qatorlar tuman bo'yicha saralanadi).
 */
const MAX_DETAIL_ROWS = 25_000;
/** Bitta so'rovdagi qatorlar (~6 MB) — oraliq shu bo'laklarga bo'linib parallel o'qiladi */
const FETCH_ROWS = 6_000;

type Svod = { data: DeadlineData; spans: SvodSpans };

const reupload = (list: DeadlineList) =>
  `"${DEADLINE_LISTS[list].svodSheet}" jamlanma varag'i topilmadi yoki eski formatda. ` +
  `"Bazaga yuklash" bo'limida Rollar kesimi faylini qayta yuklang — jamlanma shu paytda tayyorlanadi.`;

/** Eski usulda yuklangan ma'lumot avtomatik tartiblanmoqda — mijoz biroz kutib qayta so'raydi (API → 202) */
export class DeadlinePreparing extends Error {}
const preparing = (list: DeadlineList) =>
  new DeadlinePreparing(`"${DEADLINE_LISTS[list].sheet}" ma'lumoti tumanlar bo'yicha tartiblanmoqda — bir daqiqa ichida ochiladi.`);

/** Tayyor svod varaq (bir necha KB). Varaq yo'q bo'lsa gviz birinchi varaqni qaytaradi — sarlavha mos kelmaydi → null */
async function readSvod(list: DeadlineList): Promise<Svod | null> {
  const rows = await fetchGvizCsv(config.deadlineSheetId, DEADLINE_LISTS[list].svodSheet);
  const data = unflattenSummary(rows);
  return data && Object.keys(data).length ? { data, spans: svodSpans(rows) } : null;
}

/** Oraliqsiz svod (eski usulda yuklangan) qisqa saqlanadi — avtomatik tuzatilgach tez yangilansin */
const hasSpans = (d: Svod | null) => !!d && Object.keys(d.spans).length > 0;
const loadSvod = (list: DeadlineList, fresh = false) =>
  cached<Svod | null>(`deadline:svod:${list}`, (d) => (hasSpans(d) ? TTL : EMPTY_TTL), () => readSvod(list), { fresh });

/**
 * Eski usulda yuklangan ma'lumot (xom qatorlar saralanmagan, svod'da oraliqlar yo'q) — Apps Script'da joyida tuzatiladi:
 * xom varaq tuman bo'yicha saralanadi, svod'ga oraliqlar qo'shiladi. Qayta yuklash shart emas.
 * `waitMs` dan ko'p kutilmaydi (Netlify ~10 s); tugamasa Apps Script fonda davom etadi → null.
 */
async function repairSvod(list: DeadlineList, waitMs: number): Promise<{ svod: Svod | null; error?: string }> {
  try {
    const st = await deadlineRepair(config.deadlineSheetId, DEADLINE_LISTS[list].sheet, DEADLINE_LISTS[list].svodSheet, waitMs);
    if (st !== "done") return { svod: null };
    const svod = await loadSvod(list, true);
    return { svod: hasSpans(svod) ? svod : null };
  } catch (e) {
    // Masalan, Apps Script'ning eski versiyasi (deadlineRepair amali yo'q) — "tayyorlanmoqda"da osilib qolmasin
    console.error("[deadline] tuzatish:", (e as Error).message);
    return { svod: null, error: (e as Error).message };
  }
}

/** Butun viloyat bo'yicha jamlanma — faqat svod varaqdan (demo rejimida — namunaviy fayldan) */
export async function loadDeadlineSummary(list: DeadlineList, fresh = false): Promise<DeadlineData> {
  if (MOCK) return buildSummary((await loadMock(list)).rows);
  const svod = await loadSvod(list, fresh);
  if (!svod) throw new Error(reupload(list));
  return svod.data;
}

/** Xom varaqning ikki sarlavha qatori: ustunlar joylashuvi va modal/Excel sarlavhalari */
const loadHead = (list: DeadlineList) =>
  cached(`deadline:head:${list}`, TTL, async () => {
    const sheet = DEADLINE_LISTS[list].sheet;
    const head = await fetchGvizCsv(config.deadlineSheetId, sheet, { range: `A1:ZZ${DEADLINE_HEADER_ROWS}` });
    let cols;
    try {
      cols = locateColumns(head[0] || [], head[1] || []);
    } catch (e) {
      throw new Error(`"${sheet}" varag'i: ${(e as Error).message}`);
    }
    return { cols, headers: sheetHeaders(head[0] || [], head[1] || []) };
  });

/**
 * Drilldown va Excel uchun xom qatorlar: `tuman` berilsa — faqat o'sha tuman, aks holda butun viloyat
 * (faqat kichik ro'yxatda — juda katta bo'lsa tuman tanlash so'raladi).
 */
export async function loadDeadlineSheet(list: DeadlineList, tuman: string | null, fresh = false): Promise<DeadlineSheet> {
  if (MOCK) return loadMock(list);
  let svod = await loadSvod(list, fresh);
  if (!svod) throw new Error(reupload(list));
  if (!hasSpans(svod)) {
    // Eski usulda yuklangan: tuzatish boshlanadi (Apps Script). Kichik ro'yxat shu payt parallel to'liq o'qiladi,
    // kattasi tuzatishni biroz kutadi — tugamasa mijoz "tayyorlanmoqda" bilan qayta so'raydi
    const repairing = repairSvod(list, 5000);
    const count = await rawRowCount(list);
    if (count <= MAX_DETAIL_ROWS) {
      const [sheet] = await Promise.all([loadUnsorted(list, count, fresh), repairing]);
      return sheet;
    }
    const fixed = await repairing;
    if (fixed.svod) svod = fixed.svod;
    else if (fixed.error) throw new Error(`Ma'lumotni tayyorlab bo'lmadi: ${fixed.error}`);
    else throw preparing(list);
  }
  // Oraliqlar yangi yuklashda tuman nomi bilan, avtomatik tuzatishda varaqdagi nom bilan ("Namangan shahri") yoziladi
  const want = tuman ? resolveTuman(tuman) : null;
  const names = Object.keys(svod.spans).filter((t) => !want || resolveTuman(t) === want);
  const spans = names.map((t) => svod.spans[t]);
  const total = spans.reduce((n, [a, b]) => n + b - a + 1, 0);
  if (total > MAX_DETAIL_ROWS) {
    throw new Error(`Viloyat bo'yicha ro'yxat juda katta (${total.toLocaleString()} ta ariza) — tuman qatoridagi katakni bosing.`);
  }
  const key = `deadline:rows:${list}:${tuman ? names.join("|") : "*"}`;
  return cached<DeadlineSheet>(key, TTL, async () => {
    const parts: [number, number][] = [];
    for (const [a, b] of spans) for (let s = a; s <= b; s += FETCH_ROWS) parts.push([s, Math.min(b, s + FETCH_ROWS - 1)]);
    const sheet = DEADLINE_LISTS[list].sheet;
    const [head, ...chunks] = await Promise.all([
      loadHead(list),
      ...parts.map(([a, b]) => fetchGvizCsv(config.deadlineSheetId, sheet, { range: `A${a}:ZZ${b}` })),
    ]);
    const width = head.headers.length;
    const raw = (chunks as string[][][]).flat().map((r) => Array.from({ length: width }, (_, c) => String(r[c] ?? "")));
    return { headers: head.headers, raw, rows: toDeadlineRows(raw, head.cols, resolveTuman) };
  }, { fresh });
}

/** Xom varaqdagi ma'lumot qatorlari soni (B ustuni — ~1.5 MB, bir necha soniya) */
const rawRowCount = (list: DeadlineList) =>
  cached(`deadline:count:${list}`, TTL, async () => {
    const col = await fetchGvizCsv(config.deadlineSheetId, DEADLINE_LISTS[list].sheet, { range: `B${DEADLINE_HEADER_ROWS + 1}:B300000` });
    return col.length;
  });

/**
 * Zaxira yo'l (tuzatish tugaguncha): svod oraliqlarisiz — butun xom varaq o'qiladi.
 * Faqat kichik ro'yxat uchun (Netlify funksiyasi ~10 s).
 */
async function loadUnsorted(list: DeadlineList, count: number, fresh: boolean): Promise<DeadlineSheet> {
  return cached<DeadlineSheet>(`deadline:rows:${list}:unsorted`, TTL, async () => {
    const first = DEADLINE_HEADER_ROWS + 1;
    const last = DEADLINE_HEADER_ROWS + count;
    const parts: [number, number][] = [];
    for (let a = first; a <= last; a += FETCH_ROWS) parts.push([a, Math.min(last, a + FETCH_ROWS - 1)]);
    const sheet = DEADLINE_LISTS[list].sheet;
    const [head, ...chunks] = await Promise.all([
      loadHead(list),
      ...parts.map(([a, b]) => fetchGvizCsv(config.deadlineSheetId, sheet, { range: `A${a}:ZZ${b}` })),
    ]);
    const width = head.headers.length;
    const raw = (chunks as string[][][]).flat().map((r) => Array.from({ length: width }, (_, c) => String(r[c] ?? "")));
    return { headers: head.headers, raw, rows: toDeadlineRows(raw, head.cols, resolveTuman) };
  }, { fresh });
}

/** Sahifa ochilganda fonda: svod va sarlavhalar keshga (drilldown birinchi bosishda tezroq ochilsin) */
export async function warmDeadline(list: DeadlineList) {
  if (MOCK) return;
  const [svod] = await Promise.all([loadSvod(list), loadHead(list)]);
  // Eski usulda yuklangan bo'lsa — tuzatish shu yerda boshlanadi (foydalanuvchi katakni bosguncha tayyor bo'lsin)
  if (svod && !hasSpans(svod)) await repairSvod(list, 2500);
}

export const invalidateDeadline = () => invalidate("deadline:");
