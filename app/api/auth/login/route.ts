import { NextResponse } from "next/server";
import { loginWithSheet } from "@/lib/auth-server";
import { setUser } from "@/lib/auth";
import { clearSession as clearAdviceSession, isHttps } from "@/lib/session";
import { invalidate } from "@/lib/cache";

export const dynamic = "force-dynamic";

function clientIp(req: Request) {
  const xf = req.headers.get("x-forwarded-for");
  return ((xf ? xf.split(",")[0] : req.headers.get("x-real-ip")) || "Noma'lum").trim();
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { login?: string; password?: string; location?: string };
  const login = String(body.login || "").trim();
  const password = String(body.password || "");
  const location = String(body.location || "").trim();

  if (!login || !password) return NextResponse.json({ success: false, message: "Login va parolni kiriting!" }, { status: 400 });
  // Lokatsiya majburiy (frontend ham tekshiradi, server ham)
  if (!/^https:\/\/maps\.google\.com\/\?q=-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(location)) {
    return NextResponse.json({ success: false, message: "Kirish uchun joylashuvga ruxsat berish shart!" }, { status: 400 });
  }

  try {
    const r = await loginWithSheet(login, password, clientIp(req), location);
    if (!r.success) return NextResponse.json({ success: false, message: r.message }, { status: 401 });
    const user = { ...r.user, loginTime: Date.now() };
    await setUser(user, isHttps(req));
    invalidate("auth:logs");
    await clearAdviceSession(); // oldingi foydalanuvchining advice sessiyasi qolib ketmasin
    return NextResponse.json({ success: true, user });
  } catch (e) {
    console.error("auth login:", e);
    return NextResponse.json({ success: false, message: "Server bilan bog'lanib bo'lmadi. Qayta urinib ko'ring." }, { status: 502 });
  }
}
