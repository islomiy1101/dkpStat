import { getUser, authError } from "@/lib/auth";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { cached } from "@/lib/cache";
import { fetchGviz, cv } from "@/lib/gviz";
import type { PaymentData, PaymentRow } from "@/lib/types";

export const dynamic = "force-dynamic";

async function load(): Promise<PaymentData> {
  // Ikkala varaq PARALLEL olinadi
  const [planJson, mainJson] = await Promise.all([
    fetchGviz(config.paymentSheetId, config.paymentSheetPlan, "SELECT B,C", { headers: false }),
    fetchGviz(config.paymentSheetId, config.paymentSheetMain, "SELECT B,C,D,E,F,G,H,I,J,K,L,M,N", { headers: false }),
  ]);

  const plan: Record<string, number> = {};
  for (const r of planJson.table?.rows || []) {
    const c = r.c;
    if (!c || !c[0] || !c[0].v) continue;
    const dist = String(c[0].v).trim();
    const lower = dist.toLowerCase();
    if (lower.includes("viloyat") || lower.includes("вилоят") || lower.includes("jami") || lower.includes("жами")) continue;
    plan[dist] = c[1] ? Number(c[1].v) || 0 : 0;
  }

  const str = (c: PaymentRowCells, i: number, def = "") =>
    c[i] && c[i]!.v !== null && c[i]!.v !== undefined ? String(c[i]!.v).trim() : def;
  const fmtd = (c: PaymentRowCells, i: number) => (c[i] ? String(c[i]!.f || c[i]!.v || "") : "");

  const rows: PaymentRow[] = [];
  for (const r of mainJson.table?.rows || []) {
    const c = r.c;
    if (!c || !c[0] || !c[0].v) continue;
    rows.push({
      district: String(c[0].v).trim(),
      appNumber: str(c, 1),
      trx: str(c, 2),
      client: str(c, 3),
      phone: str(c, 4),
      source: str(c, 5),
      engineer: str(c, 6, "Noma'lum"),
      issueDate: fmtd(c, 7),
      status: c[8] ? String(cv(c, 8)).trim().toLowerCase() : "",
      paidDateRaw: fmtd(c, 9),
      kadastr: c[10] ? Number(c[10].v) || 0 : 0,
      registratsiya: c[11] ? Number(c[11].v) || 0 : 0,
      manzil: c[12] ? Number(c[12].v) || 0 : 0,
    });
  }
  return { plan, rows };
}
type PaymentRowCells = NonNullable<import("@/lib/gviz").GvizRow["c"]>;

export async function GET(req: Request) {
  if (!(await getUser())) return authError();
  const fresh = new URL(req.url).searchParams.has("fresh");
  try {
    const data = await cached("payment", config.cacheTtlMs, load, { fresh });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
