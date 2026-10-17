import { getUser, authError } from "@/lib/auth";
import { NextResponse } from "next/server";
import { findUser, callAppsScript } from "@/lib/advice-server";
import { setSession, isHttps } from "@/lib/session";

export const dynamic = "force-dynamic";

function clientIp(req: Request) {
  const xf = req.headers.get("x-forwarded-for");
  return (xf ? xf.split(",")[0] : req.headers.get("x-real-ip")) || "Noma'lum IP";
}

export async function POST(req: Request) {
  if (!(await getUser())) return authError();
  const body = (await req.json().catch(() => ({}))) as { login?: string; password?: string; location?: string; ip?: string };
  if (!body.login || !body.password) {
    return NextResponse.json({ success: false, message: "Login yoki parol noto'g'ri!" }, { status: 400 });
  }
  try {
    const user = await findUser(body.login, body.password);
    if (!user) return NextResponse.json({ success: false, message: "Login yoki parol noto'g'ri!" }, { status: 401 });

    const session = { tuman: user.tuman, fio: user.fio, loginTime: Date.now() };
    await setSession(session, isHttps(req));

    // Kirishlar tarixini fonda yozish (javobni kutmaymiz — original kabi)
    void callAppsScript({
      action: "logLoginHistory",
      fio: user.fio || "Mavjud emas",
      tuman: user.tuman || "Mavjud emas",
      ip: body.ip || clientIp(req),
      location: body.location || "Ruxsat berilmadi",
    });

    return NextResponse.json({ success: true, session });
  } catch {
    return NextResponse.json({ success: false, message: "Tarmoq xatosi yuz berdi! Qayta urinib ko'ring." }, { status: 502 });
  }
}
