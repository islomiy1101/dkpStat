import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireArea } from "@/lib/auth";
import { isHttps } from "@/lib/session";
import { verifyPassword } from "@/lib/auth-server";
import { REGTEST_UNLOCK_COOKIE, checkUnlock, encodeUnlock } from "@/lib/regtest-server";
import { UNLOCK_SEC } from "@/features/regtest/config";

/**
 * "Test natijalari" qulfi. Test yechayotgan odam registrator kompyuterida bo'ladi —
 * natijalarni ochish uchun tizimga kirgan foydalanuvchi parolini qayta kiritadi.
 *  GET    — holat { unlocked, until }
 *  POST   { password } — tekshirib 15 daqiqaga ochadi
 *  DELETE — qulflaydi
 */
export const dynamic = "force-dynamic";

const COOKIE = { httpOnly: true, sameSite: "strict" as const, path: "/api/regtest" };

export async function GET() {
  const u = await requireArea("regtest");
  if (u instanceof Response) return u;
  const until = checkUnlock((await cookies()).get(REGTEST_UNLOCK_COOKIE)?.value, u.login);
  return NextResponse.json({ unlocked: !!until, until }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const u = await requireArea("regtest");
  if (u instanceof Response) return u;
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const password = String(body?.password ?? "");
  if (!password) return NextResponse.json({ error: "Parolni kiriting" }, { status: 400 });
  if (/\s/.test(password)) return NextResponse.json({ error: "Parolda probel bo'lmasligi kerak" }, { status: 400 });
  try {
    const r = await verifyPassword(u.login, password);
    if (!r.success) return NextResponse.json({ error: r.message || "Parol noto'g'ri" }, { status: 401 });
  } catch (e) {
    console.error("[regtest] unlock:", e);
    return NextResponse.json({ error: "Parolni tekshirib bo'lmadi. Qayta urinib ko'ring." }, { status: 502 });
  }
  const token = encodeUnlock(u.login);
  (await cookies()).set(REGTEST_UNLOCK_COOKIE, token, { ...COOKIE, secure: isHttps(req), maxAge: UNLOCK_SEC });
  return NextResponse.json({ unlocked: true, until: checkUnlock(token, u.login) });
}

export async function DELETE() {
  const u = await requireArea("regtest");
  if (u instanceof Response) return u;
  (await cookies()).set(REGTEST_UNLOCK_COOKIE, "", { ...COOKIE, maxAge: 0 });
  return NextResponse.json({ unlocked: false });
}
