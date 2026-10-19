import { DEADLINE_BASE_HEADERS, DEADLINE_HEADER_ROWS, DEADLINE_LISTS, DEADLINE_LIST_IDS, colLetter, locateColumns } from "@/features/deadline/source";

/**
 * "Bazaga yuklash" — har bir bo'lim uchun alohida .xlsx fayl va u yoziladigan Google Sheets varaqlari.
 * Klient (ko'rib chiqish) va server (tekshirish + yozish) bir xil qoidalardan foydalanadi.
 * Sheet ID'lar faqat serverda (lib/config.ts) — bu yerda faqat varaq nomlari.
 */
export type UploadSection = "payment" | "deadline";

export type SheetRule = {
  /** Google Sheets'dagi varaq nomi */
  target: string;
  /** .xlsx ichidagi varaq (nomi bo'yicha, katta-kichik harf farqsiz) */
  source: string;
  /** Nomi mos varaq bo'lmasa va faylda bitta varaq bo'lsa — o'sha olinadi */
  singleSheetFallback?: boolean;
  /** Kamida nechta ustun bo'lishi kerak (sarlavhasiz varaqlar uchun) */
  minCols?: number;
  /** Shundan o'ngdagi ustunlar yozilmaydi */
  maxCols?: number;
  /** Tekshiruvdan oldin qatorlarni moslashtirish (masalan, ortiqcha sarlavha qatorini olib tashlash) */
  transform?: (values: CellValue[][]) => CellValue[][];
  /** Sarlavha qatorlari soni (standart 1) */
  headerRows?: number;
  /** Qo'shimcha tekshiruv (xato bo'lsa — Error); serverda ham qayta chaqiriladi */
  validate?: (values: CellValue[][]) => void;
  /** Faylda bo'lmasa ham bo'ladi (kamida bitta varaq bo'lishi shart) */
  optional?: boolean;
};

export type UploadTarget = {
  id: UploadSection;
  title: string;
  icon: string;
  hint: string;
  sheets: SheetRule[];
  /**
   * Katta fayl: brauzer varaqlarni qismlarga bo'lib JSON bilan yuboradi (server so'rovi hajmi cheklangan),
   * Apps Script har bir qismni o'rniga yozadi. Zaxira nusxa olinmaydi — Google Sheets'ning 10 mln katak chegarasi.
   */
  chunked?: boolean;
  /** Barcha kataklar matn sifatida yoziladi (gviz ustun turini adashtirib, raqamli ID'larni yo'qotmasligi uchun) */
  asText?: boolean;
};

const normHeader = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/[`'ʻ’‘ʼ]/g, "'").replace(/\s+/g, " ");

/**
 * TolovBaza: A–AZ (52 ustun). TolovKutilmoqda varag'i undan formulalar bilan ustun joylashuvi bo'yicha olinadi —
 * shuning uchun sarlavhalar aynan shu harflarda turishi shart.
 */
const TOLOV_BAZA_COLS = 52;
const TOLOV_BAZA_HEADERS: Record<number, string> = {
  1: "Tuman",
  6: "Tranzaksiya raqami",
  15: "Ariza raqami",
  17: "Buyurtmachi",
  22: "Ariza manbasi",
  25: "To'lov holati",
  45: "Ijrochi muhandis",
};

/** Rollar kesimidagi katta fayl (2 qatorli sarlavha) ham qabul qilinadi: 2-qatordagi rol nomlari tashlanadi */
function dropRoleHeaderRow(values: CellValue[][]) {
  const r2 = values[1];
  const isHeader = r2 && !String(r2[1] ?? "").trim() && !String(r2[6] ?? "").trim();
  return isHeader ? [values[0], ...values.slice(2)] : values;
}

function validateTolovBaza(values: CellValue[][]) {
  const head = values[0] || [];
  for (const [i, name] of Object.entries(TOLOV_BAZA_HEADERS)) {
    const got = head[Number(i)];
    if (normHeader(got) !== normHeader(name)) {
      throw new Error(`${colLetter(Number(i))} ustunida "${name}" bo'lishi kerak, faylda: "${String(got ?? "")}". Ustunlar tartibi TolovBaza bilan bir xil bo'lsin.`);
    }
  }
}

export const UPLOAD_TARGETS: Record<UploadSection, UploadTarget> = {
  payment: {
    id: "payment",
    title: "To'lov va tushumlar",
    icon: "fa-solid fa-money-bill-wave",
    hint:
      "Varaq: TolovBaza (yoki fayldagi yagona varaq). A–AZ ustunlar, 1-qator sarlavha, ma'lumot 2-qatordan. " +
      "TolovReja yuklanmaydi — Google Sheets'da qo'lda kiritiladi.",
    sheets: [
      {
        target: "TolovBaza",
        source: "TolovBaza",
        singleSheetFallback: true,
        minCols: TOLOV_BAZA_COLS,
        maxCols: TOLOV_BAZA_COLS,
        transform: dropRoleHeaderRow,
        validate: validateTolovBaza,
      },
    ],
  },
  deadline: {
    id: "deadline",
    title: "Rollar kesimida tahlil",
    icon: "fa-solid fa-chart-line",
    hint:
      `Varaqlar: ${DEADLINE_LIST_IDS.map((id) => DEADLINE_LISTS[id].sheet).join(" va ")} (bittasi yoki ikkalasi). ` +
      `1–2-qatorlar sarlavha (1-qatorda ${DEADLINE_BASE_HEADERS.join(" · ")} va rol guruhlari, 2-qatorda rollar), ma'lumot 3-qatordan.`,
    sheets: DEADLINE_LIST_IDS.map((id) => ({
      target: DEADLINE_LISTS[id].sheet,
      source: DEADLINE_LISTS[id].sheet,
      optional: true,
      headerRows: DEADLINE_HEADER_ROWS,
      validate: (values: CellValue[][]) => void locateColumns(values[0] || [], values[1] || []),
    })),
    chunked: true,
    asText: true,
  },
};

