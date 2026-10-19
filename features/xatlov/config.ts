/**
 * "Xatlov+Faol" — ЎРҚ-937 ШТАБ маълумоти. Bitta Google Sheet, ikki varaq:
 *  - "ШТАБ маълумоти": rejalar va oylik ko'rsatkichlar (ustunlar quyida, sarlavhalari `key` bilan tekshiriladi);
 *  - "Кунлик": Хатлов va Фаол bloklari, har kuni yangi sana ustuni qo'shiladi — haftalik kunlar shu yerdan.
 * Hafta: dushanba–shanba (Toshkent vaqti); dushanba kuni — o'tgan hafta (yangi haftada hali ma'lumot yo'q).
 * Yakshanba alohida ustun emas — ШТАБ dagidek shanba qiymatiga qo'shiladi.
 */
export const SHTAB_SHEET = "ШТАБ маълумоти";
export const KUNLIK_SHEET = "Кунлик";

/** ШТАБ varag'idagi ustun harfi va sarlavhasida bo'lishi shart bo'lgan so'z */
type Col = { col: string; key: string };
export const BLOCK_COLS = {
  xatlov: {
    jami: { col: "F", key: "хатлов" },
    reja: { col: "G", key: "режа" },
    bajar: { col: "H", key: "бажари" },
    pct: { col: "I", key: "%" },
    farq: { col: "J", key: "фарқ" },
    ortacha: { col: "K", key: "ўртача" },
    haftaReja: { col: "L", key: "режа" },
    kunReja: { col: "N", key: "1 кунлик" },
  },
  faol: {
    jami: { col: "V", key: "фаол" },
    reja: { col: "W", key: "режа" },
    bajar: { col: "X", key: "бажари" },
    pct: { col: "Y", key: "%" },
    farq: { col: "Z", key: "фарқ" },
    ortacha: { col: "AA", key: "ўртача" },
    haftaReja: { col: "AB", key: "режа" },
    kunReja: { col: "AD", key: "1 кунлик" },
  },
} satisfies Record<string, Record<string, Col>>;
export const EXTRA_COLS = {
  jarayon: { col: "AL", key: "жараён" },
  rad: { col: "AM", key: "рад" },
  muhandis: { col: "AN", key: "мухандис" },
} satisfies Record<string, Col>;
/** ШТАБ: T/r va tuman nomi ustunlari, sarlavha qatorlari (0 dan), sana katagi */
export const SHTAB_NUM_COL = "D";
export const SHTAB_NAME_COL = "E";
export const SHTAB_HEADER_ROWS = [2, 3, 4];

export type BlockId = keyof typeof BLOCK_COLS;
export const BLOCK_IDS = Object.keys(BLOCK_COLS) as BlockId[];

/** Sheet'dagi formatlangan qiymatlar ("4 687", "97%", "2,4") + haftalik kunlar "Кунлик"dan */
export type XatlovBlock = {
  jami: string; reja: string; bajar: string; pct: string; farq: string; ortacha: string; haftaReja: string; kunReja: string;
  /** 1 kunlik rejaning aniq qiymati (sheet'da kasr, ko'rinishda yaxlitlangan) — qizil rang shu bilan solishtiriladi */
  kunRejaNum: number;
  /** Hafta kunlari (6 ta): kelmagan kun yoki Кунлик'da hali yo'q sana — null */
  days: (number | null)[];
  /** 1 ҳафтада = kunlar yig'indisi; % = yig'indi / ҳафталик режа */
  hafta: number;
  haftaPct: number | null;
};
export type XatlovRow = { n: number; name: string; xatlov: XatlovBlock; faol: XatlovBlock; jarayon: string; rad: string; muhandis: string };
export type XatlovData = {
  /** ШТАБ dagi sana (E2) */
  asOf: string;
  /** Sarlavhadagi oy ("Октябр") */
  month: string;
  /** Hafta kunlari, ISO "2026-10-12" */
  week: string[];
  total: XatlovRow | null;
  rows: XatlovRow[];
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Toshkent (UTC+5) bo'yicha bugungi sana, ISO */
export const tashkentToday = (now = new Date()) => iso(new Date(now.getTime() + 5 * 3600_000));

/** Dushanba–shanba (6 kun); dushanba kuni — o'tgan hafta, yakshanba — tugagan hafta */
export function weekDays(todayIso: string): string[] {
  const t = new Date(`${todayIso}T00:00:00Z`);
  const dow = t.getUTCDay(); // 0 — yakshanba
  const back = dow === 1 ? 7 : dow === 0 ? 6 : dow - 1;
  const mon = new Date(t.getTime() - back * 86400_000);
  return Array.from({ length: 6 }, (_, i) => iso(new Date(mon.getTime() + i * 86400_000)));
}

/** "2026-10-12" → "12.10.2026" */
export const dmy = (isoDate: string) => {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
};

/** Sheet'dagi "10/19/2026" (M/D/YYYY) → "19.10.2026"; tanilmagan format o'zgarishsiz qoladi */
export function sheetDateToDmy(s: string) {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[2].padStart(2, "0")}.${m[1].padStart(2, "0")}.${m[3]}` : s;
}

/**
 * Foiz rangi — Excel'ning 3 rangli shkalasi: eng kichik qiymat qizil, mediana sariq, eng katta yashil,
 * oraliqda gradient; 100% va undan yuqori — doim yashil.
 */
const RED = [248, 105, 107];
const YELLOW = [255, 235, 132];
const GREEN = [99, 190, 123];
const mix = (a: number[], b: number[], t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(", ")})`;

export function pctScale(values: number[]) {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const min = s[0] ?? 0;
  const max = s[s.length - 1] ?? 1;
  const mid = s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0.5;
  return (v: number | null) => {
    if (v == null || !Number.isFinite(v)) return undefined;
    if (v >= 1) return mix(GREEN, GREEN, 0);
    if (v <= mid) return mid === min ? mix(YELLOW, YELLOW, 0) : mix(RED, YELLOW, Math.max(0, (v - min) / (mid - min)));
    return max === mid ? mix(YELLOW, YELLOW, 0) : mix(YELLOW, GREEN, Math.min(1, (v - mid) / (max - mid)));
  };
}
