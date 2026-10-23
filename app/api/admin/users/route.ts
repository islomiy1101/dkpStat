import { NextResponse } from "next/server";
import { AUTH_STATE_KEY, requireSuperadmin } from "@/lib/auth";
import { createUser, listUsers, updateUser, type UserChanges } from "@/lib/auth-server";
import { invalidate } from "@/lib/cache";
import { ADDABLE_AREAS, ROLES, normalizeAreas, roleAreas, type AreaOverride, type Role } from "@/lib/roles";

/**
 * Faqat superadmin:
 *  GET   /api/admin/users — foydalanuvchilar ro'yxati (parolsiz)
 *  POST  /api/admin/users { fullName, branch, department, login, role, areas } — yangi xodim; vaqtinchalik parol bir marta qaytariladi
 *  PATCH /api/admin/users { login, fullName, branch, department, role, areas } — tahrirlash (login o'zgarmaydi);
 *        rol, filial yoki bo'limlar o'zgarsa xodimning sessiyalari yopiladi (Apps Script → SessionsRevokedAt)
 *  areas — rolidan tashqari bo'limlar: [{ id, op: "+" | "-", scope?: "branch" | "region" }] (lib/roles.ts)
 */
export const dynamic = "force-dynamic";

const bad = (message: string) => NextResponse.json({ success: false, message }, { status: 400 });

/** Yaratish va tahrirlash uchun umumiy: maydonlar yoki xato matni */
function validateUserFields(b: Record<string, unknown> | null): UserChanges | string {
  const str = (k: string) => String(b?.[k] ?? "").trim().replace(/\s+/g, " ");
  const f = { fullName: str("fullName"), branch: str("branch"), department: str("department"), role: str("role") as Role };
  if (!f.fullName || f.fullName.length > 120) return "F.I.O.ni kiriting";
  if (!f.branch || f.branch.length > 120) return "Filialni kiriting";
  if (f.department.length > 120) return "Bo'lim nomi juda uzun";
  if (!ROLES.includes(f.role)) return "Rolni tanlang";
  const areas = parseAreaInput(b?.areas);
  if (!areas) return "Bo'limlar ro'yxati noto'g'ri";
  const clean = normalizeAreas(f.role, areas);
  const removed = clean.filter((o) => o.op === "-").length;
  const added = clean.length - removed;
  if (roleAreas(f.role).length - removed + added === 0) return "Kamida bitta bo'lim qolishi kerak";
  return { ...f, areas: clean };
}

/** Klientdan kelgan bo'limlar: faqat ruxsat etilgan bo'limlar va to'g'ri qiymatlar (aks holda null) */
function parseAreaInput(v: unknown): AreaOverride[] | null {
  if (v == null) return [];
  if (!Array.isArray(v) || v.length > ADDABLE_AREAS.length) return null;
  const out: AreaOverride[] = [];
  for (const x of v as Record<string, unknown>[]) {
    const id = String(x?.id ?? "");
    const op = x?.op;
    const scope = x?.scope;
    if (!(ADDABLE_AREAS as readonly string[]).includes(id) || (op !== "+" && op !== "-")) return null;
    if (scope != null && scope !== "branch" && scope !== "region") return null;
    out.push({ id: id as AreaOverride["id"], op, scope: scope ?? undefined });
  }
  return out;
}

export async function GET() {
  const u = await requireSuperadmin();
  if (u instanceof Response) return u;
  try {
    const users = await listUsers(u.login);
    return NextResponse.json({ success: true, users }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ success: false, message: (e as Error).message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const u = await requireSuperadmin();
  if (u instanceof Response) return u;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const f = validateUserFields(b);
  if (typeof f === "string") return bad(f);
  const login = String(b?.login ?? "").trim();
  if (!/^\S{3,64}$/.test(login)) return bad("Login 3–64 belgidan iborat, probelsiz bo'lishi kerak");
  try {
    const r = await createUser(u.login, { ...f, login });
    if (!r.success || !r.password) return NextResponse.json({ success: false, message: r.message || "Foydalanuvchini qo'shib bo'lmadi" }, { status: r.exists ? 409 : 400 });
    // warning — xodim qo'shildi, lekin bo'limlar yozilmadi (Apps Script eski versiyada)
    return NextResponse.json({ success: true, password: r.password, warning: r.message }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[auth] createUser:", e);
    return NextResponse.json({ success: false, message: "Server bilan bog'lanib bo'lmadi. Qayta urinib ko'ring." }, { status: 502 });
  }
}

export async function PATCH(req: Request) {
  const u = await requireSuperadmin();
  if (u instanceof Response) return u;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const login = String(b?.login ?? "").trim();
  if (!login) return bad("Login ko'rsatilmagan");
  const f = validateUserFields(b);
  if (typeof f === "string") return bad(f);
  // O'zini qulflab qo'ymasligi uchun: superadmin o'z rolini o'zgartira olmaydi
  if (login.toLowerCase() === u.login.toLowerCase() && f.role !== u.role) return bad("O'z rolingizni o'zgartira olmaysiz");
  try {
    const r = await updateUser(u.login, login, f);
    // Eski Apps Script: boshqa maydonlar saqlanib sessiya yopilgan bo'lishi mumkin — kesh baribir yangilansin
    if (r.revoked) invalidate(AUTH_STATE_KEY);
    if (!r.success) return bad(r.message || "Saqlab bo'lmadi");
    return NextResponse.json({ success: true, revoked: !!r.revoked });
  } catch (e) {
    console.error("[auth] updateUser:", e);
    return NextResponse.json({ success: false, message: "Server bilan bog'lanib bo'lmadi. Qayta urinib ko'ring." }, { status: 502 });
  }
}
