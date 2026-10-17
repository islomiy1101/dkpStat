import { NextResponse } from "next/server";
import { getUser, authError, forbidden } from "@/lib/auth";
import { fetchLogs } from "@/lib/auth-server";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

/** Faqat admin: kirishlar tarixi (eng yangisi birinchi) */
export async function GET(req: Request) {
  const u = await getUser();
  if (!u) return authError();
  if (u.role !== "admin") return forbidden();
  const fresh = new URL(req.url).searchParams.has("fresh");
  try {
    const logs = await cached("auth:logs", 15_000, () => fetchLogs(), { fresh });
    return NextResponse.json({ logs }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
