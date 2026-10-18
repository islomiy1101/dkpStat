import { requireArea } from "@/lib/auth";
import { NextResponse } from "next/server";
import { loadAdviceRaw, buildAdviceData, adviceSessionFor } from "@/lib/advice-server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await requireArea("advice");
  if (u instanceof Response) return u;
  const s = adviceSessionFor(u);
  const fresh = new URL(req.url).searchParams.has("fresh");
  try {
    const raw = await loadAdviceRaw(fresh);
    return NextResponse.json(
      { session: s, ...buildAdviceData(raw, s.tuman) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
