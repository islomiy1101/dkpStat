/**
 * Umumiy yordamchilar. Advice bo'limining alohida sessiyasi olib tashlandi —
 * endi u sayt sessiyasidan foydalanadi (lib/advice-server.ts → adviceSessionFor).
 */

/**
 * secure: HTTPS orqali ochilganda true. Ichki tarmoqda HTTP orqali ishlatilsa
 * Secure cookie brauzer tomonidan saqlanmaydi — shuning uchun protokolga qarab aniqlanadi.
 */
export function isHttps(req: Request) {
  const proto = req.headers.get("x-forwarded-proto") || new URL(req.url).protocol.replace(":", "");
  return proto.split(",")[0].trim() === "https";
}

export function normalizeName(str: unknown) {
  if (!str) return "";
  return String(str).toLowerCase().replace(/[`'ʻ’‘\s]/g, "").trim();
}

export function isSuperAdminTuman(tuman: string) {
  const n = normalizeName(tuman);
  return n === "boshqarma" || n === "superadmin";
}
