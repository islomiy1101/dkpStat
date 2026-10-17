import crypto from "node:crypto";
import { cookies } from "next/headers";
import { config, SESSION_TIMEOUT_MS } from "./config";

/**
 * Advice bo'limi sessiyasi — imzolangan httpOnly cookie.
 * Originalda tuman/fio localStorage'da edi va har kim o'zgartira olardi;
 * endi server imzoni tekshiradi.
 */
export type AdviceSession = { tuman: string; fio: string; loginTime: number };

const COOKIE = "dkp_advice_session";

function sign(payload: string) {
  return crypto.createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
}

export function encodeSession(s: AdviceSession) {
  const payload = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(raw: string | undefined): AdviceSession | null {
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString()) as AdviceSession;
    if (Date.now() - s.loginTime >= SESSION_TIMEOUT_MS) return null;
    return s;
  } catch {
    return null;
  }
}

export async function getSession() {
  const jar = await cookies();
  return decodeSession(jar.get(COOKIE)?.value);
}

/**
 * secure: HTTPS orqali ochilganda true. Ichki tarmoqda HTTP orqali ishlatilsa
 * Secure cookie brauzer tomonidan saqlanmaydi — shuning uchun protokolga qarab aniqlanadi.
 */
export function isHttps(req: Request) {
  const proto = req.headers.get("x-forwarded-proto") || new URL(req.url).protocol.replace(":", "");
  return proto.split(",")[0].trim() === "https";
}

export async function setSession(s: AdviceSession, secure: boolean) {
  const jar = await cookies();
  jar.set(COOKIE, encodeSession(s), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: Math.floor(SESSION_TIMEOUT_MS / 1000),
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export function normalizeName(str: unknown) {
  if (!str) return "";
  return String(str).toLowerCase().replace(/[`'ʻ’‘\s]/g, "").trim();
}

export function isSuperAdminTuman(tuman: string) {
  const n = normalizeName(tuman);
  return n === "boshqarma" || n === "superadmin";
}
