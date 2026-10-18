import { NextResponse } from "next/server";
import { loginWithSheet } from "@/lib/auth-server";
import { setUser } from "@/lib/auth";
import { isHttps } from "@/lib/session";
import { invalidate } from "@/lib/cache";
import { mapsUrl } from "@/lib/geo";

export const dynamic = "force-dynamic";

function clientIp(req: Request) {
  const xf = req.headers.get("x-forwarded-for");
  return ((xf ? xf.split(",")[0] : req.headers.get("x-real-ip")) || "Noma'lum").trim();
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { login?: string; password?: string; lat?: unknown; lng?: unknown; accuracy?: unknown };
  const login = String(body.login || "").trim();
  const password = String(body.password || "");
  const lat = Number(body.lat), lng = Number(body.lng), accuracy = Number(body.accuracy);

  if (!login || !password) return NextResponse.json({ success: false, message: "Login va parolni kiriting!" }, { status: 400 });
  // Lokatsiya majburiy (istalgan joydan kirish mumkin, aniqlik bo'yicha cheklov yo'q — faqat jurnalga yoziladi)
  if (![lat, lng, accuracy].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || accuracy <= 0) {
    return NextResponse.json({ success: false, message: "Kirish uchun joylashuvga ruxsat berish shart!" }, { status: 400 });
  }
  const location = mapsUrl({ lat, lng });

  try {
    const r = await loginWithSheet(login, password, clientIp(req), location, Math.round(accuracy));
    if (!r.success) return NextResponse.json({ success: false, message: r.message }, { status: 401 });
    const user = { ...r.user, loginTime: Date.now() };
    await setUser(user, isHttps(req));
    invalidate("auth:logs");
    return NextResponse.json({ success: true, user });
  } catch (e) {
    console.error("auth login:", e);
    return NextResponse.json({ success: false, message: "Server bilan bog'lanib bo'lmadi. Qayta urinib ko'ring." }, { status: 502 });
  }
}
