import { NextResponse } from "next/server";
import { requireArea } from "@/lib/auth";
import { loadEtirofSvod } from "@/lib/etirof-server";
import { isEtirofPage } from "@/features/etirof/config";

/** GET /api/etirof/<nomzod|tahrirlash|tolov|qaror>[?fresh=1] — SVOD varag'i (viloyat bo'yicha, barcha rollar uchun bir xil) */
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ page: string }> }) {
  const u = await requireArea("etirof");
  if (u instanceof Response) return u;
  const { page } = await ctx.params;
  if (!isEtirofPage(page)) return NextResponse.json({ error: "Noma'lum sahifa" }, { status: 404 });
  try {
    const svod = await loadEtirofSvod(page, new URL(req.url).searchParams.has("fresh"));
    return NextResponse.json(svod, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
