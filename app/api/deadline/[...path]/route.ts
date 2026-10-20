import { requireArea } from "@/lib/auth";
import { NextResponse } from "next/server";
import { isGlobalIn, sameBranch } from "@/lib/roles";
import { DeadlinePreparing, loadDeadlineSheet, loadDeadlineSummary, warmDeadline } from "@/lib/deadline-server";
import { VILOYAT_JAMI, detailTable, filterDetails } from "@/features/deadline/aggregate";
import { DEADLINE_LISTS, isDeadlineList } from "@/features/deadline/source";

/**
 * "Rollar kesimida tahlil": /api/deadline/summary?list=…, /api/deadline/details?list=…
 * list: yakunlangan | jarayonda — Google Sheets'dagi YakunlanganArizalar / JarayondagiArizalar varaqlari.
 * Avval Django API proxy edi; endi xom qatorlar Google Sheets'dan olinib shu yerda hisoblanadi
 * (javob formati o'zgarmagan — DeadlineView avvalgidek ishlaydi). Jamlanma — svod varaqdan,
 * details — faqat so'ralgan tumanning qatorlari (lib/deadline-server.ts).
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
  const global = isGlobalIn(u.role, "deadline");
  const list = q.get("list") || "yakunlangan";
  if (!isDeadlineList(list)) return NextResponse.json({ error: "Noma'lum ro'yxat" }, { status: 404 });

  try {
    if (name === "summary") {
      const all = await loadDeadlineSummary(list, q.has("fresh"));
      // Filial roli faqat o'z tumanini ko'radi ("Viloyat jami" ham bo'lmaydi)
      const summary = global ? all : Object.fromEntries(Object.entries(all).filter(([tuman]) => sameBranch(tuman, u.branch)));
      return NextResponse.json({ status: "success", summary }, { headers: { "Cache-Control": "no-store" } });
    }

    // Sahifa ochilganda fonda: svod va sarlavhalarni keshga oldindan yuklab qo'yish (birinchi bosish tezroq ochilsin)
    if (q.has("warm")) {
      await warmDeadline(list);
      return NextResponse.json({ status: "success" }, { headers: { "Cache-Control": "no-store" } });
    }
    const tuman = q.get("tuman");
    if (!global && !sameBranch(tuman, u.branch)) {
      return NextResponse.json({ status: "error", message: "Ruxsat yo'q" }, { status: 403 });
    }
    // Faqat kerakli tuman o'qiladi ("Viloyat jami" — butun viloyat; filial roli — doim o'z tumani)
    const one = tuman && tuman.trim().toLowerCase() !== VILOYAT_JAMI.toLowerCase() ? tuman : null;
    const sheet = await loadDeadlineSheet(list, global ? one : one || u.branch || null, q.has("fresh"));
    let rows = sheet.rows;
    if (!global) rows = rows.filter((r) => sameBranch(r.tuman, u.branch));
    const { headers, data } = detailTable(sheet, filterDetails(rows, { tuman, manba: q.get("manba"), role: q.get("role"), day: q.get("day") }));

    if (q.get("action") === "export") {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
      ws["!cols"] = headers.map((h, i) => ({ wch: i === 0 ? 6 : Math.min(40, Math.max(10, h.length + 2)) }));
      ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length, c: headers.length - 1 } }) };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Arizalar");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;
      const file = `${String(tuman || "Arizalar").replace(/\s+/g, "_")}_${DEADLINE_LISTS[list].sheet}.xlsx`;
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file)}`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json({ status: "success", headers, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    // Eski usulda yuklangan ma'lumot avtomatik tartiblanmoqda — mijoz biroz kutib qayta so'raydi
    if (e instanceof DeadlinePreparing) {
      return NextResponse.json({ status: "preparing", message: e.message }, { status: 202, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ status: "error", message: (e as Error).message }, { status: 502 });
  }
}
