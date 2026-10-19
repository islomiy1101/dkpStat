/**
 * "E'tirof" bo'limi: 4 ta bo'limcha, har biri alohida Google Sheets faylining SVOD varag'i.
 * Jadval tuzilishi (sarlavhalar, ranglar, bar'lar) shu yerda — sheet'dan faqat qiymatlar olinadi.
 * "Свод" varag'i: A — lotincha tuman nomi (yashirin), B — tartib raqami, C — kirillcha nom, D dan — raqamlar;
 * C ustunida "вилоят" — jami qatori. Sarlavhalar 1–4-qatorlarda (headerRange): har bir ustun `key` bilan
 * tekshiriladi (sheet'da ustun surilsa — noto'g'ri raqam o'rniga xato), sana va sarlavhadagi sanalar ham shu yerdan.
 * Sheet ID'lar faqat serverda (lib/config.ts → ETIROF_*_SHEET_ID).
 */
export const ETIROF_PAGE_IDS = ["nomzod", "tahrirlash", "tolov", "qaror"] as const;
export type EtirofPage = (typeof ETIROF_PAGE_IDS)[number];
export const isEtirofPage = (s: string): s is EtirofPage => (ETIROF_PAGE_IDS as readonly string[]).includes(s);

/**
 * Sarlavha matni: "{r:qizil} oddiy {b:ko'k} {c:havorang} {o:to'q sariq}" — rangli bo'laklar.
 * "{date}" — shu ustun sarlavhasidagi sana (sheet'dan, masalan "13.10.2026").
 */
export type Tone = "red" | "blue" | "orange";
export type BarColor = "orange" | "blue" | "red";

export type EtirofCol = {
  /** "Свод" varag'idagi ustun harfi */
  col: string;
  /** Sheet sarlavhasida bo'lishi shart bo'lgan so'z (ustun surilmaganini tekshirish uchun) */
  key: string;
  label: string;
  /** Excel'dagi kabi data-bar (uzunligi ustundagi eng katta qiymatga nisbatan) */
  bar?: BarColor;
  /** Raqam rangi */
  tone?: Tone;
  bold?: boolean;
  /** Sarlavha rangi (masalan "Ортга қайтариш керак") */
  headTone?: Tone;
};
export type EtirofGroup = { group: string; cols: EtirofCol[] };
export type EtirofHead = EtirofCol | EtirofGroup;
export const isGroup = (h: EtirofHead): h is EtirofGroup => "group" in h;

export type EtirofPageDef = {
  /** Sidebar va sahifa sarlavhasi */
  title: string;
  icon: string;
  /** Hisobot sarlavhasi (kirill, sheet'dagidek) */
  heading: string;
  /** Sarlavha rang aksenti */
  accent: string;
  head: EtirofHead[];
  /** Svod varag'i va undagi sarlavha oralig'i (sana shu yerdan olinadi) */
  svodSheet: string;
  headerRange: string;
  /** Tuman bo'yicha Excel uchun xom ro'yxat varaqlari (har biri Excel'da alohida varaq) */
  rawSheets: string[];
};

