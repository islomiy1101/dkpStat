import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireArea } from "@/lib/auth";
import { isHttps } from "@/lib/session";
import { ExamError, REGTEST_COOKIE, REGTEST_UNLOCK_COOKIE, startExam } from "@/lib/regtest-server";
import { DURATION_SEC, FIO_ERROR, GRACE_SEC, isFio, isPinfl, normalizeFio } from "@/features/regtest/config";

/** POST /api/regtest/start { pinfl, fio } — 20 ta tasodifiy savol (variantlari aralash), token cookie'da */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await requireArea("regtest");
  if (u instanceof Response) return u;
  const body = (await req.json().catch(() => null)) as { pinfl?: unknown; fio?: unknown } | null;
  const pinfl = String(body?.pinfl ?? "").replace(/\s/g, "");
  const fio = normalizeFio(body?.fio);
  if (!isFio(fio)) return NextResponse.json({ error: FIO_ERROR }, { status: 400 });
  if (!isPinfl(pinfl)) return NextResponse.json({ error: "PINFL 14 ta raqamdan iborat bo'lishi kerak" }, { status: 400 });
  try {
    const { exam, token } = await startExam(u, pinfl, fio);
    (await cookies()).set(REGTEST_COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: isHttps(req),
      path: "/api/regtest",
      maxAge: DURATION_SEC + GRACE_SEC + 300,
    });
    // Test topshiruvchi registrator kompyuterida — "Test natijalari" darhol qulflanadi
    (await cookies()).set(REGTEST_UNLOCK_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/api/regtest", maxAge: 0 });
    return NextResponse.json({ exam }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    // 2 soatlik cheklov — 429, keyingi ruxsat vaqti bilan
    if (e instanceof ExamError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[regtest] start:", e);
    return NextResponse.json({ error: (e as Error).message || "Testni boshlab bo'lmadi" }, { status: 502 });
  }
}
