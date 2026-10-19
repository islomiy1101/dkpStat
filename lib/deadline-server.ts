import { config } from "./config";
import { MOCK, readMock } from "./mock";
import { cached, invalidate } from "./cache";
import { fetchGvizCsv } from "./gviz";
import { buildSummary, type DeadlineRow } from "@/features/deadline/aggregate";
import { DISTRICTS } from "@/features/deadline/model";
import {
  DEADLINE_HEADER_ROWS, DEADLINE_LISTS, colLetter, locateColumns, makeTumanResolver, toDeadlineRows, type DeadlineList,
} from "@/features/deadline/source";
import type { DeadlineData } from "./types";

const resolveTuman = makeTumanResolver(DISTRICTS.map((d) => d.name));

/** Demo rejimida yuklangan fayl xotirada turadi (Sheets'ga yozilmaydi) */
const mockUploaded: Partial<Record<DeadlineList, DeadlineRow[]>> = {};
const mockBuffer: Partial<Record<DeadlineList, unknown[][]>> = {};

/** Demo: yuklash qismlarini yig'ish; oxirgi qism kelganda qatorlarga aylantiriladi */
export function mockAppendChunk(list: DeadlineList, startRow: number, values: unknown[][], last: boolean) {
  const buf = startRow === 1 ? (mockBuffer[list] = []) : (mockBuffer[list] ??= []);
  buf.push(...values);
  if (!last) return;
  const cols = locateColumns(buf[0] || [], buf[1] || []);
  mockUploaded[list] = toDeadlineRows(buf.slice(DEADLINE_HEADER_ROWS), cols, resolveTuman);
  delete mockBuffer[list];
}

async function loadMock(list: DeadlineList): Promise<DeadlineRow[]> {
  if (mockUploaded[list]) return mockUploaded[list]!;
  // Eski formatdagi namunaviy fayl (har bir qator — ariza × rol) ikkala ro'yxat uchun
  const m = await readMock<{ headers: string[]; data: unknown[][] }>("deadline_details");
  const at = (h: string) => m.headers.indexOf(h);
  return m.data.map((r) => {
    const kun = Number(r[at("Kun")]) || 1;
    const ariza = String(r[at("Ariza raqami")]);
    return { ariza, tranz: ariza, tuman: String(r[at("Tuman")]), manba: String(r[at("Manba")]), rol: String(r[at("Rol")]), vaqt: `${kun} kun`, kun };
  });
}

/**
 * Varaqdan o'qish: avval ikki sarlavha qatori (ustunlarni nomi bo'yicha topish uchun),
 * keyin faqat kerakli ustunlar (varaq ~80 ustunli, to'liq yuklash juda og'ir).
 */
async function load(list: DeadlineList): Promise<DeadlineRow[]> {
  if (MOCK) return loadMock(list);
  const sheet = DEADLINE_LISTS[list].sheet;
  const head = await fetchGvizCsv(config.deadlineSheetId, sheet, { range: `A1:ZZ${DEADLINE_HEADER_ROWS}` });
  let cols;
  try {
    cols = locateColumns(head[0] || [], head[1] || []);
  } catch (e) {
    throw new Error(`"${sheet}" varag'i: ${(e as Error).message}`);
  }
  const picked = [cols.tuman, cols.tranz, cols.ariza, cols.manba, ...cols.roles.map((r) => r.idx)];
  const csv = await fetchGvizCsv(config.deadlineSheetId, sheet, { tq: `select ${picked.map(colLetter).join(",")}` });
  // Natijada ustunlar `picked` tartibida keladi
  const local = { tuman: 0, tranz: 1, ariza: 2, manba: 3, roles: cols.roles.map((r, i) => ({ ...r, idx: 4 + i })) };
  return toDeadlineRows(csv.slice(DEADLINE_HEADER_ROWS), local, resolveTuman);
}

/** Ma'lumot faqat "Bazaga yuklash" orqali o'zgaradi — kesh uzoqroq (yuklashda tozalanadi, "Yangilash" chetlab o'tadi) */
const TTL = Math.max(config.cacheTtlMs, config.deadlineCacheTtlMs);

/**
 * Bo'sh natija (varaq yuklanayotgan payt — birinchi qism uni tozalaydi) faqat qisqa muddat saqlanadi,
 * aks holda ma'lumot qayta yozilgandan keyin ham sahifa 10 daqiqagacha bo'sh ko'rinardi.
 */
const EMPTY_TTL = 30_000;
const rowsTtl = (rows: unknown[]) => (rows.length ? TTL : EMPTY_TTL);

/** Ro'yxatning barcha qatorlari (ariza × rol) — details va eksport shundan olinadi */
export const loadDeadlineRows = (list: DeadlineList, fresh = false) => cached(`deadline:rows:${list}`, rowsTtl, () => load(list), { fresh });

/** Butun viloyat bo'yicha jamlanma — har so'rovda qayta hisoblanmaydi */
export const loadDeadlineSummary = (list: DeadlineList, fresh = false) =>
  cached<DeadlineData>(`deadline:summary:${list}`, (d) => (Object.keys(d).length ? TTL : EMPTY_TTL), async () => buildSummary(await loadDeadlineRows(list, fresh)), { fresh });

export const invalidateDeadline = () => invalidate("deadline:");
