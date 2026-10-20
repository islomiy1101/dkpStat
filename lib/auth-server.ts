import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { MOCK } from "./mock";
import { parseRole, type Role } from "./roles";
import { isStrongPassword, passwordProblem } from "./password-policy";

export type LoginUser = { login: string; fullName: string; branch: string; department: string; role: Role };
/** "Foydalanuvchilar" sahifasi uchun (parolsiz) */
export type UserRow = LoginUser & { mustChange: boolean; changedAt: string };
export type LogRow = {
  branch: string; fullName: string; department: string; login: string;
  dateTime: string; ip: string; location: string; accuracy: string;
};

type ScriptRes<T> = { success: boolean; message?: string } & T;

async function callAuthScript<T>(payload: Record<string, unknown>): Promise<ScriptRes<T>> {
  if (!config.authAppsScriptUrl || !config.authApiSecret) {
    return { success: false, message: "AUTH_APPS_SCRIPT_URL / AUTH_APPS_SCRIPT_SECRET sozlanmagan" } as ScriptRes<T>;
  }
  const res = await fetch(config.authAppsScriptUrl, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...payload, secret: config.authApiSecret }),
    cache: "no-store",
  });
  const text = await res.text();
  try {
    const json = JSON.parse(text) as ScriptRes<T>;
    // Skript bu amalni bilmaydi — Apps Script'ga Code.gs ning eski versiyasi deploy qilingan
    if (!json.success && json.message === "Noma'lum amal") {
      console.error(`[auth] Apps Script "${String(payload.action)}" amalini bilmaydi — eski versiya deploy qilingan`);
      json.message =
        "Apps Script eski versiyada ishlayapti. apps-script/auth/Code.gs ning oxirgi versiyasini qo'yib, " +
        "Deploy → Manage deployments → Edit → New version qiling.";
    }
    return json;
  } catch {
    // JSON o'rniga HTML keldi — odatda deploy "Who has access: Anyone" emas yoki URL /exec emas
    console.error("[auth] Apps Script JSON qaytarmadi:", res.status, text.slice(0, 300));
    return { success: false, message: `Apps Script javobi noto'g'ri (HTTP ${res.status}). Deploy sozlamasini tekshiring.` } as ScriptRes<T>;
  }
}

/* ---------- MOCK (MOCK_DATA=1) ---------- */
type MockUser = LoginUser & { password: string };
const mockLogs: LogRow[] = [];
let mockLoaded = false;
/** Demo: sayt orqali o'zgartirilgan parollar xotirada (mock/auth_users.json o'zgartirilmaydi) */
const mockPw = new Map<string, { password: string; mustChange: boolean; changedAt: string }>();
async function mockUsers(): Promise<MockUser[]> {
  const list: MockUser[] = JSON.parse(await fs.readFile(path.join(process.cwd(), "mock", "auth_users.json"), "utf8"));
  return list.map((u) => ({ ...u, password: mockPw.get(u.login.toLowerCase())?.password ?? u.password }));
}
const mockMustChange = (login: string, password: string) =>
  mockPw.get(login.toLowerCase())?.mustChange ?? !isStrongPassword(password, login);
async function mockLogList() {
  if (!mockLoaded) {
    mockLogs.push(...JSON.parse(await fs.readFile(path.join(process.cwd(), "mock", "auth_logs.json"), "utf8")));
    mockLoaded = true;
  }
  return mockLogs;
}
const pad = (n: number) => String(n).padStart(2, "0");
const nowStr = () => {
  const d = new Date(Date.now() + 5 * 3600_000); // Asia/Tashkent
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};

