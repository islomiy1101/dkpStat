import { getUser, authError } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { loadAdviceRaw, buildAdviceData } from "@/lib/advice-server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await getUser())) return authError();
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
