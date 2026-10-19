import { requireArea } from "@/lib/auth";
import { NextResponse } from "next/server";
import { loadReceptionRaw, receptionSessionFor, scopeReception } from "@/lib/reception-server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await requireArea("reception");
  if (u instanceof Response) return u;
  const s = receptionSessionFor(u);
  const fresh = new URL(req.url).searchParams.has("fresh");
  try {
    const raw = await loadReceptionRaw(fresh);
    return NextResponse.json({ session: s, ...scopeReception(raw, s.tuman) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
