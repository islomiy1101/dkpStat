/**
 * "Kadrlar statistikasi" — kadrlar bo'limining shtat jadvali (Bazaga yuklash → Google Sheets "Shtat" varag'i).
 * Bir qator — bitta filialdagi bitta bo'limning bitta lavozimi. Jamlar (filial, viloyat) shu yerda hisoblanadi.
 * Server ham (o'qish, tekshirish), klient ham (statistika, shablon) shu fayldan foydalanadi.
 */
export const KADR_SHEET = "Shtat";

/** Excel ustunlari (sarlavha nomi bo'yicha topiladi, tartib muhim emas) */
export const KADR_COLS = {
  filial: "Filial",
  bolim: "Bo'lim",
  lavozim: "Lavozim",
  shtat: "Shtat birligi",
  band: "Band",
  vakant: "Vakant",
  toifa: "Toifa",
} as const;
export const KADR_REQUIRED = [KADR_COLS.filial, KADR_COLS.bolim, KADR_COLS.lavozim, KADR_COLS.shtat, KADR_COLS.band];
/** Yuklashda avtomatik qo'shiladigan ustun — ma'lumot sanasi */
export const KADR_UPLOADED_COL = "Yuklangan";

/** Shablon (Bazaga yuklash → "Shablonni yuklab olish") */
export const KADR_TEMPLATE: (string | number)[][] = [
  [KADR_COLS.filial, KADR_COLS.bolim, KADR_COLS.lavozim, KADR_COLS.shtat, KADR_COLS.band, KADR_COLS.vakant, KADR_COLS.toifa],
  ["Viloyat boshqarmasi", "Rahbariyat", "Boshqarma boshlig'i", 1, 1, "", "Rahbar"],
  ["Viloyat boshqarmasi", "Ro'yxatga olish bo'limi", "Bosh mutaxassis", 3, 2, "", "Mutaxassis"],
  ["Chust tumani filiali", "Rahbariyat", "Filial boshlig'i", 1, 1, "", "Rahbar"],
  ["Chust tumani filiali", "Kadastr bo'limi", "Kadastr muhandisi", 4.5, 4, "", "Mutaxassis"],
  ["Chust tumani filiali", "Kadastr bo'limi", "Haydovchi", 1, 0, "", "Texnik xodim"],
];

export type KadrRow = { filial: string; bolim: string; lavozim: string; shtat: number; band: number; vakant: number; toifa: string };
/** API javobi: qatorlar (filial rahbariga — faqat o'z filiali) va ma'lumot sanasi */
export type KadrPayload = { rows: KadrRow[]; uploadedAt: string; scope: "region" | "branch"; branch: string };

export const kadrHeaderKey = (s: unknown) =>
  String(s ?? "").trim().toLowerCase().replace(/[`'ʻ’‘ʼ]/g, "'").replace(/\s+/g, " ");

/** "4,5" / "4.5" / " 4 " → 4.5; bo'sh → null; son emas → NaN */
export function kadrNum(v: unknown): number | null {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** Sarlavha → ustun indekslari; majburiy ustun yo'q bo'lsa — Error */
export function kadrColumns(header: readonly unknown[]) {
  const h = header.map(kadrHeaderKey);
  const at = (name: string) => h.indexOf(kadrHeaderKey(name));
  const missing = KADR_REQUIRED.filter((n) => at(n) < 0);
  if (missing.length) throw new Error(`1-qatorda ustun(lar) topilmadi: ${missing.join(", ")}`);
  return {
    filial: at(KADR_COLS.filial), bolim: at(KADR_COLS.bolim), lavozim: at(KADR_COLS.lavozim),
    shtat: at(KADR_COLS.shtat), band: at(KADR_COLS.band), vakant: at(KADR_COLS.vakant), toifa: at(KADR_COLS.toifa),
    uploaded: at(KADR_UPLOADED_COL),
  };
}

/**
 * Varaq qatorlarini o'qish. `strict` (yuklashda) — xato qator raqami bilan Error;
 * aks holda (sahifada) noto'g'ri qatorlar tashlab ketiladi.
 */
export function parseKadr(values: readonly (readonly unknown[])[], strict = false): { rows: KadrRow[]; uploadedAt: string } {
  if (!values.length) return { rows: [], uploadedAt: "" };
  const c = kadrColumns(values[0]);
  const str = (r: readonly unknown[], i: number) => (i >= 0 ? String(r[i] ?? "").trim().replace(/\s+/g, " ") : "");
  const rows: KadrRow[] = [];
  let uploadedAt = "";
  values.slice(1).forEach((r, k) => {
    const line = k + 2;
    const filial = str(r, c.filial);
    const lavozim = str(r, c.lavozim);
    if (!filial && !lavozim && !str(r, c.shtat)) return; // bo'sh qator
    const shtat = kadrNum(r[c.shtat]);
    const band = kadrNum(r[c.band]);
    const vakantRaw = c.vakant >= 0 ? kadrNum(r[c.vakant]) : null;
    const bad = (msg: string) => {
      if (strict) throw new Error(`${line}-qator: ${msg}`);
    };
    if (!filial) return bad("Filial ko'rsatilmagan");
    if (!lavozim) return bad("Lavozim ko'rsatilmagan");
    if (shtat === null || Number.isNaN(shtat) || shtat < 0) return bad(`"${KADR_COLS.shtat}" son bo'lishi kerak`);
    if (band === null || Number.isNaN(band) || band < 0) return bad(`"${KADR_COLS.band}" son bo'lishi kerak`);
    if (band > shtat) return bad(`band (${band}) shtat birligidan (${shtat}) ko'p`);
    if (vakantRaw !== null && (Number.isNaN(vakantRaw) || vakantRaw < 0)) return bad(`"${KADR_COLS.vakant}" son bo'lishi kerak`);
    if (!uploadedAt && c.uploaded >= 0) uploadedAt = str(r, c.uploaded);
    rows.push({
      filial, bolim: str(r, c.bolim) || "—", lavozim, shtat, band,
      vakant: vakantRaw ?? Math.max(0, round(shtat - band)),
      toifa: str(r, c.toifa),
    });
  });
  if (strict && !rows.length) throw new Error("ma'lumot qatorlari yo'q");
  return { rows, uploadedAt };
}

