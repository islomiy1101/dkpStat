import { branchKey } from "@/lib/roles";
import { slugify } from "./model";
import type { DeadlineRow } from "./aggregate";

/**
 * "Rollar kesimida tahlil" manbasi: Google Sheets'dagi ikkita varaq (Yakunlangan / Jarayondagi arizalar).
 * Varaq tuzilishi (ikkalasida bir xil):
 *  - 1-qator: asosiy sarlavhalar (Tuman, Tranzaksiya raqami, Ariza raqami, Ariza manbasi …)
 *    va rol guruhlari (Tizim, Filial, Boshqarma, DKP, Agentlik — guruh nomi faqat birinchi ustunida);
 *  - 2-qator: rollar (Arxivchi, Filial topograf, … , Jami) — katakda rolda turgan vaqt: "1 kun 8 soat 16 min 42 s" yoki "-";
 *  - 3-qatordan: ma'lumotlar (bitta qator — bitta ariza).
 * Ustunlar tartib raqami bo'yicha emas, sarlavha nomi bo'yicha topiladi (yangi ustun qo'shilsa ham buzilmaydi).
 * Bu modul klientda ham (yuklashdan oldin tekshirish), serverda ham ishlatiladi.
 */

export const DEADLINE_LISTS = {
  yakunlangan: { sheet: "YakunlanganArizalar", svodSheet: "YakunlanganSvod", title: "Yakunlangan arizalar", icon: "fa-solid fa-circle-check" },
  jarayonda: { sheet: "JarayondagiArizalar", svodSheet: "JarayondagiSvod", title: "Jarayondagi arizalar", icon: "fa-solid fa-hourglass-half" },
} as const;
export type DeadlineList = keyof typeof DEADLINE_LISTS;
export const DEADLINE_LIST_IDS = Object.keys(DEADLINE_LISTS) as DeadlineList[];
export const isDeadlineList = (s: unknown): s is DeadlineList => typeof s === "string" && s in DEADLINE_LISTS;

/** Sarlavha qatorlari soni (ma'lumot shundan keyingi qatordan boshlanadi) */
export const DEADLINE_HEADER_ROWS = 2;

/** 1-qatorda bo'lishi shart bo'lgan ustunlar */
const BASE = { tuman: "Tuman", tranz: "Tranzaksiya raqami", ariza: "Ariza raqami", manba: "Ariza manbasi" } as const;
export const DEADLINE_BASE_HEADERS = Object.values(BASE);

/** Varaqdagi rol nomi → jadvaldagi (model.ts) nomi; kalit — slug */
const ROLE_ALIASES: Record<string, string> = {
  "boshqarma-bino-inshootlar-soliq-maydon": "Boshqarma bino-inshootlar (soliq)",
  "boshqarma-boshliq-orinbosari": "Boshliq o'rinbosari",
  "boshqarma-bosh-royxatdan-otkazuvchisi": "Bosh ro'yxatdan o'tkazuvchi",
  "boshqarma-bino-inshootlar": "Bino-inshootlar",
};
/** Guruhning "Jami" ustuni → jadvaldagi nomi */
const JAMI_NAMES: Record<string, string> = {
  filial: "Filial Jami",
  boshqarma: "BOSHQARMA JAMI KUNLAR",
  dkp: "DKP JAMI KUNLAR",
};

