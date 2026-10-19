import { config } from "./config";
import { cached, invalidate } from "./cache";
import { fetchGviz, fetchSheetCsvByName } from "./gviz";
import { MOCK, readMock } from "./mock";
import { colIndex, headerNorm, parseNum, tumanKey, isTotalName } from "@/features/etirof/config";
import {
  BLOCK_COLS, BLOCK_IDS, EXTRA_COLS, KUNLIK_SHEET, SHTAB_HEADER_ROWS, SHTAB_NAME_COL, SHTAB_NUM_COL, SHTAB_SHEET,
  sheetDateToDmy, tashkentToday, weekDays,
  type BlockId, type XatlovBlock, type XatlovData, type XatlovRow,
} from "@/features/xatlov/config";

/**
 * "Xatlov+Faol": ШТАБ varag'idagi rejalar + "Кунлик" varag'idagi kunlik qiymatlar (joriy hafta).
 * MOCK rejimida mock/xatlov.json — ikkala varaqning kataklari va aniq rejalar: { shtab, kunlik, exact }.
 */
const KEY = "xatlov:";
const TOTAL = "#total";

/** Tuman nomi → aniq (yaxlitlanmagan) rejalar: [xatlov haftalik, faol haftalik, xatlov kunlik, faol kunlik] */
type Exact = Record<string, number[]>;

/**
 * Rejalar sheet'da kasr son (152,56), CSV esa yaxlitlab beradi (153) — foiz va qizil rang sheet'dagidek
 * chiqishi uchun aniq qiymatlar gviz JSON'dan (formatlanmagan `v`) olinadi.
 */
async function readExact(id: string): Promise<Exact> {
  const c = BLOCK_COLS;
  const cols = [SHTAB_NAME_COL, c.xatlov.haftaReja.col, c.faol.haftaReja.col, c.xatlov.kunReja.col, c.faol.kunReja.col];
  const t = await fetchGviz(id, SHTAB_SHEET, `SELECT ${cols.join(", ")}`, { headers: false });
  const out: Exact = {};
  for (const r of t.table?.rows ?? []) {
    const name = String(r.c?.[0]?.v ?? "").trim();
    const nums = [1, 2, 3, 4].map((i) => Number(r.c?.[i]?.v));
    if (name && nums.every(Number.isFinite)) out[name] = nums;
  }
  return out;
}

async function readSheets(): Promise<{ shtab: string[][]; kunlik: string[][]; exact: Exact }> {
  if (MOCK) return readMock("xatlov");
  const id = config.xatlovSheetId;
  const [shtab, kunlik, exact] = await Promise.all([
    fetchSheetCsvByName(id, SHTAB_SHEET),
    fetchSheetCsvByName(id, KUNLIK_SHEET),
    // Bo'lmasa ham ishlaydi — CSV'dagi yaxlitlangan qiymat olinadi
    readExact(id).catch((e) => (console.error("[xatlov] aniq rejalar:", e), {} as Exact)),
  ]);
  return { shtab, kunlik, exact };
}

type DayMap = Record<string, number>;

const nextDay = (isoDate: string) => new Date(Date.parse(`${isoDate}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10);

/**
 * "Кунлик": "Хатлов" / "Фаол" sarlavhali bloklar, ichida "Жами" qatorida sanalar (2026-10-01 …),
 * keyin T/r (0 — viloyat) va tuman nomi bilan qatorlar.
 */
function parseKunlik(grid: string[][]) {
  const out: Record<BlockId, Map<string, DayMap>> = { xatlov: new Map(), faol: new Map() };
  let block: BlockId | null = null;
  let dates: string[] = [];
  for (const r of grid) {
    const c2 = headerNorm(r[2] ?? "");
    if (c2 === "хатлов") block = "xatlov";
    else if (c2 === "фаол") block = "faol";
    else if (c2 === "жами") dates = r.map((v) => (/^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : ""));
    else if (block && /^\d+$/.test((r[0] ?? "").trim()) && (r[1] ?? "").trim()) {
      const days: DayMap = {};
      dates.forEach((d, i) => {
        if (d && String(r[i] ?? "").trim() !== "") days[d] = parseNum(r[i]);
      });
      const key = Number(r[0]) === 0 ? TOTAL : tumanKey(r[1]);
      out[block].set(key, days);
      out[block].set(`#${Number(r[0])}`, days); // zaxira: T/r bo'yicha
    }
  }
  if (!out.xatlov.size || !out.faol.size) throw new Error(`"${KUNLIK_SHEET}" varag'ida "Хатлов" va "Фаол" bloklari topilmadi`);
  return out;
}

