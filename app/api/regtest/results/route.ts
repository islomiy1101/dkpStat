import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireArea } from "@/lib/auth";
import { REGTEST_UNLOCK_COOKIE, checkUnlock, loadResults } from "@/lib/regtest-server";

/** GET /api/regtest/results — "Натижалар" (faqat parol bilan ochilgan bo'lsa, aks holda 423) */
export const dynamic = "force-dynamic";

export async function GET() {
  const u = await requireArea("regtest");
  if (u instanceof Response) return u;
  const until = checkUnlock((await cookies()).get(REGTEST_UNLOCK_COOKIE)?.value, u.login);
  if (!until) return NextResponse.json({ error: "locked", message: "Parol talab qilinadi" }, { status: 423 });
  try {
    return NextResponse.json({ results: await loadResults(), until }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[regtest] results:", e);
    return NextResponse.json({ error: (e as Error).message || "Natijalarni o'qib bo'lmadi" }, { status: 502 });
  }
}
