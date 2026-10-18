import { requireArea } from "@/lib/auth";
import { NextResponse } from "next/server";
import { isGlobal, sameBranch } from "@/lib/roles";
import { loadDeadlineRows } from "@/lib/deadline-server";
import { buildSummary, detailRows, filterDetails, DETAIL_HEADERS, VILOYAT_JAMI } from "@/features/deadline/aggregate";

/**
 * "Rollar kesimida tahlil": /api/deadline/summary, /api/deadline/details
 * Avval Django API proxy edi; endi xom qatorlar Google Sheets'dan olinib shu yerda hisoblanadi
 * (javob formati o'zgarmagan — DeadlineView avvalgidek ishlaydi).
 * Bazani yangilash: /api/upload/deadline (faqat superadmin).
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const u = await requireArea("deadline");
  if (u instanceof Response) return u;
  const { path } = await ctx.params;
  const name = path.join("/");
  if (name !== "summary" && name !== "details") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const q = url.searchParams;
  const global = isGlobal(u.role);

  try {
    let rows = await loadDeadlineRows(q.has("fresh"));
    // Filial roli faqat o'z tumanini ko'radi ("Viloyat jami" ham bo'lmaydi)
    if (!global) rows = rows.filter((r) => sameBranch(r.tuman, u.branch));

    if (name === "summary") {
      const summary = buildSummary(rows);
      if (!global) delete summary[VILOYAT_JAMI];
      return NextResponse.json({ status: "success", summary }, { headers: { "Cache-Control": "no-store" } });
    }

    const tuman = q.get("tuman");
    if (!global && !sameBranch(tuman, u.branch)) {
      return NextResponse.json({ status: "error", message: "Ruxsat yo'q" }, { status: 403 });
    }
    const data = detailRows(filterDetails(rows, { tuman, manba: q.get("manba"), role: q.get("role"), day: q.get("day") }));

    if (q.get("action") === "export") {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.aoa_to_sheet([DETAIL_HEADERS, ...data]);
      ws["!cols"] = [6, 16, 22, 18, 34, 8].map((wch) => ({ wch }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Arizalar");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
      const file = `${String(tuman || "Arizalar").replace(/\s+/g, "_")}_Arizalar.xlsx`;
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file)}`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json({ status: "success", headers: DETAIL_HEADERS, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ status: "error", message: (e as Error).message }, { status: 502 });
  }
}
