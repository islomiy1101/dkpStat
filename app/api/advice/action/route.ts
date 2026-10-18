import { requireArea } from "@/lib/auth";
import { NextResponse } from "next/server";
import { isSuperAdminTuman, normalizeName } from "@/lib/session";
import { callAppsScript, adviceSessionFor } from "@/lib/advice-server";
import { invalidate } from "@/lib/cache";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["saveMurojaat", "setKetdiVaqti", "updateNatija"]);

export async function POST(req: Request) {
  const u = await requireArea("advice");
  if (u instanceof Response) return u;
  const s = adviceSessionFor(u);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "");
  if (!ACTIONS.has(action)) return NextResponse.json({ success: false, message: "Noma'lum amal!" }, { status: 400 });

  let payload: Record<string, unknown> = { action };
  if (action === "saveMurojaat") {
    const formData = { ...(body.formData as Record<string, unknown>) };
    // Filial xodimi faqat o'z tumaniga yozadi (server tomonda majburlanadi)
    if (!isSuperAdminTuman(s.tuman) && normalizeName(formData.tuman) !== normalizeName(s.tuman)) {
      formData.tuman = s.tuman;
    }
    payload.formData = formData;
  } else if (action === "setKetdiVaqti") {
    payload.rowNum = Number(body.rowNum);
  } else {
    payload = { action, rowNum: Number(body.rowNum), natijaTuri: String(body.natijaTuri || "") };
  }

  const res = await callAppsScript(payload);
  if (res && res.success) invalidate("advice:raw");
  return NextResponse.json(res);
}
