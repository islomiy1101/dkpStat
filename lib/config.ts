/**
 * Server-side konfiguratsiya. Barcha ID va URL'lar .env.local faylidan olinadi
 * va brauzerga hech qachon chiqmaydi (NEXT_PUBLIC_ prefiksi yo'q).
 */
export const config = {
  /** "Rollar kesimida tahlil" Google Sheet: YakunlanganArizalar va JarayondagiArizalar varaqlari */
  deadlineSheetId: (process.env.DEADLINE_SHEET_ID || "").trim(),
  /** Bu varaqlar katta va faqat yuklashda o'zgaradi — server keshi alohida (ms) */
  deadlineCacheTtlMs: Number(process.env.DEADLINE_CACHE_TTL_MS || 10 * 60_000),

  /** "To'lov kutilmoqda" Google Sheet */
  paymentSheetId: process.env.PAYMENT_SHEET_ID || "",
  paymentSheetMain: process.env.PAYMENT_SHEET_MAIN || "TolovKutilmoqda",
  paymentSheetPlan: process.env.PAYMENT_SHEET_PLAN || "TolovReja",

  /** "E'tirof" — 4 ta alohida Google Sheet (har birida SVOD va xom ro'yxat varag'i) */
  etirofSheets: {
    nomzod: (process.env.ETIROF_NOMZOD_SHEET_ID || "").trim(),
    tahrirlash: (process.env.ETIROF_TAHRIRLASH_SHEET_ID || "").trim(),
    tolov: (process.env.ETIROF_TOLOV_SHEET_ID || "").trim(),
    qaror: (process.env.ETIROF_QAROR_SHEET_ID || "").trim(),
  },
  etirofCacheTtlMs: Number(process.env.ETIROF_CACHE_TTL_MS || 5 * 60_000),

  /** "Xatlov+Faol" (ЎРҚ-937 ШТАБ маълумоти): "ШТАБ маълумоти" va "Кунлик" varaqlari */
  xatlovSheetId: (process.env.XATLOV_FAOL_SHEET_ID || process.env.XATLOV_FAOL || "").trim(),
  xatlovCacheTtlMs: Number(process.env.XATLOV_CACHE_TTL_MS || 5 * 60_000),

  /** "Kadastr maslahat burchagi" Google Sheet + Apps Script Web App */
  adviceSheetId: process.env.ADVICE_SHEET_ID || "",
  adviceAppsScriptUrl: process.env.ADVICE_APPS_SCRIPT_URL || "",

  /** "Filial qabulxonasi" Apps Script Web App (jadval yopiq — o'qish ham, yozish ham shu orqali) */
  receptionAppsScriptUrl: (process.env.RECEPTION_APPS_SCRIPT_URL || "").trim(),
  receptionApiSecret: (process.env.RECEPTION_APPS_SCRIPT_SECRET || "").trim(),

  /** Saytga kirish (Users/Logs sheet'idagi Apps Script) */
  authAppsScriptUrl: (process.env.AUTH_APPS_SCRIPT_URL || "").trim(),
  authApiSecret: (process.env.AUTH_APPS_SCRIPT_SECRET || "").trim(),
  /** Sayt sessiyasi muddati (soat) */
  authSessionHours: Number(process.env.AUTH_SESSION_HOURS || 12),

  /** Sessiya cookie'sini imzolash uchun maxfiy kalit (kamida 32 belgi) */
  sessionSecret: process.env.SESSION_SECRET || "dev-only-secret-change-me-please-32chars",

  /** Faqat "Bazaga yuklash"dagi havolalar uchun (bu jadvallar Apps Script orqali ishlaydi) */
  authSheetId: (process.env.AUTH_SHEET_ID || "").trim(),
  receptionSheetId: (process.env.RECEPTION_SHEET_ID || "").trim(),
  /** RegTest savollari va natijalari (sayt uni Apps Script orqali o'qiydi — bu faqat havola uchun) */
  regtestSheetId: (process.env.REGTEST_SHEET_ID || "").trim(),

  /** Server keshi (ms). "Yangilash" tugmasi keshni chetlab o'tadi. */
  cacheTtlMs: Number(process.env.CACHE_TTL_MS || 30_000),
};

