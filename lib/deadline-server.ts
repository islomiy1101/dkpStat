import { config } from "./config";
import { MOCK, readMock } from "./mock";
import { cached, invalidate } from "./cache";
import { fetchGvizCsv } from "./gviz";
import { buildSummary, unflattenSummary, type DeadlineRow, type DeadlineSheet } from "@/features/deadline/aggregate";
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

/**
 * Xom varaq to'liq (barcha ustunlar — modal va Excel'da hammasi kerak), bitta so'rovda.
 * Varaq "Bazaga yuklash"da matn sifatida yoziladi — gviz ustun turini adashtirmaydi.
 */
async function load(list: DeadlineList): Promise<DeadlineSheet> {
  if (MOCK) return loadMock(list);
  const sheet = DEADLINE_LISTS[list].sheet;
  return toSheet(await fetchGvizCsv(config.deadlineSheetId, sheet), sheet);
}

/** Ma'lumot faqat "Bazaga yuklash" orqali o'zgaradi — kesh uzoqroq (yuklashda tozalanadi, "Yangilash" chetlab o'tadi) */
const TTL = Math.max(config.cacheTtlMs, config.deadlineCacheTtlMs);

/**
 * Bo'sh natija (varaq yuklanayotgan payt — birinchi qism uni tozalaydi) faqat qisqa muddat saqlanadi,
 * aks holda ma'lumot qayta yozilgandan keyin ham sahifa 10 daqiqagacha bo'sh ko'rinardi.
 */
const EMPTY_TTL = 30_000;

/** Ro'yxatning xom varag'i (ariza × rol qatorlari bilan) — details va eksport shundan olinadi */
export const loadDeadlineSheet = (list: DeadlineList, fresh = false) =>
  cached<DeadlineSheet>(`deadline:rows:${list}`, (s) => (s.rows.length ? TTL : EMPTY_TTL), () => load(list), { fresh });

/**
 * Tayyor svod varaqdan (bir necha KB) o'qish. Varaq hali yaratilmagan, bo'sh yoki eski formatda bo'lsa — null.
 * Netlify'da xotira keshi instansiyalar orasida yo'qoladi — shuning uchun og'ir xom varaqni har safar o'qimaslik muhim.
 */
async function loadSvod(list: DeadlineList): Promise<DeadlineData | null> {
  if (MOCK) return null;
  try {
    const rows = await fetchGvizCsv(config.deadlineSheetId, DEADLINE_LISTS[list].svodSheet);
    const data = unflattenSummary(rows);
    return data && Object.keys(data).length ? data : null;
  } catch {
    return null;
  }
}

/** Butun viloyat bo'yicha jamlanma: svod varaqdan, bo'lmasa xom varaqdan hisoblanadi */
export const loadDeadlineSummary = (list: DeadlineList, fresh = false) =>
  cached<DeadlineData>(
    `deadline:summary:${list}`,
    (d) => (Object.keys(d).length ? TTL : EMPTY_TTL),
    async () => (await loadSvod(list)) ?? buildSummary((await loadDeadlineSheet(list, fresh)).rows),
    { fresh }
  );

export const invalidateDeadline = () => invalidate("deadline:");
