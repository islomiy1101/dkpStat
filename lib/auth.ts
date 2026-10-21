import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { config } from "./config";
import { cached } from "./cache";
import { fetchAuthState, type AuthStateRow } from "./auth-server";
import { canSee, firstAllowedHref, parseRole, type AreaId, type Role } from "./roles";

/**
 * Saytga kirish sessiyasi (Users varag'i). Imzolangan httpOnly cookie.
 * Rol va ruxsatlar: lib/roles.ts.
 */
export type { Role };
export type AppUser = {
  login: string;
  fullName: string;
  branch: string;
  department: string;
  role: Role;
  loginTime: number;
  /** Parol talabga javob bermaydi yoki superadmin tiklagan — yangi parol o'rnatmaguncha faqat /account/password ochiq */
  mustChange?: boolean;
};

/** Majburiy parol almashtirish sahifasi */
export const PASSWORD_PAGE = "/account/password";

export const AUTH_COOKIE = "dkp_auth";
const ttlMs = () => config.authSessionHours * 60 * 60 * 1000;

const sign = (payload: string) =>
  crypto.createHmac("sha256", "auth:" + config.sessionSecret).update(payload).digest("base64url");

export function encodeUser(u: AppUser) {
  const payload = Buffer.from(JSON.stringify(u)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeUser(raw: string | undefined): AppUser | null {
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const u = JSON.parse(Buffer.from(payload, "base64url").toString()) as AppUser;
    if (Date.now() - u.loginTime >= ttlMs()) return null;
    return { ...u, role: parseRole(u.role) }; // eski cookie'dagi "admin"/"user" ham o'qiladi
  } catch {
    return null;
  }
}

/** Bloklanganlar / sessiyasi bekor qilinganlar — har instansiyada daqiqasiga ko'pi bilan bir marta o'qiladi */
const STATE_TTL = 60_000;
export const AUTH_STATE_KEY = "auth:state";

async function authState(): Promise<AuthStateRow[] | null> {
  try {
    // stale: muddat tugaganda ham sahifa Apps Script javobini kutmaydi (bloklash/tiklash invalidate qiladi)
    return await cached(AUTH_STATE_KEY, STATE_TTL, fetchAuthState, { stale: true });
  } catch (e) {
    // Apps Script vaqtincha javob bermasa — butun sayt yopilib qolmasin (cookie imzosi baribir tekshirilgan)
    console.error("[auth] sessiya holatini tekshirib bo'lmadi:", (e as Error).message);
    return null;
  }
}

/** Sessiya hali amaldami: foydalanuvchi bloklanmagan va sessiyalari keyinroq bekor qilinmagan */
async function isSessionValid(u: AppUser) {
  const st = (await authState())?.find((x) => x.login === u.login.toLowerCase());
  if (!st) return true;
  if (st.until === null || st.until > Date.now()) return false;
  return !(st.revokedAt > u.loginTime);
}

export async function getUser() {
  const jar = await cookies();
  const u = decodeUser(jar.get(AUTH_COOKIE)?.value);
  return u && (await isSessionValid(u)) ? u : null;
}

export async function setUser(u: AppUser, secure: boolean) {
  const jar = await cookies();
  jar.set(AUTH_COOKIE, encodeUser(u), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: Math.floor(ttlMs() / 1000),
  });
}

export async function clearUser() {
  const jar = await cookies();
  jar.delete(AUTH_COOKIE);
}

/** API route'lar uchun: sessiya bo'lmasa 401 (frontend /login ga yo'naltiradi) */
export function authError() {
  return Response.json({ error: "auth", message: "Sessiya tugagan. Qaytadan kiring." }, { status: 401 });
}
export function forbidden() {
  return Response.json({ error: "forbidden", message: "Ruxsat yo'q" }, { status: 403 });
}
export function mustChangeError() {
  return Response.json({ error: "must_change", message: "Avval yangi parol o'rnating." }, { status: 403 });
}

/**
 * API route'lar uchun: foydalanuvchi shu bo'limga kira oladimi.
 * Natija Response bo'lsa — uni qaytarish kerak (401 yoki 403).
 */
export async function requireArea(id: AreaId): Promise<AppUser | Response> {
  const u = await getUser();
  if (!u) return authError();
  if (u.mustChange) return mustChangeError();
  if (!canSee(u.role, id)) return forbidden();
  return u;
}

/** Faqat superadmin (foydalanuvchilar va parollarni boshqarish) */
export async function requireSuperadmin(): Promise<AppUser | Response> {
  const u = await getUser();
  if (!u) return authError();
  if (u.mustChange) return mustChangeError();
  if (u.role !== "superadmin") return forbidden();
  return u;
}

/** Sahifalar uchun: sessiya yo'q bo'lsa /login, ruxsat yo'q bo'lsa birinchi ruxsat etilgan bo'limga */
export async function guardPage(id: AreaId) {
  const u = await getUser();
  if (!u) redirect("/login");
  if (u.mustChange) redirect(PASSWORD_PAGE);
  if (!canSee(u.role, id)) redirect(firstAllowedHref(u.role));
  return u;
}