/** Qismlab yuklash: bitta so'rovdagi qatorlar (~80 ustun × 2000 qator ≈ 2–3 MB JSON) va server chegarasi */
export const UPLOAD_CHUNK_ROWS = 2000;
export const MAX_CHUNK_ROWS = 5000;

export const isUploadSection = (s: string): s is UploadSection => s in UPLOAD_TARGETS;

/** Kataklar: son, matn yoki sana ({ $date: "YYYY-MM-DDTHH:mm:ss" } — Apps Script Date'ga aylantiradi) */
export type CellValue = string | number | boolean | { $date: string };
export type ParsedSheet = { rule: SheetRule; sourceName: string; values: CellValue[][] };

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
const pad = (n: number) => String(n).padStart(2, "0");
const localIso = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/**
 * xlsx kutubxonasining workbook'ini qoidalar bo'yicha tekshiradi va varaqlarni 2D massivga aylantiradi.
 * Xato bo'lsa — foydalanuvchiga ko'rsatiladigan matn bilan Error.
 * `XLSX` — dinamik import qilingan modul (klientda ham, serverda ham).
 */
export function parseWorkbook(XLSX: typeof import("xlsx"), wb: import("xlsx").WorkBook, target: UploadTarget): ParsedSheet[] {
  const found = target.sheets.flatMap((rule) => {
    let name = wb.SheetNames.find((n) => norm(n) === norm(rule.source));
    if (!name && rule.singleSheetFallback && wb.SheetNames.length === 1) name = wb.SheetNames[0];
    if (!name && rule.optional) return [];
    if (!name) throw new Error(`Faylda "${rule.source}" varag'i topilmadi. Mavjud varaqlar: ${wb.SheetNames.join(", ")}`);
    return [{ rule, name }];
  });
  if (!found.length) {
    const want = target.sheets.map((r) => r.source).join(", ");
    throw new Error(`Faylda kerakli varaq topilmadi (${want}). Mavjud varaqlar: ${wb.SheetNames.join(", ")}`);
  }
  return found.map(({ rule, name }) => {
    const raw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: "", blankrows: false });
    let values: CellValue[][] = raw.map((row) =>
      (rule.maxCols ? row.slice(0, rule.maxCols) : row).map((v) => {
        if (v instanceof Date) return target.asText ? localIso(v).replace("T", " ").replace(" 00:00:00", "") : { $date: localIso(v) };
        if (typeof v === "number" || typeof v === "boolean") return target.asText ? String(v) : v;
        return v == null ? "" : String(v);
      })
    );
    if (rule.transform) values = rule.transform(values);
    const headerRows = rule.headerRows ?? 1;
    if (values.length <= headerRows) throw new Error(`"${name}" varag'i bo'sh (kamida sarlavha va bitta qator kerak).`);

    // Katta varaqlarda Math.max(...arr) stekni to'ldiradi
    const width = values.reduce((w, r) => Math.max(w, r.length), 0);
    if (rule.minCols && width < rule.minCols) {
      throw new Error(`"${name}" varag'ida kamida ${rule.minCols} ta ustun bo'lishi kerak (hozir ${width} ta).`);
    }
    if (rule.validate) {
      try {
        rule.validate(values);
      } catch (e) {
        throw new Error(`"${name}" varag'i: ${(e as Error).message}`);
      }
    }
    // Apps Script setValues to'rtburchak massiv talab qiladi
    for (const r of values) while (r.length < width) r.push("");
    return { rule, sourceName: name, values };
  });
}
