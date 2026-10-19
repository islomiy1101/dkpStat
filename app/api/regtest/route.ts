import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireArea } from "@/lib/auth";
import { REGTEST_COOKIE, resumeExam } from "@/lib/regtest-server";

/** GET /api/regtest — boshlangan test bo'lsa (sahifa yangilangan), uni qayta tiklaydi; bo'lmasa { exam: null } */
export const dynamic = "force-dynamic";

export async function GET() {
  const u = await requireArea("regtest");
  if (u instanceof Response) return u;
  try {
    const exam = await resumeExam(u, (await cookies()).get(REGTEST_COOKIE)?.value);
    return NextResponse.json({ exam }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
