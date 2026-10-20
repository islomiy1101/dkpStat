import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/auth";
import { createUser, listUsers } from "@/lib/auth-server";
import { ROLES, type Role } from "@/lib/roles";

/**
 * Faqat superadmin:
 *  GET  /api/admin/users — foydalanuvchilar ro'yxati (parolsiz)
 *  POST /api/admin/users { fullName, branch, department, login, role } — yangi xodim; vaqtinchalik parol bir marta qaytariladi
 */
export const dynamic = "force-dynamic";

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
  const str = (k: string) => String(b?.[k] ?? "").trim().replace(/\s+/g, " ");
  const user = { fullName: str("fullName"), branch: str("branch"), department: str("department"), login: String(b?.login ?? "").trim(), role: str("role") as Role };
  const bad = (message: string) => NextResponse.json({ success: false, message }, { status: 400 });
  if (!user.fullName) return bad("F.I.O.ni kiriting");
  if (!user.branch) return bad("Filialni kiriting");
  if (!/^\S{3,64}$/.test(user.login)) return bad("Login 3–64 belgidan iborat, probelsiz bo'lishi kerak");
  if (!ROLES.includes(user.role)) return bad("Rolni tanlang");
  try {
    const r = await createUser(u.login, user);
    if (!r.success || !r.password) return NextResponse.json({ success: false, message: r.message || "Foydalanuvchini qo'shib bo'lmadi" }, { status: r.exists ? 409 : 400 });
    return NextResponse.json({ success: true, password: r.password }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[auth] createUser:", e);
    return NextResponse.json({ success: false, message: "Server bilan bog'lanib bo'lmadi. Qayta urinib ko'ring." }, { status: 502 });
  }
}
