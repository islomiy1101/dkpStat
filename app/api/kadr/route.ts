import { NextResponse } from "next/server";
import { requireArea } from "@/lib/auth";
import { loadKadr } from "@/lib/kadr-server";
import { sectionUpdatedAt, syncSection } from "@/lib/sheet-version";
import { isGlobalIn, sameBranch } from "@/lib/roles";
import type { KadrPayload } from "@/features/kadr/model";

/**
 * GET /api/kadr[?fresh=1] — shtat jadvali. Superadmin va bo'lim boshlig'i — viloyat bo'yicha,
 * filial rahbari — faqat o'z filiali (sameBranch: "Chust tumani filiali" = "Chust tumani").
 */
export const dynamic = "force-dynamic";

const pad = (n: number) => String(n).padStart(2, "0");
/** ms → "dd.MM.yyyy HH:mm" (Toshkent, UTC+5) */
const fmtTashkent = (ms: number) => {
  const d = new Date(ms + 5 * 3600_000);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

export async function GET(req: Request) {
  const u = await requireArea("kadr");
  if (u instanceof Response) return u;
  await syncSection("kadr", "kadr:");
  try {
    // Apps Script sovuq holatda ~5 s javob beradi (Netlify chegarasi — 10 s)
    const [{ rows, uploadedAt }, changed] = await Promise.all([loadKadr(new URL(req.url).searchParams.has("fresh")), sectionUpdatedAt("kadr", 8_000)]);
    const global = isGlobalIn(u, "kadr");
    const body: KadrPayload = {
      rows: global ? rows : rows.filter((r) => sameBranch(r.filial, u.branch)),
      uploadedAt,
      // Oxirgi o'zgarish — Google Sheets versiyalar tarixidagi joriy versiya vaqti; olinmasa — yuklangan vaqt
      updatedAt: changed ? fmtTashkent(changed) : uploadedAt,
      scope: global ? "region" : "branch",
      branch: u.branch,
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
