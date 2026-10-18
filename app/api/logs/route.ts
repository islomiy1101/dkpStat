import { NextResponse } from "next/server";
import { requireArea } from "@/lib/auth";
import { fetchLogs } from "@/lib/auth-server";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

/** Faqat superadmin: kirishlar tarixi (eng yangisi birinchi) */
export async function GET(req: Request) {
  const u = await requireArea("logs");
  if (u instanceof Response) return u;
  const fresh = new URL(req.url).searchParams.has("fresh");
  try {
    const logs = await cached("auth:logs", 15_000, () => fetchLogs(), { fresh });
    return NextResponse.json({ logs }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
