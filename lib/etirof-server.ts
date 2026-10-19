import { config } from "./config";
import { cached, invalidate } from "./cache";
import { fetchGvizCsv } from "./gviz";
import { MOCK, readMock } from "./mock";
import {
  ETIROF_PAGES, colIndex, flatCols, headerNorm, isTotalName, tumanKey,
  type EtirofPage, type EtirofRow, type EtirofSvod,
} from "@/features/etirof/config";

/**
 * "E'tirof": SVOD varaqlari va tuman bo'yicha xom qatorlar (Google Sheets gviz CSV orqali, faqat o'qish).
 * MOCK rejimida mock/etirof_<page>.json — Свод varag'ining kataklari: { grid, header } (string[][]).
 * Diqqat: gviz noto'g'ri varaq nomida xato bermaydi — birinchi varaqni qaytaradi. Shuning uchun Свод sarlavhalari
 * (key) va xom varaqdagi "Tuman" ustuni tekshiriladi.
 */
const KEY = "etirof:";

/** Свод ustunlari: A — lotincha nom, B — tartib raqami, C — kirillcha nom */
const LATIN = 0;
const NUM = 1;
const NAME = 2;

async function readSvod(page: EtirofPage): Promise<{ grid: string[][]; header: string[][] }> {
  if (MOCK) return readMock(`etirof_${page}`);
  const def = ETIROF_PAGES[page];
  const id = config.etirofSheets[page];
  // Sarlavha oralig'i alohida o'qiladi: gviz ustun turini ko'pchilik qiymatga qarab tanlaydi —
  // butun varaqda raqamli ustunlarning sarlavha matni bo'sh keladi
  const [grid, header] = await Promise.all([fetchGvizCsv(id, def.svodSheet), fetchGvizCsv(id, def.svodSheet, { range: def.headerRange })]);
  return { grid, header };
}

const DATE_RE = /\d{1,3}\.\d{1,2}\.\d{4}/;

function parseSvod(page: EtirofPage, grid: string[][], header: string[][]): EtirofSvod {
  const def = ETIROF_PAGES[page];
  const defs = flatCols(def.head);
  const cols = defs.map((c) => colIndex(c.col));
  const cell = (r: string[], i: number) => String(r[i] ?? "").trim();
  const pick = (r: string[], n: number): EtirofRow => ({ n, name: cell(r, NAME), latin: cell(r, LATIN), cells: cols.map((i) => cell(r, i)) });

  // Ustunlar surilmaganini tekshirish: har bir ustun sarlavhasida kalit so'z bo'lishi kerak
  const headText = (i: number) => headerNorm(header.map((r) => cell(r, i)).join(" "));
  const wrong = defs.filter((c) => !headText(colIndex(c.col)).includes(headerNorm(c.key)));
  if (wrong.length) {
    const list = wrong.map((c) => `${c.col} ("${c.key}")`).join(", ");
    throw new Error(`"${def.svodSheet}" varag'ida ustunlar mos emas: ${list}. Jadval tuzilishi o'zgargan — features/etirof/config.ts ni moslang`);
  }

  let total: EtirofRow | null = null;
  const rows: EtirofRow[] = [];
  for (const r of grid) {
    const name = cell(r, NAME);
    if (!name) continue;
    const n = Number(cell(r, NUM));
    if (Number.isInteger(n) && n > 0 && !isTotalName(name)) rows.push(pick(r, n));
    else if (!total && !cell(r, NUM) && isTotalName(name)) total = pick(r, 0);
  }
  if (!rows.length) throw new Error(`"${def.svodSheet}" varag'ida tumanlar topilmadi (B ustunida tartib raqami, C ustunida tuman nomi bo'lishi kerak)`);

  // Sana: A–C ustunlaridagi "… ҳолатига" katagi; sarlavha sanalari — har bir ustunning sarlavha kataklaridan
  let asOf = "";
  for (const r of header) for (const v of [cell(r, 0), cell(r, 1), cell(r, 2)]) if (!asOf && DATE_RE.test(v)) asOf = v;
  const headDates: Record<string, string> = {};
  for (const c of defs) {
    if (!c.label.includes("{date}")) continue;
    const m = header.map((r) => cell(r, colIndex(c.col))).join(" ").match(/\d{1,2}\.\d{1,2}\.\d{4}/);
    if (m) headDates[c.col] = m[0];
  }
  return { page, asOf, headDates, total, rows: rows.sort((a, b) => a.n - b.n) };
}

