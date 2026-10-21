import { requireArea, forbidden } from "@/lib/auth";
import { NextResponse } from "next/server";
import { isSuperAdminTuman } from "@/lib/session";
import { callReceptionScript, loadReceptionRaw, receptionSessionFor, scopeReception } from "@/lib/reception-server";
import { invalidate } from "@/lib/cache";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["searchByPassport", "saveMurojaat", "setKetdiVaqti", "updateMurojaat"]);

/** Filial foydalanuvchisi faqat o'z tumani qatorini o'zgartira oladi (yangi qator keshda bo'lmasa — bir marta yangilab tekshiriladi) */
async function ownsRow(tuman: string, rowNum: number) {
  for (const fresh of [false, true]) {
    const mine = await scopeReception(await loadReceptionRaw(fresh), tuman);
    if (mine.murojaatlar.some((m) => m.rowNum === rowNum)) return mine;
  }
  return null;
}

export async function POST(req: Request) {
  const u = await requireArea("reception");
  if (u instanceof Response) return u;
  const s = receptionSessionFor(u);
  // Filial rahbari — faqat ko'rish (analitika paneli)
  if (s.analytics) return forbidden();
  const global = isSuperAdminTuman(s.tuman);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "");
  if (!ACTIONS.has(action)) return NextResponse.json({ success: false, message: "Noma'lum amal!" }, { status: 400 });

  let payload: Record<string, unknown>;
  if (action === "searchByPassport") {
    payload = { action, passport: String(body.passport || "").trim().toUpperCase() };
  } else if (action === "saveMurojaat") {
    const f = (body.formData || {}) as Record<string, unknown>;
    const formData = Object.fromEntries(
      ["passport", "fio", "tuman", "manzil", "maqsad", "qabulQildi", "lavozim"].map((k) => [k, String(f[k] ?? "").trim()])
    );
    // Filial xodimi faqat o'z tumaniga yozadi (server tomonda majburlanadi)
    if (!global) formData.tuman = s.tuman;
    payload = { action, formData };
  } else {
    const rowNum = Number(body.rowNum);
    if (!Number.isInteger(rowNum) || rowNum < 2) return NextResponse.json({ success: false, message: "Qator noto'g'ri" }, { status: 400 });
    payload = { action, rowNum };
    if (action === "updateMurojaat") {
      payload.qabulQildi = String(body.qabulQildi || "").trim();
      payload.lavozim = String(body.lavozim || "").trim();
    }
    if (!global) {
      const mine = await ownsRow(s.tuman, rowNum);
      if (!mine) return forbidden();
      if (action === "updateMurojaat" && !mine.xodimlar.some((x) => x.fio === payload.qabulQildi)) return forbidden();
    }
  }

  const res = await callReceptionScript(payload);
  if (action !== "searchByPassport" && res && res.success) invalidate("reception:raw");
  return NextResponse.json(res);
}