function parse(shtab: string[][], kunlik: string[][], exact: Exact, today: string): XatlovData {
  const cell = (r: string[] | undefined, col: string) => String(r?.[colIndex(col)] ?? "").trim();

  // Sarlavhalar tekshiruvi: ustunlar surilgan bo'lsa — noto'g'ri raqam o'rniga xato
  const head = (col: string) => headerNorm(SHTAB_HEADER_ROWS.map((i) => cell(shtab[i], col)).join(" "));
  const all = [...BLOCK_IDS.flatMap((b) => Object.values(BLOCK_COLS[b])), ...Object.values(EXTRA_COLS)];
  const wrong = all.filter((c) => !head(c.col).includes(headerNorm(c.key)));
  if (wrong.length) {
    throw new Error(`"${SHTAB_SHEET}" varag'ida ustunlar mos emas: ${wrong.map((c) => `${c.col} ("${c.key}")`).join(", ")} — features/xatlov/config.ts ni moslang`);
  }

  const days = parseKunlik(kunlik);
  const week = weekDays(today);

  const block = (r: string[], b: BlockId, key: string, n: number): XatlovBlock => {
    const c = BLOCK_COLS[b];
    const ex = exact[cell(r, SHTAB_NAME_COL)];
    const bi = b === "xatlov" ? 0 : 1;
    const map = days[b].get(key) || days[b].get(`#${n}`) || {};
    const at = (d: string) => (d <= today && d in map ? map[d] : null);
    // Yakshanba alohida ustun emas — ШТАБ dagidek shanbaga qo'shiladi
    const sunday = at(nextDay(week[5]));
    const vals = week.map((d, i) => {
      const v = at(d);
      return i === 5 && sunday != null ? (v ?? 0) + sunday : v;
    });
    const hafta = vals.reduce<number>((s, v) => s + (v ?? 0), 0);
    const haftaReja = ex?.[bi] ?? parseNum(cell(r, c.haftaReja.col));
    return {
      jami: cell(r, c.jami.col), reja: cell(r, c.reja.col), bajar: cell(r, c.bajar.col), pct: cell(r, c.pct.col),
      farq: cell(r, c.farq.col), ortacha: cell(r, c.ortacha.col), haftaReja: cell(r, c.haftaReja.col), kunReja: cell(r, c.kunReja.col),
      kunRejaNum: ex?.[bi + 2] ?? parseNum(cell(r, c.kunReja.col)),
      days: vals,
      hafta,
      haftaPct: haftaReja ? hafta / haftaReja : null,
    };
  };
  const row = (r: string[], n: number, key: string): XatlovRow => ({
    n,
    name: cell(r, SHTAB_NAME_COL),
    xatlov: block(r, "xatlov", key, n),
    faol: block(r, "faol", key, n),
    jarayon: cell(r, EXTRA_COLS.jarayon.col),
    rad: cell(r, EXTRA_COLS.rad.col),
    muhandis: cell(r, EXTRA_COLS.muhandis.col),
  });

  let total: XatlovRow | null = null;
  const rows: XatlovRow[] = [];
  for (const r of shtab.slice(Math.max(...SHTAB_HEADER_ROWS) + 1)) {
    const name = cell(r, SHTAB_NAME_COL);
    if (!name) continue;
    // Viloyat qatorining T/r katagida boshqa son bo'lishi mumkin — nomi bo'yicha aniqlanadi
    if (isTotalName(name)) total ??= row(r, 0, TOTAL);
    else if (/^\d+$/.test(cell(r, SHTAB_NUM_COL))) rows.push(row(r, Number(cell(r, SHTAB_NUM_COL)), tumanKey(name)));
  }
  if (!rows.length) throw new Error(`"${SHTAB_SHEET}" varag'ida tumanlar topilmadi`);

  return {
    asOf: sheetDateToDmy(cell(shtab[1], SHTAB_NAME_COL)),
    month: cell(shtab[3], BLOCK_COLS.xatlov.reja.col) || "Ой",
    week,
    total,
    rows: rows.sort((a, b) => a.n - b.n),
  };
}

export function loadXatlov(fresh = false, today = tashkentToday()) {
  // Kesh kun bo'yicha — yarim tunda hafta almashsa, eski hafta qolib ketmaydi
  return cached(
    `${KEY}${today}`,
    config.xatlovCacheTtlMs,
    async () => {
      const { shtab, kunlik, exact } = await readSheets();
      return parse(shtab, kunlik, exact ?? {}, today);
    },
    { fresh }
  );
}

export const invalidateXatlov = () => invalidate(KEY);