export function loadEtirofSvod(page: EtirofPage, fresh = false) {
  return cached(
    `${KEY}svod:${page}`,
    config.etirofCacheTtlMs,
    async () => {
      const { grid, header } = await readSvod(page);
      return parseSvod(page, grid, header);
    },
    { fresh }
  );
}

export const invalidateEtirof = () => invalidate(KEY);

/** Xom varaqlardagi tuman ustuni ("Tuman", "Tuman nomi"); Свод'dagi "Ҳудуд номи" bunga tushmaydi */
const TUMAN_HEADER = /^(tuman|tuman nomi|туман|туман номи)$/i;

type RawSheet = { sheet: string; headers: string[]; tumanCol: number; rows: string[][] };

async function loadRawSheet(page: EtirofPage, sheet: string, fresh: boolean): Promise<RawSheet> {
  return cached(
    `${KEY}raw:${page}:${sheet}`,
    config.etirofCacheTtlMs,
    async () => {
      const grid = MOCK ? mockRaw((await readSvod(page)).grid) : await fetchGvizCsv(config.etirofSheets[page], sheet);
      const hi = grid.slice(0, 10).findIndex((r) => r.some((v) => TUMAN_HEADER.test(v.trim())));
      if (hi < 0) throw new Error(`"${sheet}" varag'ida "Tuman" ustuni topilmadi (varaq nomi to'g'rimi?)`);
      const headers = grid[hi].map((v, i) => v.trim() || (i === 0 ? "№" : ""));
      const tumanCol = headers.findIndex((v) => TUMAN_HEADER.test(v));
      const rows = grid.slice(hi + 1).filter((r) => r.some((v) => v.trim()));
      return { sheet, headers, tumanCol, rows };
    },
    { fresh }
  );
}

/**
 * Tuman bo'yicha xom qatorlar — har bir xom varaq alohida; tuman bo'sh yoki "вилоят" bo'lsa — hammasi.
 * Sarlavhasi ham, qiymati ham yo'q ustunlar (varaq oxiridagi bo'sh/formula ustunlari) tashlanadi.
 */
export async function loadEtirofRows(page: EtirofPage, tuman: string, fresh = false) {
  const sheets = await Promise.all(ETIROF_PAGES[page].rawSheets.map((s) => loadRawSheet(page, s, fresh)));
  const all = !tuman || isTotalName(tuman);
  const key = tumanKey(tuman);
  return sheets.map(({ sheet, headers, tumanCol, rows }) => {
    const picked = all ? rows : rows.filter((r) => tumanKey(r[tumanCol]) === key);
    const keep = headers.map((h, i) => !!h || picked.some((r) => String(r[i] ?? "").trim()));
    const cut = (r: string[]) => r.filter((_, i) => keep[i]);
    return { sheet, headers: cut(headers), rows: picked.map(cut) };
  });
}

/** MOCK: Свод'dagi 1-ustun qiymatlariga ko'ra soxta xom qatorlar (faqat lokal sinov) */
function mockRaw(svod: string[][]) {
  const out: string[][] = [["", "Kadastr raqami", "Viloyat", "Tuman", "Mahalla", "Holati"]];
  let i = 0;
  for (const r of svod) {
    const n = Number(r[NUM]);
    if (!Number.isInteger(n) || n <= 0) continue;
    const count = Math.min(Number(String(r[3]).replace(/\D/g, "")) || 3, 40);
    for (let k = 0; k < count; k++) {
      i++;
      out.push([String(i), `16:${String(n).padStart(2, "0")}:40:01:01:${String(k).padStart(4, "0")}`, "Namangan viloyati", r[LATIN], `Test MFY ${k + 1}`, "Sinov"]);
    }
  }
  return out;
}
