import { NextResponse } from "next/server";
import { requireArea } from "@/lib/auth";
import { loadKadr } from "@/lib/kadr-server";
import { syncSection } from "@/lib/sheet-version";
import { isGlobalIn, sameBranch } from "@/lib/roles";
import type { KadrPayload } from "@/features/kadr/model";

/**
 * GET /api/kadr[?fresh=1] — shtat jadvali. Superadmin va bo'lim boshlig'i — viloyat bo'yicha,
 * filial rahbari — faqat o'z filiali (sameBranch: "Chust tumani filiali" = "Chust tumani").
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await requireArea("kadr");
  if (u instanceof Response) return u;
  await syncSection("kadr", "kadr:");
  try {
    const { rows, uploadedAt } = await loadKadr(new URL(req.url).searchParams.has("fresh"));
    const global = isGlobalIn(u.role, "kadr");
    const body: KadrPayload = {
      rows: global ? rows : rows.filter((r) => sameBranch(r.filial, u.branch)),
      uploadedAt,
      scope: global ? "region" : "branch",
      branch: u.branch,
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
