import { NextResponse } from "next/server";
import { requireArea } from "@/lib/auth";
import { loadXatlov } from "@/lib/xatlov-server";

/** GET /api/xatlov[?fresh=1] — ЎРҚ-937 ШТАБ маълумоти + joriy haftaning kunlik qiymatlari (viloyat bo'yicha) */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await requireArea("xatlov");
  if (u instanceof Response) return u;
  try {
    const data = await loadXatlov(new URL(req.url).searchParams.has("fresh"));
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
