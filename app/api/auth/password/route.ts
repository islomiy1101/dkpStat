import { NextResponse } from "next/server";
import { authError, getUser, setUser } from "@/lib/auth";
import { changePassword } from "@/lib/auth-server";
import { isHttps } from "@/lib/session";

/**
 * POST /api/auth/password { current, next } — foydalanuvchi o'z parolini almashtiradi.
 * Majburiy almashtirish (mustChange) holatida ham ochiq; muvaffaqiyatli bo'lsa sessiya belgisiz qayta yoziladi.
 * Talablar: lib/password-policy.ts (Apps Script ham qayta tekshiradi).
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await getUser();
  if (!u) return authError();
  const body = (await req.json().catch(() => null)) as { current?: unknown; next?: unknown } | null;
  const current = String(body?.current ?? "");
  const next = String(body?.next ?? "");
  if (!current || !next) return NextResponse.json({ success: false, message: "Joriy va yangi parolni kiriting" }, { status: 400 });

  try {
    const r = await changePassword(u.login, current, next);
    if (!r.success) {
      return NextResponse.json({ success: false, message: r.message || "Parolni o'zgartirib bo'lmadi" }, { status: r.wrongCurrent ? 401 : 400 });
    }
    await setUser({ ...u, mustChange: undefined }, isHttps(req));
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[auth] password:", e);
    return NextResponse.json({ success: false, message: "Server bilan bog'lanib bo'lmadi. Qayta urinib ko'ring." }, { status: 502 });
  }
}