const round = (n: number) => Math.round(n * 100) / 100;

/* ---------------- Statistika ---------------- */

export type KadrAgg = { shtat: number; band: number; vakant: number; rate: number };
export type KadrGroup = KadrAgg & { name: string };
export type KadrBolim = KadrGroup & { positions: KadrRow[] };
export type KadrFilial = KadrGroup & { bolimlar: KadrBolim[] };
export type KadrStats = {
  total: KadrAgg;
  filials: KadrFilial[];
  toifalar: KadrGroup[];
  /** Eng ko'p vakant lavozimlar (barcha filiallar bo'yicha) */
  topVakant: { lavozim: string; vakant: number; filials: string[] }[];
};

const agg = (list: KadrRow[]): KadrAgg => {
  const shtat = round(list.reduce((n, r) => n + r.shtat, 0));
  const band = round(list.reduce((n, r) => n + r.band, 0));
  const vakant = round(list.reduce((n, r) => n + r.vakant, 0));
  return { shtat, band, vakant, rate: shtat ? band / shtat : 0 };
};

function groupBy<T>(list: T[], key: (x: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of list) {
    const k = key(x);
    m.set(k, [...(m.get(k) ?? []), x]);
  }
  return m;
}

/** Viloyat boshqarmasi birinchi, qolgan filiallar — nomi bo'yicha */
const filialOrder = (a: string, b: string) => {
  const boss = (s: string) => /boshqarma|viloyat/i.test(s);
  return Number(boss(b)) - Number(boss(a)) || a.localeCompare(b);
};

export function buildKadrStats(rows: KadrRow[]): KadrStats {
  const filials = [...groupBy(rows, (r) => r.filial)].map(([name, list]) => ({
    name,
    ...agg(list),
    bolimlar: [...groupBy(list, (r) => r.bolim)].map(([bName, bList]) => ({ name: bName, ...agg(bList), positions: bList })),
  }));
  filials.sort((a, b) => filialOrder(a.name, b.name));
  const toifalar = [...groupBy(rows.filter((r) => r.toifa), (r) => r.toifa)]
    .map(([name, list]) => ({ name, ...agg(list) }))
    .sort((a, b) => b.shtat - a.shtat);
  const topVakant = [...groupBy(rows.filter((r) => r.vakant > 0), (r) => r.lavozim)]
    .map(([lavozim, list]) => ({ lavozim, vakant: round(list.reduce((n, r) => n + r.vakant, 0)), filials: [...new Set(list.map((r) => r.filial))] }))
    .sort((a, b) => b.vakant - a.vakant)
    .slice(0, 10);
  return { total: agg(rows), filials, toifalar, topVakant };
}

/** 4.5 → "4,5"; 12 → "12" */
export const fmtKadr = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(".", ","));
export const fmtRate = (r: number) => `${Math.round(r * 100)}%`;
/** To'lganlik rangi: <80% qizil, 80–95% sariq, ≥95% yashil */
export const rateTone = (r: number) => (r >= 0.95 ? "good" : r >= 0.8 ? "mid" : "bad");
