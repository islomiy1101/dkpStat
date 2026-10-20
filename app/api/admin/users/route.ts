import { NextResponse } from "next/server";
import { AUTH_STATE_KEY, requireSuperadmin } from "@/lib/auth";
import { createUser, listUsers, updateUser, type UserChanges } from "@/lib/auth-server";
import { invalidate } from "@/lib/cache";
import { ROLES, type Role } from "@/lib/roles";

/**
 * Faqat superadmin:
 *  GET   /api/admin/users — foydalanuvchilar ro'yxati (parolsiz)
 *  POST  /api/admin/users { fullName, branch, department, login, role } — yangi xodim; vaqtinchalik parol bir marta qaytariladi
 *  PATCH /api/admin/users { login, fullName, branch, department, role } — tahrirlash (login o'zgarmaydi);
 *        rol yoki filial o'zgarsa xodimning sessiyalari yopiladi (Apps Script → SessionsRevokedAt)
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
  return f;
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
    return NextResponse.json({ success: true, password: r.password }, { headers: { "Cache-Control": "no-store" } });
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
    if (!r.success) return bad(r.message || "Saqlab bo'lmadi");
    if (r.revoked) invalidate(AUTH_STATE_KEY);
    return NextResponse.json({ success: true, revoked: !!r.revoked });
  } catch (e) {
    console.error("[auth] updateUser:", e);
    return NextResponse.json({ success: false, message: "Server bilan bog'lanib bo'lmadi. Qayta urinib ko'ring." }, { status: 502 });
  }
}
