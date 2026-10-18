import { DEADLINE_HEADERS } from "@/features/deadline/aggregate";

/**
 * "Bazaga yuklash" — har bir bo'lim uchun alohida .xlsx fayl va u yoziladigan Google Sheets varaqlari.
 * Klient (ko'rib chiqish) va server (tekshirish + yozish) bir xil qoidalardan foydalanadi.
 * Sheet ID'lar faqat serverda (lib/config.ts) — bu yerda faqat varaq nomlari.
 */
export type UploadSection = "payment" | "deadline";

export type SheetRule = {
  /** Google Sheets'dagi varaq nomi */
  target: string;
  /** .xlsx ichidagi varaq: nomi bo'yicha; topilmasa va `firstSheetFallback` bo'lsa — birinchi varaq */
  source: string;
  firstSheetFallback?: boolean;
  /** 1-qatorda bo'lishi shart bo'lgan sarlavhalar (tartibi muhim emas) */
  requiredHeaders?: readonly string[];
  /** Kamida nechta ustun bo'lishi kerak (sarlavhasiz varaqlar uchun) */
  minCols?: number;
};

export type UploadTarget = { id: UploadSection; title: string; icon: string; hint: string; sheets: SheetRule[] };

export const UPLOAD_TARGETS: Record<UploadSection, UploadTarget> = {
  payment: {
    id: "payment",
    title: "To'lov va tushumlar",
    icon: "fa-solid fa-money-bill-wave",
    hint: "Faylda ikkita varaq bo'lishi kerak: TolovKutilmoqda (B–N ustunlar) va TolovReja (B–C ustunlar).",
    sheets: [
      { target: "TolovKutilmoqda", source: "TolovKutilmoqda", minCols: 14 },
      { target: "TolovReja", source: "TolovReja", minCols: 3 },
    ],
  },
  deadline: {
    id: "deadline",
    title: "Rollar kesimida tahlil",
    icon: "fa-solid fa-chart-line",
    hint: `1-qatorda sarlavhalar: ${DEADLINE_HEADERS.join(" · ")}. Varaq nomi "Arizalar" yoki birinchi varaq olinadi.`,
    sheets: [{ target: "Arizalar", source: "Arizalar", firstSheetFallback: true, requiredHeaders: DEADLINE_HEADERS }],
  },
};

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
  return target.sheets.map((rule) => {
    let name = wb.SheetNames.find((n) => norm(n) === norm(rule.source));
    if (!name && rule.firstSheetFallback) name = wb.SheetNames[0];
    if (!name) throw new Error(`Faylda "${rule.source}" varag'i topilmadi. Mavjud varaqlar: ${wb.SheetNames.join(", ")}`);

    const raw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: "", blankrows: false });
    const values: CellValue[][] = raw.map((row) =>
      row.map((v) => {
        if (v instanceof Date) return { $date: localIso(v) };
        if (typeof v === "number" || typeof v === "boolean") return v;
        return v == null ? "" : String(v);
      })
    );
    if (values.length < 2) throw new Error(`"${name}" varag'i bo'sh (kamida sarlavha va bitta qator kerak).`);

    const width = Math.max(...values.map((r) => r.length));
    if (rule.minCols && width < rule.minCols) {
      throw new Error(`"${name}" varag'ida kamida ${rule.minCols} ta ustun bo'lishi kerak (hozir ${width} ta).`);
    }
    if (rule.requiredHeaders) {
      const header = values[0].map(norm);
      const missing = rule.requiredHeaders.filter((h) => !header.includes(norm(h)));
      if (missing.length) throw new Error(`"${name}" varag'ida ustun(lar) yetishmayapti: ${missing.join(", ")}`);
    }
    // Apps Script setValues to'rtburchak massiv talab qiladi
    for (const r of values) while (r.length < width) r.push("");
    return { rule, sourceName: name, values };
  });
}