export const ETIROF_PAGES: Record<EtirofPage, EtirofPageDef> = {
  nomzod: {
    title: "E'tirof nomzod",
    icon: "fa-solid fa-user-check",
    heading: "{c:Эътироф} тизимига ўтган {r:номзодлар} тўғрисида",
    accent: "#ea580c",
    svodSheet: "Свод",
    headerRange: "A1:J4",
    rawSheets: ["Янги", "Хулосага юбориш"],
    head: [
      {
        group: "{r:Янги} ҳолатида турган объектлар",
        cols: [
          { col: "D", key: "янги", label: "{r:Янги} {b:бугунги кун} ҳолатига", bar: "orange", tone: "red" },
          { col: "E", key: "топшириқ", label: "{r:Топшириқ берилган} {b:{date}} ҳолатига" },
          { col: "F", key: "мухокама", label: "{b:Муҳокамага юборилди}", bar: "blue" },
        ],
      },
      {
        group: "{r:Хулосага юбориш} ҳолатида турган объектлар",
        cols: [
          { col: "G", key: "хулосага", label: "{r:Хулосага юборишда} {b:бугунги кун} ҳолатига", bar: "orange", tone: "red" },
          { col: "H", key: "топшириқ", label: "{r:Топшириқ берилган} {b:{date}} ҳолатига" },
          { col: "I", key: "мухокама", label: "{b:Муҳокамага юборилди}", bar: "blue" },
          { col: "J", key: "ортга", label: "Ортга қайтариш керак", headTone: "orange" },
        ],
      },
    ],
  },
  tahrirlash: {
    title: "Tahrirlashga qaytarilgan",
    icon: "fa-solid fa-pen-to-square",
    heading: "{c:Эътироф} тизимида {r:Таҳрирлашга қайтарилган} объектлар тўғрисида",
    accent: "#dc2626",
    svodSheet: "Свод",
    headerRange: "A1:R4",
    rawSheets: ["Тахрирлашга қайтган", "Мухофаза худудда жойлашган"],
    // E, H, K, L, M — sheet'da yashirin ustunlar, sahifaga chiqmaydi
    head: [
      { col: "D", key: "тахрирлашга", label: "Таҳрирлашга қайтарилган", bar: "red", bold: true },
      {
        group: "шундан",
        cols: [
          { col: "F", key: "5-модда", label: "5-модда адлияга қайтмаган" },
          { col: "G", key: "адлияга", label: "Адлияга қайтариш керак" },
          { col: "I", key: "қайта кўриб", label: "Қайта кўриб чиқиш керак" },
          { col: "J", key: "модда хато", label: "Модда хато танланган" },
          { col: "N", key: "илова", label: "Ҳужжати илова қилинмаган" },
          { col: "O", key: "2018", label: "Ҳужжати 2018 йил 1 майдан кейин" },
        ],
      },
      { col: "P", key: "мухокама", label: "Муҳокамага юборилди", bar: "blue", bold: true },
      { col: "Q", key: "мухфаза", label: "{r:Муҳофаза ҳудудларда жойлашган} объектларни таҳрирлашга қайтарилган", bar: "red", bold: true },
      { group: "шундан", cols: [{ col: "R", key: "муддати", label: "муддати ўтган" }] },
    ],
  },
  tolov: {
    title: "E'tirof to'lov kutilmoqda",
    icon: "fa-solid fa-hand-holding-dollar",
    heading: "{b:Эътироф АТ} тизимида {r:тўлов жараёнида} турган объектлар тўғрисида",
    accent: "#2563eb",
    svodSheet: "Свод",
    headerRange: "A1:J4",
    rawSheets: ["номма-ном"],
    head: [
      { col: "D", key: "сони", label: "сони", bar: "red" },
      { col: "E", key: "тўлов миқдори", label: "тўлов миқдори {r:(млн. сўм)}" },
      {
        group: "шундан",
        cols: [
          { col: "F", key: "телефон", label: "Телефон рақам киритилмаган", tone: "red" },
          { col: "G", key: "оператор", label: "{r:Мавжуд бўлмаган} оператор {r:коди} ёзилган", tone: "red" },
          { col: "H", key: "смс", label: "{r:СМС} юбориб бўлмайдиган рақам ёзилган", tone: "red" },
        ],
      },
      {
        group: "{b:Тўлов амалга оширилди}",
        cols: [
          { col: "I", key: "сони", label: "сони", bar: "blue" },
          { col: "J", key: "миқдори", label: "миқдори {b:(млн. сўм)}" },
        ],
      },
    ],
  },
  qaror: {
    title: "E'tirof qaror chiqqan",
    icon: "fa-solid fa-gavel",
    heading: "{b:Эътироф АТ} тизимида {r:ҳуқуқлари этироф этилган} объектлар тўғрисида",
    accent: "#16a34a",
    svodSheet: "Свод",
    headerRange: "A1:N4",
    rawSheets: ["номма-ном"],
    head: [
      { col: "D", key: "сони", label: "сони", bold: true },
      {
        group: "шундан",
        cols: [
          { col: "E", key: "ўтган", label: "Давлат рўйхатидан {b:ўтган}", tone: "blue" },
          { col: "F", key: "%", label: "%", tone: "blue" },
          { col: "G", key: "ўтмаган", label: "Давлат рўйхатидан {r:ўтмаган}", tone: "red", bold: true },
          { col: "H", key: "%", label: "%", tone: "red", bold: true },
        ],
      },
      {
        group: "{r:Рўйхатдан ўтказилмагани (муддатлар кесимида)}",
        cols: [
          { col: "I", key: "1 ойгача", label: "1 ойгача" },
          { col: "J", key: "1 ойдан 3", label: "1 ойдан 3 ойгача" },
          { col: "K", key: "3 ойдан 6", label: "3 ойдан 6 ойгача" },
          { col: "L", key: "6 ойдан 9", label: "6 ойдан 9 ойгача" },
          { col: "M", key: "9 ойдан 12", label: "9 ойдан 12 ойгача" },
          { col: "N", key: "1 йилдан", label: "1 йилдан ўтган" },
        ],
      },
    ],
  },
};