/* ---------- public ---------- */
export async function loginWithSheet(login: string, password: string, ip: string, location: string, accuracy: number) {
  if (MOCK) {
    const u = (await mockUsers()).find((x) => x.login.toLowerCase() === login.trim().toLowerCase() && x.password === password.trim());
    if (!u) return { success: false as const, message: "Login yoki parol noto'g'ri!" };
    const { password: _p, ...user } = u;
    void _p;
    const { role: _r, ...who } = user;
    void _r;
    (await mockLogList()).push({ ...who, dateTime: nowStr(), ip, location, accuracy: String(accuracy) });
    return { success: true as const, user: { ...user, role: parseRole(user.role) }, mustChange: mockMustChange(u.login, password.trim()) };
  }
  const r = await callAuthScript<{ user?: LoginUser; mustChange?: boolean }>({ action: "login", login, password, ip, location, accuracy });
  if (!r.success || !r.user) {
    if (r.message && r.message.startsWith("Forbidden")) console.error("[auth]", r.message);
    return { success: false as const, message: r.message || "Login yoki parol noto'g'ri!" };
  }
  if (r.user.role === undefined) {
    console.error("[auth] Apps Script javobida role yo'q — eski deploy versiyasi? (Manage deployments → New version)");
  }
  // Eski Apps Script (mustChange qaytarmaydi) — parolning o'zi talabga javob bermasa ham almashtirish so'raladi
  const mustChange = r.mustChange ?? !isStrongPassword(password, login);
  return { success: true as const, user: { ...r.user, role: parseRole(r.user.role) }, mustChange };
}

export async function fetchLogs(limit = 5000): Promise<LogRow[]> {
  if (MOCK) return [...(await mockLogList())].reverse().slice(0, limit);
  const r = await callAuthScript<{ logs?: LogRow[] }>({ action: "getLogs", limit });
  if (!r.success) throw new Error(r.message || "Loglarni olishda xatolik");
  return r.logs || [];
}

/**
 * Bazaga yuklash: varaqlarni butunlay almashtirish (Apps Script → importSheets).
 * Skript avval zaxira nusxa oladi; birorta varaq yozilmasa — hammasi zaxiradan tiklanadi.
 */
export async function importSheets(
  spreadsheetId: string,
  sheets: { name: string; values: unknown[][] }[],
  meta: { section: string; login: string; fullName: string; fileName: string }
): Promise<{ success: boolean; message?: string; rows?: Record<string, number> }> {
  if (MOCK) {
    return { success: true, message: "Demo: Sheets'ga yozilmadi", rows: Object.fromEntries(sheets.map((s) => [s.name, s.values.length - 1])) };
  }
  if (!spreadsheetId) return { success: false, message: `${meta.section} uchun Sheet ID sozlanmagan` };
  return callAuthScript<{ rows?: Record<string, number> }>({ action: "importSheets", spreadsheetId, sheets, meta });
}

export type ImportChunk = {
  startRow: number;
  values: unknown[][];
  reset: boolean;
  totalRows: number;
  width: number;
  last: boolean;
  asText: boolean;
};

/** Katta varaqni qismlab yozish (Apps Script → importChunk); zaxirasiz — xato bo'lsa varaq qisman yozilgan bo'ladi */
export async function importChunk(
  spreadsheetId: string,
  name: string,
  chunk: ImportChunk,
  meta: { section: string; login: string; fullName: string; fileName: string }
): Promise<{ success: boolean; message?: string }> {
  if (MOCK) return { success: true };
  if (!spreadsheetId) return { success: false, message: `${meta.section} uchun Sheet ID sozlanmagan` };
  return callAuthScript({ action: "importChunk", spreadsheetId, name, chunk, meta });
}

/**
 * Users/Logs jadvalining ID'si — Apps Script shu jadvalga bog'langan, shuning uchun .env'da yo'q bo'lishi mumkin.
 * AUTH_SHEET_ID berilmagan bo'lsa "ping" javobidan olinadi (eski Code.gs'da bo'lmaydi → "").
 */
export async function authSpreadsheetId(): Promise<string> {
  if (config.authSheetId) return config.authSheetId;
  if (MOCK) return "";
  // Faqat topilgan ID saqlanadi — Apps Script yangilangach, keyingi ochilishdayoq havola paydo bo'ladi
  if (!authSheetIdCache) {
    const r = await callAuthScript<{ spreadsheetId?: string }>({ action: "ping" }).catch(() => null);
    authSheetIdCache = String(r?.spreadsheetId || "");
  }
  return authSheetIdCache;
}
let authSheetIdCache = "";

