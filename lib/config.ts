/**
 * Server-side konfiguratsiya. Barcha ID va URL'lar .env.local faylidan olinadi
 * va brauzerga hech qachon chiqmaydi (NEXT_PUBLIC_ prefiksi yo'q).
 */
export const config = {
  /** "Rollar kesimida tahlil" — Django API (masalan: https://xxx.ngrok-free.dev/api) */
  deadlineApiBase: (process.env.DEADLINE_API_BASE || "").replace(/\/+$/, ""),

  /** "To'lov kutilmoqda" Google Sheet */
  paymentSheetId: process.env.PAYMENT_SHEET_ID || "",
  paymentSheetMain: process.env.PAYMENT_SHEET_MAIN || "TolovKutilmoqda",
  paymentSheetPlan: process.env.PAYMENT_SHEET_PLAN || "TolovReja",

  /** "Kadastr maslahat burchagi" Google Sheet + Apps Script Web App */
  adviceSheetId: process.env.ADVICE_SHEET_ID || "",
  adviceAppsScriptUrl: process.env.ADVICE_APPS_SCRIPT_URL || "",

  /** Saytga kirish (Users/Logs sheet'idagi Apps Script) */
  authAppsScriptUrl: process.env.AUTH_APPS_SCRIPT_URL || "",
  authApiSecret: process.env.AUTH_APPS_SCRIPT_SECRET || "",
  /** Sayt sessiyasi muddati (soat) */
  authSessionHours: Number(process.env.AUTH_SESSION_HOURS || 12),

  /** Sessiya cookie'sini imzolash uchun maxfiy kalit (kamida 32 belgi) */
  sessionSecret: process.env.SESSION_SECRET || "dev-only-secret-change-me-please-32chars",

  /** Server keshi (ms). "Yangilash" tugmasi keshni chetlab o'tadi. */
  cacheTtlMs: Number(process.env.CACHE_TTL_MS || 30_000),
};

/** Advice sessiyasi muddati — originaldagi SESSION_TIMEOUT (3 soat) */
export const SESSION_TIMEOUT_MS = 3 * 60 * 60 * 1000;
