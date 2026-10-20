import { NextResponse } from "next/server";
import { loginWithSheet } from "@/lib/auth-server";
import { setUser } from "@/lib/auth";
import { isHttps } from "@/lib/session";
import { invalidate } from "@/lib/cache";

export const dynamic = "force-dynamic";

function clientIp(req: Request) {
  const xf = req.headers.get("x-forwarded-for");
  return ((xf ? xf.split(",")[0] : req.headers.get("x-real-ip")) || "Noma'lum").trim();
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { login?: string; password?: string };
  const login = String(body.login || "");
  const password = String(body.password || "");

  if (!login || !password) return NextResponse.json({ success: false, message: "Login va parolni kiriting!" }, { status: 400 });
  // Login va parolda bo'sh joy bo'lmaydi (brauzer ham kiritishga yo'l qo'ymaydi)
  if (/\s/.test(login) || /\s/.test(password)) {
    return NextResponse.json({ success: false, message: "Login va parolda probel bo'lmasligi kerak" }, { status: 400 });
  }

  try {
    // Joylashuv so'ralmaydi — jurnalga faqat vaqt va IP yoziladi (Apps Script bo'sh joylashuvni "Aniqlanmadi" deb yozadi)
    const r = await loginWithSheet(login, password, clientIp(req));
    if (!r.success) return NextResponse.json({ success: false, message: r.message }, { status: 401 });
    const user = { ...r.user, loginTime: Date.now(), mustChange: r.mustChange || undefined };
    await setUser(user, isHttps(req));
    invalidate("auth:logs");
    return NextResponse.json({ success: true, user });
  } catch (e) {
    console.error("auth login:", e);
    return NextResponse.json({ success: false, message: "Server bilan bog'lanib bo'lmadi. Qayta urinib ko'ring." }, { status: 502 });
  }
}
