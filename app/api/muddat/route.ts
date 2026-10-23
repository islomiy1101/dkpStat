import { NextResponse } from "next/server";
import { requireArea } from "@/lib/auth";
import { isGlobalIn, sameBranch } from "@/lib/roles";
import { HOLAT_RE, loadMuddat, saveHolat } from "@/lib/muddat-server";
import { syncSection } from "@/lib/sheet-version";
import { VILOYAT, buildMuhandisSvod, buildSvod, colsOf, muhandisName, type MuddatCol, type MuddatSvod } from "@/features/muddat/rules";

/**
 * "Muddat buzilish" (Rollar kesimida tahlil ichida):
 *  - GET /api/muddat[?fresh] — tumanlar kesimidagi SVOD (bugungi sana bo'yicha);
 *  - GET /api/muddat?details=1&tuman=…&col=…[&muhandis=…] — katakdagi arizalar ro'yxati (col=hammasi — barcha ustunlar);
 *  - GET /api/muddat?muhandislar=1&tuman=… — tuman ichida ijrochi muhandislar kesimidagi SVOD.
 *  f=<ustun>[,<ustun>…] (ixtiyoriy, hammasiga) — karta filtri: hisob tanlangan ustunlardan istalganiga tushadigan arizalardan.
 * Filial (branch scope) roli faqat o'z tumanini ko'radi.
 */
export const dynamic = "force-dynamic";

/** Kartalar orqali filtrlanadigan ustunlar */
const KARTA_FILTRLARI = new Set<string>(["jami", "otganFilial", "bugun", "qoldi", "muddatiBor"]);

const fmtDay = (d: number | null) => {
  if (d === null) return "";
  const x = new Date(d);
  return `${String(x.getUTCDate()).padStart(2, "0")}.${String(x.getUTCMonth() + 1).padStart(2, "0")}.${x.getUTCFullYear()}`;
};

export async function GET(req: Request) {
  const u = await requireArea("deadline");
  if (u instanceof Response) return u;
  await syncSection("muddat", "muddat:");
  const q = new URL(req.url).searchParams;
  const global = isGlobalIn(u, "deadline");

  try {
    const all = await loadMuddat(q.has("fresh"));
    const { today, empty } = all;
    const fs = (q.get("f") || "").split(",").filter((c): c is MuddatCol => KARTA_FILTRLARI.has(c));
    const arizalar = fs.length ? all.arizalar.filter((a) => { const cols = colsOf(a); return fs.some((c) => cols.includes(c)); }) : all.arizalar;
    const svod = fs.length ? buildSvod(arizalar) : all.svod;
    const scope = (s: MuddatSvod) => (global ? s : Object.fromEntries(Object.entries(s).filter(([t]) => t !== VILOYAT && sameBranch(t, u.branch))));

    if (q.has("muhandislar")) {
      const tuman = q.get("tuman") || "";
      if (!tuman || tuman === VILOYAT) return NextResponse.json({ error: "Tuman tanlanmagan" }, { status: 400 });
      if (!global && !sameBranch(tuman, u.branch)) return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 403 });
      return NextResponse.json({ status: "success", rows: buildMuhandisSvod(arizalar, tuman) }, { headers: { "Cache-Control": "no-store" } });
    }

    if (q.has("details")) {
      const tuman = q.get("tuman") || VILOYAT;
      const col = q.get("col") || "jami";
      const muhandis = q.get("muhandis");
      if (!global && (tuman === VILOYAT || !sameBranch(tuman, u.branch))) return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 403 });
      const rows = arizalar
        .filter((a) => {
          if (tuman !== VILOYAT && a.tuman !== tuman) return false;
          if (muhandis !== null && muhandisName(a) !== muhandis) return false;
          const cols = colsOf(a);
          return col === "hammasi" ? cols.length > 0 : cols.includes(col as MuddatCol);
        })
        .sort((a, b) => (a.qolgan ?? 0) - (b.qolgan ?? 0))
        .map((a, i) => [
          i + 1, a.tuman, a.tranz, a.ariza, a.turi, a.noturar ? "Noturar" : "Turar", a.obyekt2, a.manba, a.sana,
          fmtDay(a.muddat), a.berilgan, a.qolgan ?? "",
          a.qolgan !== null && a.qolgan < 0 ? (a.regBosqich ? "Registratsiya" : "Filial") : "—",
          a.tashqiMaydon ?? "",
          a.normLabel, a.rol, a.jarayon, a.registrator || "—", a.boshMuhandisFio || "—", a.muhandis || "—",
        ]);
      const headers = ["№", "Tuman", "Tranzaksiya raqami", "Ariza raqami", "Ariza turi", "Obyekt turi", "Obyekt turi 2", "Ariza manbasi",
        "Kelib tushgan sana", "Muddat", "Muddat berilgan kun", "Qolgan kun", "Muddati o'tgan tomoni", "Tashqi o'lchovlar bo'yicha maydon", "Muddat qoidasi",
        "Oxirgi jarayon roli", "Oxirgi jarayon nomi", "Ijrochi registrator", "Ijrochi bosh muhandis", "Ijrochi muhandis"];
      return NextResponse.json({ status: "success", headers, data: rows }, { headers: { "Cache-Control": "no-store" } });
    }

    // totals — filtrsiz SVOD (kartalardagi raqamlar filtrga bog'liq emas)
    return NextResponse.json(
      { status: "success", svod: scope(svod), totals: scope(all.svod), today: fmtDay(today), holat: all.holat, empty },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json({ status: "error", message: (e as Error).message }, { status: 502 });
  }
}

/** POST /api/muddat { holat: "yyyy-MM-ddTHH:mm" } — hisobot holati (hammaga umumiy; faqat "Bazaga yuklash" huquqi borlar) */
export async function POST(req: Request) {
  const u = await requireArea("upload");
  if (u instanceof Response) return u;
  const body = (await req.json().catch(() => null)) as { holat?: unknown } | null;
  const holat = String(body?.holat ?? "").trim();
  if (!HOLAT_RE.test(holat)) return NextResponse.json({ status: "error", message: "Sana/vaqt noto'g'ri" }, { status: 400 });
  try {
    await saveHolat(holat);
    return NextResponse.json({ status: "success" });
  } catch (e) {
    return NextResponse.json({ status: "error", message: (e as Error).message }, { status: 502 });
  }
}
