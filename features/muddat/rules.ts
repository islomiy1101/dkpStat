import { DISTRICTS } from "@/features/deadline/model";
import { makeTumanResolver } from "@/features/deadline/source";

/**
 * "Muddat buzilish" — UZKAD'dan olingan arizalar bazasidan (MuddatBuzilishBaza) SVOD hisoblash.
 * Qoidalar "Сен ариза.docx" bo'yicha: filtr → Turar/Noturar → muddat → hozirgi bosqich.
 * "Jami yakunlash kerak" — faqat muddati o'tgan va bugun tugaydigan arizalar; muddati borlar "Muddati bor" da.
 * Muddat (MUDDAT_NORMS, birinchi mos kelgani): Huquqlar 1 ish kuni; Qurilish 10 ish kuni; yer uchastkasi va Avtoyo'l
 * 5 ish kuni + 10 kun; daraxtlar, UZKAD, Bepul; noturar — tashqi maydon bo'yicha 8…35 ish kuni + 10 kun; Standart.
 * Bajarilgan arizalar varaqda qo'lda "Oxirgi jarayon nomi" = "Yakunlandi" qilinadi → YAKUNLANDI; QOLDI = Jami − Yakunlandi.
 * SVOD o'qish paytida, bugungi sana bo'yicha hisoblanadi ("qolgan kun" har kuni o'zgaradi).
 * Ustunlar harf bo'yicha emas, sarlavha nomi bo'yicha topiladi. Modul klientda ham, serverda ham ishlaydi.
 */

export const MUDDAT_SHEET = "MuddatBuzilishBaza";

/** Kerakli ustunlar: kalit → bazadagi sarlavha */
export const MUDDAT_COLS = {
  tuman: "Tuman",
  obyekt2: "Obyekt turi 2",
  turi: "Ariza turi",
  tranz: "Tranzaksiya raqami",
  priznak: "Priznak",
  ariza: "Ariza raqami",
  sana: "Ariza kelib tushgan sana",
  manba: "Ariza manbasi",
  kadastrTuri: "Kadastr passport olish turi",
  rol: "Oxirgi jarayon roli",
  jarayon: "Oxirgi jarayon nomi",
  registrator: "Ijrochi registrator",
  boshMuhandisFio: "Ijrochi bosh muhandis",
  muhandis: "Ijrochi muhandis",
  tashqiMaydon: "Tashqi o'lchovlar bo'yicha maydon",
} as const;
export type MuddatKey = keyof typeof MUDDAT_COLS;
export type MuddatRaw = Record<MuddatKey, string>;

