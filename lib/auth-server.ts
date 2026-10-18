import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { MOCK } from "./mock";
import { parseRole, type Role } from "./roles";

export type LoginUser = { login: string; fullName: string; branch: string; department: string; role: Role };
export type LogRow = {
  branch: string; fullName: string; department: string; login: string;
  dateTime: string; ip: string; location: string;
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
    return JSON.parse(text) as ScriptRes<T>;
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
async function mockUsers(): Promise<MockUser[]> {
  return JSON.parse(await fs.readFile(path.join(process.cwd(), "mock", "auth_users.json"), "utf8"));
}
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
export async function loginWithSheet(login: string, password: string, ip: string, location: string) {
  if (MOCK) {
    const u = (await mockUsers()).find((x) => x.login.toLowerCase() === login.trim().toLowerCase() && x.password === password.trim());
    if (!u) return { success: false as const, message: "Login yoki parol noto'g'ri!" };
    const { password: _p, ...user } = u;
    void _p;
    const { role: _r, ...who } = user;
    void _r;
    (await mockLogList()).push({ ...who, dateTime: nowStr(), ip, location });
    return { success: true as const, user: { ...user, role: parseRole(user.role) } };
  }
  const r = await callAuthScript<{ user?: LoginUser }>({ action: "login", login, password, ip, location });
  if (!r.success || !r.user) {
    if (r.message && r.message.startsWith("Forbidden")) console.error("[auth]", r.message);
    return { success: false as const, message: r.message || "Login yoki parol noto'g'ri!" };
  }
  return { success: true as const, user: { ...r.user, role: parseRole(r.user.role) } };
}

export async function fetchLogs(limit = 5000): Promise<LogRow[]> {
  if (MOCK) return [...(await mockLogList())].reverse().slice(0, limit);
  const r = await callAuthScript<{ logs?: LogRow[] }>({ action: "getLogs", limit });
  if (!r.success) throw new Error(r.message || "Loglarni olishda xatolik");
  return r.logs || [];
}