export type RoleCol = { idx: number; rol: string; isJami: boolean };
export type DeadlineCols = { tuman: number; tranz: number; ariza: number; manba: number; roles: RoleCol[] };

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/[`'ʻ’‘ʼ]/g, "'").replace(/\s+/g, " ");

/** Ikki sarlavha qatoridan kerakli ustunlarni topadi; topilmasa — foydalanuvchiga ko'rsatiladigan xato */
export function locateColumns(row1: readonly unknown[], row2: readonly unknown[]): DeadlineCols {
  const h1 = row1.map(norm);
  const find = (name: string) => h1.indexOf(norm(name));
  const base = Object.fromEntries(Object.entries(BASE).map(([k, name]) => [k, find(name)])) as Record<keyof typeof BASE, number>;
  const missing = (Object.keys(BASE) as (keyof typeof BASE)[]).filter((k) => base[k] < 0).map((k) => BASE[k]);
  if (missing.length) throw new Error(`1-qatorda ustun(lar) topilmadi: ${missing.join(", ")}`);

  // Rollar: 2-qatorda nomi bor ustunlar; guruh — 1-qatordagi oxirgi to'ldirilgan nom (birlashtirilgan kataklar)
  const roles: RoleCol[] = [];
  let group = "";
  const width = Math.max(row1.length, row2.length);
  for (let i = 0; i < width; i++) {
    const g = String(row1[i] ?? "").trim();
    const name = String(row2[i] ?? "").trim();
    if (!name) {
      group = "";
      continue;
    }
    if (g) group = g;
    const isJami = norm(name) === "jami";
    const rol = isJami ? JAMI_NAMES[slugify(group)] || `${group} Jami` : ROLE_ALIASES[slugify(name)] || name;
    roles.push({ idx: i, rol, isJami });
  }
  if (!roles.length) throw new Error("2-qatorda rollar topilmadi (Tizim, Arxivchi, Filial topograf …)");
  return { ...base, roles };
}

/**
 * Varaqdagi har bir ustunning ko'rinadigan nomi (modal va Excel uchun):
 * rol ustuni — "Filial · Arxivchi", qolganlari — 1-qatordagi nomi.
 */
export function sheetHeaders(row1: readonly unknown[], row2: readonly unknown[]): string[] {
  const out: string[] = [];
  let group = "";
  const width = Math.max(row1.length, row2.length);
  for (let i = 0; i < width; i++) {
    const g = String(row1[i] ?? "").trim();
    const name = String(row2[i] ?? "").trim();
    if (!name) {
      group = "";
      out.push(g || colLetter(i));
      continue;
    }
    if (g) group = g;
    out.push(group ? `${group} · ${name}` : name);
  }
  return out;
}

/** "1 kun 8 soat 16 min 42 s" → soniyalar; "-" yoki bo'sh → null */
export function parseDuration(v: unknown): number | null {
  const s = String(v ?? "").trim();
  if (!s || s === "-") return null;
  let sec = 0;
  let found = false;
  for (const m of s.matchAll(/(\d+(?:[.,]\d+)?)\s*(kun|soat|min|s)\b/g)) {
    found = true;
    const n = Number(m[1].replace(",", "."));
    sec += m[2] === "kun" ? n * 86400 : m[2] === "soat" ? n * 3600 : m[2] === "min" ? n * 60 : n;
  }
  return found ? sec : null;
}

/** Varaqdagi tuman nomi → jadvaldagi nom ("Namangan shahri" → "Namangan shahar", ‘ va ʼ farqlari) */
export function makeTumanResolver(known: readonly string[]) {
  const map = new Map(known.map((n) => [branchKey(n), n]));
  return (raw: string) => map.get(branchKey(raw)) || raw;
}

/**
 * Keng jadval (bir qator — bir ariza, har bir rol alohida ustunda) → har bir ariza × rol uchun bitta qator.
 * `ri` — `data` dagi qator indeksi (modalda varaqdagi to'liq qatorni ko'rsatish uchun).
 * Kun: rolda turgan vaqt yuqoriga yaxlitlangan kunlarda (8 soat → 1-kun, 1 kun 8 soat → 2-kun).
 * "Jami" ustunlarida "0 s" — ariza shu guruhga umuman kelmagan, sanalmaydi.
 */
export function toDeadlineRows(data: readonly (readonly unknown[])[], cols: DeadlineCols, resolveTuman: (s: string) => string): DeadlineRow[] {
  const out: DeadlineRow[] = [];
  const str = (r: readonly unknown[], i: number) => String(r[i] ?? "").trim();
  data.forEach((r, ri) => {
    const tranz = str(r, cols.tranz);
    const ariza = str(r, cols.ariza) || tranz;
    const tumanRaw = str(r, cols.tuman);
    if (!ariza || !tumanRaw) return;
    const tuman = resolveTuman(tumanRaw);
    const manba = str(r, cols.manba);
    for (const rc of cols.roles) {
      const sec = parseDuration(r[rc.idx]);
      if (sec === null || (rc.isJami && sec <= 0)) continue;
      out.push({ ri, ariza, tranz, tuman, manba, rol: rc.rol, vaqt: str(r, rc.idx), kun: Math.max(1, Math.ceil(sec / 86400)) });
    }
  });
  return out;
}

/** 0-asosli ustun raqami → harf (0 → A, 26 → AA) */
export function colLetter(i: number) {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