export const norm = (s: unknown) =>
  String(s ?? "").trim().toLowerCase().replace(/[`'ʻ’‘ʼ]/g, "'").replace(/\s+/g, " ");
const set = (...xs: string[]) => new Set(xs.map(norm));

/** Sarlavha qatori (birinchi 3 qatordan "Tuman" va "Ariza turi" bor qator) va ustun indekslari */
export function locateMuddatColumns(rows: readonly (readonly unknown[])[]): { headerRow: number; idx: Record<MuddatKey, number> } {
  const headerRow = rows.slice(0, 3).findIndex((r) => {
    const h = r.map(norm);
    return h.includes(norm(MUDDAT_COLS.tuman)) && h.includes(norm(MUDDAT_COLS.turi));
  });
  if (headerRow < 0) throw new Error(`sarlavha qatori topilmadi (1–3-qatorlarda "${MUDDAT_COLS.tuman}" va "${MUDDAT_COLS.turi}" bo'lishi kerak)`);
  const h = rows[headerRow].map(norm);
  const idx = Object.fromEntries(Object.entries(MUDDAT_COLS).map(([k, name]) => [k, h.indexOf(norm(name))])) as Record<MuddatKey, number>;
  const missing = (Object.keys(MUDDAT_COLS) as MuddatKey[]).filter((k) => idx[k] < 0).map((k) => MUDDAT_COLS[k]);
  if (missing.length) throw new Error(`ustun(lar) topilmadi: ${missing.join(", ")}`);
  return { headerRow, idx };
}

/* ---------- 1. Filtr ---------- */

const MANBALAR = set("DXM", "Kadastr muhandisi", "Notarius", "Reestr MKD", "UZKAD", "YaIDXP");

const T = {
  avtoyol: "Avtoyo'l va suv xo'jaligi obyektining kadastr pasportini shakllantirish va ro'yxatga olish",
  huquq: "Huquqlarni davlat roʻyxatidan oʻtkazish",
  kvartira: "Kvartira kompozit",
  noturarKomp: "Noturar kompozit",
  noturar: "Noturar obyektning kadastr pasportini shakllantirish va davlat ro'yxatidan o'tkazish",
  qurilish: "Qurilishi tugallangan ko'chmas mulkni foydalanishga qabul qilish",
  registratsiya: "Registratsiya (tashqi - UZKAD da bor)",
  turar: "Turar joy obyektning kadastr pasportini shakllantirish va davlat ro'yxatidan o'tkazish",
  turarKomp: "Turar kompozit",
  umumiy: "Umumiy foydalanishdagi ko'chmas mulk qismini yaratish",
  notarius: "Notarius uchun ma'lumotnoma (uz)",
};
const TURLAR = set(...Object.values(T));
/** Bu turlarda faqat shu jarayondagi arizalar olinadi */
const FAQAT_JARAYON_TURLAR = set(T.huquq, T.registratsiya);
const FAQAT_JARAYONLAR = set("Kadastr muhandisini tanlash", "Kadastr qiymatini hisoblash va kiritish");
/** Bajarilgan ariza: foydalanuvchi "Oxirgi jarayon nomi" ustuniga qo'lda yozadi */
const YAKUNLANDI = norm("Yakunlandi");

export function passesFilter(r: MuddatRaw) {
  const manba = norm(r.manba);
  const turi = norm(r.turi);
  if (!MANBALAR.has(manba) || !TURLAR.has(turi)) return false;
  // Qo'lda "Yakunlandi" deb belgilangan ariza bu cheklovdan o'tadi (aks holda YAKUNLANDI ustunidan yo'qolardi)
  if (FAQAT_JARAYON_TURLAR.has(turi) && !FAQAT_JARAYONLAR.has(norm(r.jarayon)) && norm(r.jarayon) !== YAKUNLANDI) return false;
  if (manba === norm("UZKAD") && turi !== norm(T.umumiy)) return false;
  return true;
}

/* ---------- 2. Turar / Noturar ---------- */

const TURAR_TURLAR = set(T.turar, T.turarKomp, T.kvartira);
const NOTURAR_TURLAR = set(T.noturar, T.noturarKomp, T.avtoyol);

export function isNoturar(r: MuddatRaw) {
  const turi = norm(r.turi);
  if (TURAR_TURLAR.has(turi)) return false;
  if (NOTURAR_TURLAR.has(turi)) return true;
  // Huquqlarni…, Notarius…, Qurilishi tugallangan…, Registratsiya…, Umumiy foydalanishdagi… — "Obyekt turi 2" bo'yicha
  const d = norm(r.obyekt2);
  if (!d) {
    if (turi === norm(T.umumiy)) return norm(r.priznak) === norm("Noturar joy xizmati");
    return false;
  }
  return d.startsWith("noturar");
}

/* ---------- 3. Muddat ---------- */

/** kadastr — ish kunlari (shanba, yakshanba hisoblanmaydi); reg — ro'yxatdan o'tkazish, kalendar kunlar (0 — qo'shilmaydi) */
export type MuddatNorm = { kadastr: number; reg: number; label: string };
/** "Obyekt turi 2" — yer uchastkasi: har qanday holatda 5 ish kuni + 10 kun */
const YER_MAYDONI = set("Turar yer maydoni", "Noturar yer maydoni", "Davlat tashkilotlaridan ijaraga olingan yer uchastkasi");

/** "Tashqi o'lchovlar bo'yicha maydon": "3 402,28" → 3402.28; bo'sh yoki xato → 0 */
export function parseArea(s: string) {
  const v = Number(String(s ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Noturar obyekt — tashqi o'lchovlar bo'yicha maydon toifalari ("…gacha": chegara pastki toifada; bo'sh/0 → 8 ish kuni) */
export const NOTURAR_MAYDON: { max: number; kadastr: number; label: string }[] = [
  { max: 100, kadastr: 8, label: "≤100 kv.m" },
  { max: 1_000, kadastr: 10, label: "100–1 000 kv.m" },
  { max: 5_000, kadastr: 15, label: "1 000–5 000 kv.m" },
  { max: 15_000, kadastr: 20, label: "5 000–15 000 kv.m" },
  { max: 50_000, kadastr: 26, label: "15 000–50 000 kv.m" },
  { max: Infinity, kadastr: 35, label: ">50 000 kv.m" },
];
const noturarMaydonNorm = (r: MuddatRaw): MuddatNorm => {
  const m = parseArea(r.tashqiMaydon);
  const t = NOTURAR_MAYDON.find((x) => m <= x.max)!;
  return { kadastr: t.kadastr, reg: 10, label: `Noturar maydon (${t.label})` };
};

/**
 * Muddat qoidalari — birinchi mos kelgani olinadi:
 * 1–4 "har qanday holatda" (boshqalardan ustun; Qurilish yer maydonidan ham ustun); 5–7 maxsus holatlar; 8 — noturar maydon bo'yicha; qolgani — Standart.
 */
export const MUDDAT_NORMS: { when: (r: MuddatRaw) => boolean; norm: MuddatNorm | ((r: MuddatRaw) => MuddatNorm) }[] = [
  { when: (r) => FAQAT_JARAYON_TURLAR.has(norm(r.turi)), norm: { kadastr: 1, reg: 0, label: "Huquqlar" } },
  // Qurilish yer maydonidan ustun: "Qurilishi tugallangan…" doim 10 ish kuni
  { when: (r) => norm(r.turi) === norm(T.qurilish), norm: { kadastr: 10, reg: 0, label: "Qurilish" } },
  { when: (r) => YER_MAYDONI.has(norm(r.obyekt2)), norm: { kadastr: 5, reg: 10, label: "Yer maydoni" } },
  { when: (r) => norm(r.turi) === norm(T.avtoyol), norm: { kadastr: 5, reg: 10, label: "Avtoyo'l" } },
  { when: (r) => norm(r.priznak) === norm("Ko‘p yillik daraxtlar xizmati"), norm: { kadastr: 15, reg: 10, label: "Ko'p yillik daraxtlar" } },
  { when: (r) => norm(r.manba) === norm("UZKAD"), norm: { kadastr: 5, reg: 2, label: "UZKAD" } },
  { when: (r) => set("FREE", "Bepul").has(norm(r.kadastrTuri)), norm: { kadastr: 5, reg: 10, label: "Bepul" } },
  { when: (r) => isNoturar(r), norm: noturarMaydonNorm },
];
export const DEFAULT_NORM: MuddatNorm = { kadastr: 15, reg: 10, label: "Standart" };
export const normFor = (r: MuddatRaw): MuddatNorm => {
  const n = MUDDAT_NORMS.find((x) => x.when(r))?.norm ?? DEFAULT_NORM;
  return typeof n === "function" ? n(r) : n;
};

/** Ro'yxatdan o'tkazish bosqichidagi rollar (qolganlari — filial/kadastr bosqichi) */
const REG_ROLLAR = set("Registrar", "HeadRegistrar");

/** "2026.09.08 13:04", "2026-09-08 13:04:00", "08.09.2026" → kun (UTC yarim tunda, Date.UTC) */
export function parseDay(s: string): number | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = t.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  return null;
}

const DAY = 86_400_000;
/** Kundan keyin n ish kuni (shanba, yakshanba o'tkazib yuboriladi) */
export function addWorkDays(day: number, n: number) {
  let d = day;
  for (let left = n; left > 0; ) {
    d += DAY;
    const wd = new Date(d).getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}

/** Toshkent vaqti bo'yicha bugun (Date.UTC yarim tun) */
export function todayTashkent(now = Date.now()) {
  const d = new Date(now + 5 * 3600_000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/* ---------- 4. Hozirgi bosqich ---------- */

export const BOSQICHLAR = [
  { id: "boshliq", title: "Filial Tuman / shahar boʼlimi boshligʼi", group: "filial" },
  { id: "boshMuhandis", title: "Bosh muhandis", group: "filial" },
  { id: "inventar", title: "Inventarizatsiya muhandisi", group: "filial" },
  { id: "ajratish", title: "Asosiy qismdan ajratish jarayonida", group: "tizim" },
  { id: "ozida", title: "O'zida qolgan obyektni yaratish", group: "tizim" },
  { id: "umumiy", title: "Umumiy foydalanishdagi obyekt yaratilish", group: "tizim" },
  { id: "boglik", title: "Bog'liq arizani kutish", group: "tizim" },
  { id: "topograf", title: "Filial topograf", group: "filial" },
  { id: "dkyat", title: "Filial DKYAT", group: "filial" },
  { id: "balans", title: "Filial yer balans", group: "filial" },
  { id: "boshqarma", title: "Boshqarma (Bino va inshoot)", group: "boshqarma" },
  { id: "reg", title: "Roʼyxatdan oʼtkazuvchi", group: "boshqarma" },
  { id: "arxiv", title: "Filial Arxivchi", group: "filial" },
  { id: "kamchilik", title: "Kamchiliklar bo'yicha habarnoma yuborish va 3 kunga to'xtatish", group: "tizim" },
  { id: "kelishish", title: "Kelishish kutilmoqda", group: "tizim" },
  { id: "tolov", title: "To'lov kutilmoqda", group: "tizim" },
  { id: "yakunlandi", title: "YAKUNLANDI", group: "tizim" },
  /** Hech qaysi rol/jarayonga mos kelmagan (sahifada faqat > 0 bo'lsa ko'rinadi) */
  { id: "boshqa", title: "Boshqa", group: "tizim" },
] as const;
export type BosqichId = (typeof BOSQICHLAR)[number]["id"];

/** Avval "Oxirgi jarayon nomi" (tizimdagi kutish holatlari), keyin "Oxirgi jarayon roli" */
const BY_JARAYON = new Map<string, BosqichId>([
  [norm("Asosiy qismdan ajratish jarayonida"), "ajratish"],
  [norm("O'zida qolgan obyektni yaratish"), "ozida"],
  [norm("Umumiy foydalanishdagi obyekt yaratilish"), "umumiy"],
  [norm("Bog'liq arizani kutish"), "boglik"],
  [norm("Kamchiliklar bo'yicha habarnoma yuborish va 3 kunga to'xtatish"), "kamchilik"],
  [norm("Kelishish kutilmoqda"), "kelishish"],
  [norm("To'lov kutilmoqda"), "tolov"],
  [YAKUNLANDI, "yakunlandi"],
]);
const BY_ROL = new Map<string, BosqichId>([
  [norm("HeadOfOffice"), "boshliq"],
  [norm("ChiefEngineer"), "boshMuhandis"],
  [norm("InventoryEngineer"), "inventar"],
  [norm("Topographer"), "topograf"],
  [norm("MGATTopographer"), "topograf"],
  [norm("DCScanningClerk"), "dkyat"],
  [norm("DistrictBalanceInspector"), "balans"],
  [norm("RegionalBalanceInspector"), "boshqarma"],
  [norm("SeniorSurveyor"), "boshqarma"],
  [norm("HeadOfDepartmentDeputy"), "boshqarma"],
  [norm("DKPTopograf"), "boshqarma"],
  [norm("DCTopograf"), "boshqarma"],
  // Boshqarma bosh ro'yxatdan o'tkazuvchisi alohida ustun emas — ro'yxatdan o'tkazuvchilar bilan birga
  [norm("HeadRegistrar"), "reg"],
  [norm("Registrar"), "reg"],
  [norm("Archivist"), "arxiv"],
]);
export const bosqichOf = (r: MuddatRaw): BosqichId => BY_JARAYON.get(norm(r.jarayon)) ?? BY_ROL.get(norm(r.rol)) ?? "boshqa";

/* ---------- SVOD ---------- */

/** Qolgan kunlar ustunlari (muddati o'tmagan va bugun tugamaydiganlar) */
export const QOLGAN = [
  { id: "q1", title: "1-kun qolgan", min: 1, max: 1 },
  { id: "q2", title: "2-kun qolgan", min: 2, max: 2 },
  { id: "q3", title: "3-kun qolgan", min: 3, max: 3 },
  { id: "q4", title: "4-kun qolgan", min: 4, max: 4 },
  { id: "q5", title: "5-kun qolgan", min: 5, max: 5 },
  { id: "q6_10", title: "6-10-kun qolgan", min: 6, max: 10 },
  { id: "q11", title: "11-kun ko'p bo'lgan", min: 11, max: Infinity },
] as const;
export type QolganId = (typeof QOLGAN)[number]["id"];

/** SVOD ustunlari (katak kaliti) */
/** qoldi — Jami'dagi yakunlanmaganlar (Jami − Yakunlandi); muddatiBor — muddati o'tmagan arizalar (1…11+ kun yig'indisi) */
export type MuddatCol = "jami" | "otganFilial" | "otganReg" | "bugun" | "turar" | "noturar" | "qoldi" | "muddatiBor" | BosqichId | QolganId;

export type MuddatAriza = {
  tuman: string;
  tranz: string;
  ariza: string;
  turi: string;
  obyekt2: string;
  manba: string;
  sana: string;
  rol: string;
  jarayon: string;
  registrator: string;
  boshMuhandisFio: string;
  muhandis: string;
  noturar: boolean;
  /** "Tashqi o'lchovlar bo'yicha maydon" (kv.m); katak bo'sh bo'lsa — null */
  tashqiMaydon: number | null;
  bosqich: BosqichId;
  regBosqich: boolean;
  normLabel: string;
  /** Berilgan muddat: "15 ish kuni" yoki ro'yxatdan o'tkazish bosqichida "15 ish kuni + 10 kun" */
  berilgan: string;
  /** Muddat (Date.UTC yarim tun); sana o'qilmasa — null */
  muddat: number | null;
  /** Qolgan kun (manfiy — o'tib ketgan); sana o'qilmasa — null */
  qolgan: number | null;
};

/** Ijrochi F.I.O.: bo'sh yoki "-" — yo'q */
const ijrochi = (s: string) => (s && s !== "-" ? s : "");

export function classify(r: MuddatRaw, today: number, resolveTuman: (s: string) => string): MuddatAriza {
  const n = normFor(r);
  const regBosqich = REG_ROLLAR.has(norm(r.rol));
  const start = parseDay(r.sana);
  let muddat: number | null = null;
  if (start !== null) {
    const filial = addWorkDays(start, n.kadastr);
    muddat = regBosqich ? filial + n.reg * DAY : filial;
  }
  return {
    tuman: resolveTuman(r.tuman),
    tranz: r.tranz,
    ariza: r.ariza,
    turi: r.turi,
    obyekt2: r.obyekt2,
    manba: r.manba,
    sana: r.sana,
    rol: r.rol,
    jarayon: r.jarayon,
    registrator: ijrochi(r.registrator),
    boshMuhandisFio: ijrochi(r.boshMuhandisFio),
    muhandis: ijrochi(r.muhandis),
    noturar: isNoturar(r),
    tashqiMaydon: r.tashqiMaydon.trim() ? parseArea(r.tashqiMaydon) : null,
    bosqich: bosqichOf(r),
    regBosqich,
    normLabel: n.label,
    berilgan: regBosqich && n.reg > 0 ? `${n.kadastr} ish kuni + ${n.reg} kun` : `${n.kadastr} ish kuni`,
    muddat,
    qolgan: muddat === null ? null : Math.round((muddat - today) / DAY),
  };
}

/**
 * Ariza qaysi kataklarga tushadi:
 *  - muddati o'tgan yoki bugun tugaydigan → "Jami yakunlash kerak"; Turar/Noturar va hozirgi bosqich faqat shularni taqsimlaydi;
 *    yakunlanmaganlari "QOLDI" ga ham tushadi (QOLDI = Jami − Yakunlandi);
 *  - muddati bor → "Muddati bor" va qolgan kun ustuni (1…11+); muddatidan oldin yakunlangani hech qayerga tushmaydi.
 */
export function colsOf(a: MuddatAriza): MuddatCol[] {
  const q = a.qolgan;
  const done = a.bosqich === "yakunlandi";
  if (q === null) return ["muddatiBor"]; // sana o'qilmagan — yo'qolmasin
  if (q <= 0) {
    const cols: MuddatCol[] = ["jami", a.noturar ? "noturar" : "turar", a.bosqich, q < 0 ? (a.regBosqich ? "otganReg" : "otganFilial") : "bugun"];
    if (!done) cols.push("qoldi");
    return cols;
  }
  if (done) return [];
  const b = QOLGAN.find((x) => q >= x.min && q <= x.max);
  return b ? ["muddatiBor", b.id] : ["muddatiBor"];
}

export const VILOYAT = "Viloyat jami";
export type MuddatRowStats = Partial<Record<MuddatCol, number>>;
export type MuddatSvod = Record<string, MuddatRowStats>;

export const resolveMuddatTuman = makeTumanResolver(DISTRICTS.map((d) => d.name));

/** Xom qatorlar (sarlavhasiz) → filtrlangan arizalar */
export function toArizalar(rows: readonly (readonly string[])[], idx: Record<MuddatKey, number>, today: number): MuddatAriza[] {
  const out: MuddatAriza[] = [];
  const keys = Object.keys(MUDDAT_COLS) as MuddatKey[];
  for (const row of rows) {
    const r = Object.fromEntries(keys.map((k) => [k, String(row[idx[k]] ?? "").trim()])) as MuddatRaw;
    if (!r.tuman && !r.tranz) continue;
    if (!passesFilter(r)) continue;
    out.push(classify(r, today, resolveMuddatTuman));
  }
  return out;
}

export const BIRIKTIRILMAGAN = "Biriktirilmagan";
export const muhandisName = (a: MuddatAriza) => a.muhandis || BIRIKTIRILMAGAN;

/**
 * Tuman ichida ijrochi muhandislar kesimi: har bir muhandis uchun SVOD bilan bir xil ustunlar
 * (Jami, muddati o'tgan, bosqichlar, Muddati bor…). Saralash — "Biriktirilmagan" doim boshida, so'ng Jami, keyin Muddati bor bo'yicha kamayib.
 */
export function buildMuhandisSvod(arizalar: readonly MuddatAriza[], tuman: string): { name: string; st: MuddatRowStats }[] {
  const map = new Map<string, MuddatRowStats>();
  for (const a of arizalar) {
    if (a.tuman !== tuman) continue;
    const cols = colsOf(a);
    if (!cols.length) continue;
    const name = muhandisName(a);
    const st = map.get(name) ?? {};
    for (const c of cols) st[c] = (st[c] ?? 0) + 1;
    map.set(name, st);
  }
  return [...map.entries()]
    .map(([name, st]) => ({ name, st }))
    .sort((x, y) => Number(y.name === BIRIKTIRILMAGAN) - Number(x.name === BIRIKTIRILMAGAN) || (y.st.jami ?? 0) - (x.st.jami ?? 0) || (y.st.muddatiBor ?? 0) - (x.st.muddatiBor ?? 0) || x.name.localeCompare(y.name));
}

export function buildSvod(arizalar: readonly MuddatAriza[]): MuddatSvod {
  const svod: MuddatSvod = { [VILOYAT]: {} };
  for (const d of DISTRICTS) svod[d.name] = {};
  for (const a of arizalar) {
    const rows = [svod[VILOYAT], (svod[a.tuman] ??= {})];
    for (const c of colsOf(a)) for (const s of rows) s[c] = (s[c] ?? 0) + 1;
  }
  return svod;
}
