import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireArea } from "@/lib/auth";
import { ExamError, REGTEST_COOKIE, finishExam } from "@/lib/regtest-server";

/** POST /api/regtest/finish { answers: (0..3 | null)[] } — serverda baholanadi, natija sheet'ga yoziladi */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await requireArea("regtest");
  if (u instanceof Response) return u;
  const body = (await req.json().catch(() => null)) as { answers?: unknown } | null;
  const jar = await cookies();
  try {
    const result = await finishExam(u, jar.get(REGTEST_COOKIE)?.value, body?.answers);
    // Bir test — bir natija: token o'chiriladi
    jar.set(REGTEST_COOKIE, "", { path: "/api/regtest", maxAge: 0 });
    return NextResponse.json({ result }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ExamError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[regtest] finish:", e);
    return NextResponse.json({ error: "Natijani hisoblab bo'lmadi. Qayta urinib ko'ring." }, { status: 502 });
  }
}