/* ---------- RegTest (savollar banki va natijalar — REGTEST_SHEET_ID Code.gs'da) ---------- */

export async function regtestQuestionRows(): Promise<string[][]> {
  const r = await callAuthScript<{ rows?: string[][] }>({ action: "regtestQuestions" });
  if (!r.success || !r.rows) throw new Error(r.message || "Savollarni o'qib bo'lmadi");
  return r.rows;
}

/** Test boshlanishi: 2 soatlik cheklov tekshiriladi va "Jarayonda" qatori yoziladi */
export async function regtestStartRow(row: Record<string, string | number>) {
  return callAuthScript<{ limited?: boolean; nextAt?: string }>({ action: "regtestStart", row });
}

export async function regtestSaveResult(row: Record<string, string | number>) {
  return callAuthScript({ action: "regtestSave", row });
}

/** "Натижалар" varag'i (dashboard uchun) */
export async function regtestResultRows(): Promise<string[][]> {
  const r = await callAuthScript<{ rows?: string[][] }>({ action: "regtestResults" });
  if (!r.success || !r.rows) throw new Error(r.message || "Natijalarni o'qib bo'lmadi");
  return r.rows;
}

/** Parolni qayta tekshirish (Logs'ga yozilmaydi); MOCK — mock/auth_users.json */
export async function verifyPassword(login: string, password: string): Promise<{ success: boolean; message?: string }> {
  if (MOCK) {
    const u = (await mockUsers()).find((x) => x.login.toLowerCase() === login.toLowerCase());
    return u && u.password === password ? { success: true } : { success: false, message: "Parol noto'g'ri" };
  }
  return callAuthScript({ action: "verifyPassword", login, password });
}

/* ---------- Parollar ---------- */

type PwResult = { success: boolean; message?: string; wrongCurrent?: boolean };

/** Foydalanuvchi o'z parolini almashtiradi (joriy parol bilan). Talablar serverda ham, Apps Script'da ham tekshiriladi */
export async function changePassword(login: string, current: string, next: string): Promise<PwResult> {
  const problem = passwordProblem(next, login);
  if (problem) return { success: false, message: problem };
  if (next === current) return { success: false, message: "Yangi parol joriy paroldan farq qilishi kerak" };
  if (MOCK) {
    const u = (await mockUsers()).find((x) => x.login.toLowerCase() === login.toLowerCase());
    if (!u || u.password !== current) return { success: false, wrongCurrent: true, message: "Joriy parol noto'g'ri" };
    mockPw.set(login.toLowerCase(), { password: next, mustChange: false, changedAt: nowStr() });
    return { success: true };
  }
  return callAuthScript({ action: "changePassword", login, current, next });
}

/** Superadmin: vaqtinchalik parol (keyingi kirishda almashtirish shart). Apps Script superadmin'ni o'zi qayta tekshiradi */
export async function resetPassword(admin: string, login: string): Promise<PwResult & { password?: string }> {
  if (MOCK) {
    const u = (await mockUsers()).find((x) => x.login.toLowerCase() === login.toLowerCase());
    if (!u) return { success: false, message: "Foydalanuvchi topilmadi" };
    const temp = "Tmp" + Math.random().toString(36).slice(2, 7) + "#7";
    mockPw.set(login.toLowerCase(), { password: temp, mustChange: true, changedAt: nowStr() });
    return { success: true, password: temp };
  }
  return callAuthScript<{ password?: string }>({ action: "resetPassword", admin, login });
}

export async function listUsers(admin: string): Promise<UserRow[]> {
  if (MOCK) {
    return (await mockUsers()).map(({ password, ...u }) => ({
      ...u,
      role: parseRole(u.role),
      mustChange: mockMustChange(u.login, password),
      changedAt: mockPw.get(u.login.toLowerCase())?.changedAt || "",
    }));
  }
  const r = await callAuthScript<{ users?: (Omit<UserRow, "role"> & { role: string })[] }>({ action: "listUsers", admin });
  if (!r.success || !r.users) throw new Error(r.message || "Foydalanuvchilarni o'qib bo'lmadi");
  return r.users.map((u) => ({ ...u, role: parseRole(u.role) }));
}
