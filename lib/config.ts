/**
 * Server-side konfiguratsiya. Barcha ID va URL'lar .env.local faylidan olinadi
 * va brauzerga hech qachon chiqmaydi (NEXT_PUBLIC_ prefiksi yo'q).
 */
export const config = {
  /** "Rollar kesimida tahlil" Google Sheet (xom qatorlar: Ariza raqami · Tuman · Manba · Rol · Kun) */
  deadlineSheetId: process.env.DEADLINE_SHEET_ID || "",
  deadlineSheetName: process.env.DEADLINE_SHEET_NAME || "Arizalar",

  /** "To'lov kutilmoqda" Google Sheet */
  paymentSheetId: process.env.PAYMENT_SHEET_ID || "",
  paymentSheetMain: process.env.PAYMENT_SHEET_MAIN || "TolovKutilmoqda",
  paymentSheetPlan: process.env.PAYMENT_SHEET_PLAN || "TolovReja",

  /** "Kadastr maslahat burchagi" Google Sheet + Apps Script Web App */
  adviceSheetId: process.env.ADVICE_SHEET_ID || "",
  adviceAppsScriptUrl: process.env.ADVICE_APPS_SCRIPT_URL || "",

  /** Saytga kirish (Users/Logs sheet'idagi Apps Script) */
  authAppsScriptUrl: (process.env.AUTH_APPS_SCRIPT_URL || "").trim(),
  authApiSecret: (process.env.AUTH_APPS_SCRIPT_SECRET || "").trim(),
  /** Sayt sessiyasi muddati (soat) */
  authSessionHours: Number(process.env.AUTH_SESSION_HOURS || 12),

  /** Sessiya cookie'sini imzolash uchun maxfiy kalit (kamida 32 belgi) */
  sessionSecret: process.env.SESSION_SECRET || "dev-only-secret-change-me-please-32chars",

  /** Server keshi (ms). "Yangilash" tugmasi keshni chetlab o'tadi. */
  cacheTtlMs: Number(process.env.CACHE_TTL_MS || 30_000),
};

