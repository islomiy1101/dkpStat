import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/auth";
import { resetPassword } from "@/lib/auth-server";

/**
 * POST /api/admin/users/reset { login } — vaqtinchalik parol (faqat superadmin).
 * Parol javobda bir marta qaytariladi, Sheet'da faqat hash; xodim keyingi kirishda o'z parolini o'rnatadi.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await requireSuperadmin();
  if (u instanceof Response) return u;
  const body = (await req.json().catch(() => null)) as { login?: unknown } | null;
  const login = String(body?.login ?? "").trim();
  if (!login) return NextResponse.json({ success: false, message: "Login ko'rsatilmagan" }, { status: 400 });
  if (login.toLowerCase() === u.login.toLowerCase()) {
    return NextResponse.json({ success: false, message: "O'z parolingizni \"Parolni o'zgartirish\" orqali yangilang" }, { status: 400 });
  }
  try {
    const r = await resetPassword(u.login, login);
    if (!r.success || !r.password) return NextResponse.json({ success: false, message: r.message || "Parolni tiklab bo'lmadi" }, { status: 400 });
    return NextResponse.json({ success: true, password: r.password }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[auth] reset:", e);
    return NextResponse.json({ success: false, message: "Server bilan bog'lanib bo'lmadi. Qayta urinib ko'ring." }, { status: 502 });
  }
}