/** Barcha ma'lumot ustunlari (sarlavha tartibida) */
export const flatCols = (head: EtirofHead[]): EtirofCol[] => head.flatMap((h) => (isGroup(h) ? h.cols : [h]));

/** "C" → 2, "AB" → 27 */
export function colIndex(letter: string) {
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Sahifaga yuboriladigan SVOD */
/** name — sheet'dagi kirillcha nom; latin — yashirin A ustunidagi nom (xom varaqlardagi bilan bir xil) */
export type EtirofRow = { n: number; name: string; latin: string; cells: string[] };
export type EtirofSvod = {
  page: EtirofPage;
  /** "19.10.2026 ҳолатига" */
  asOf: string;
  /** Sarlavhadagi sanalar: ustun harfi → "13.10.2026" */
  headDates: Record<string, string>;
  total: EtirofRow | null;
  rows: EtirofRow[];
};

/** "6 950,0" / "28%" / "-77" / "1 309,0" → son (bar va rang uchun) */
export function parseNum(s: string): number {
  const t = String(s ?? "").replace(/[\s %]/g, "").replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Tuman nomini solishtirish kaliti: kirill ↔ lotin, "Наманган ш" = "Namangan shahri",
 * "Чуст тумани" = "Chust tuman". Shahar va tuman farqlanadi (Namangan sh ≠ Namangan tumani).
 */
const CYR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "sh",
  ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya", ў: "o", қ: "q", ғ: "g", ҳ: "h",
};
export function tumanKey(name: unknown) {
  const s = String(name ?? "")
    .toLowerCase()
    .replace(/[а-яёўқғҳ]/g, (ch) => CYR[ch] ?? ch)
    .replace(/[`'ʻ’‘ʼ.\-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*filiali?$/, "");
  const city = /\s(sh|shahri|shahar|shaxri|shaxar)$/.test(s);
  const base = s.replace(/\s(sh|shahri|shahar|shaxri|shaxar|tumani|tuman)$/, "").replace(/\s/g, "");
  return base ? `${base}${city ? "#sh" : ""}` : "";
}

/** Sarlavhalarni solishtirish: katta-kichik harf, ҳ/х, qator ko'chishi va bo'sh joylarga befarq */
export const headerNorm = (s: string) => String(s ?? "").toLowerCase().replace(/ҳ/g, "х").replace(/\s+/g, " ").trim();

export const isTotalName = (name: string) => /вилоят|viloyat/i.test(name);
