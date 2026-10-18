import { NextResponse } from "next/server";
import { requireArea } from "@/lib/auth";
import { importSheets } from "@/lib/auth-server";
import { config } from "@/lib/config";
import { invalidate } from "@/lib/cache";
import { MOCK } from "@/lib/mock";
import { UPLOAD_TARGETS, isUploadSection, parseWorkbook, type UploadSection } from "@/lib/upload-targets";
import { setMockDeadlineRows, toDeadlineRow } from "@/lib/deadline-server";
import type { DeadlineRow } from "@/features/deadline/aggregate";

/**
 * POST /api/upload/<payment|deadline> — faqat superadmin.
 * .xlsx tekshiriladi va tegishli Google Sheets varaqlari to'liq almashtiriladi.
 */
export const dynamic = "force-dynamic";

const MAX_BYTES = 20 * 1024 * 1024;

const SHEET_ID: Record<UploadSection, () => string> = {
  payment: () => config.paymentSheetId,
  deadline: () => config.deadlineSheetId,
};
/** Sheets'da varaq nomlari .env orqali o'zgartirilgan bo'lishi mumkin */
const TARGET_NAME: Record<string, () => string> = {
  TolovKutilmoqda: () => config.paymentSheetMain,
  TolovReja: () => config.paymentSheetPlan,
  Arizalar: () => config.deadlineSheetName,
};

const fail = (message: string, status = 400) => NextResponse.json({ success: false, message }, { status });

export async function POST(req: Request, ctx: { params: Promise<{ section: string }> }) {
  const u = await requireArea("upload");
  if (u instanceof Response) return u;
  const { section } = await ctx.params;
  if (!isUploadSection(section)) return fail("Noma'lum bo'lim", 404);
  const target = UPLOAD_TARGETS[section];

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("Fayl tanlanmagan");
  if (!/\.xlsx$/i.test(file.name)) return fail("Faqat .xlsx fayl qabul qilinadi");
  if (file.size > MAX_BYTES) return fail("Fayl hajmi 20 MB dan oshmasligi kerak");

  const XLSX = await import("xlsx");
  let parsed;
  try {
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: true });
    parsed = parseWorkbook(XLSX, wb, target);
  } catch (e) {
    return fail((e as Error).message || "Faylni o'qib bo'lmadi");
  }

  try {
    const r = await importSheets(
      SHEET_ID[section](),
      parsed.map((p) => ({ name: TARGET_NAME[p.rule.target]?.() || p.rule.target, values: p.values })),
      { section, login: u.login, fullName: u.fullName, fileName: file.name }
    );
    if (!r.success) return fail(r.message || "Google Sheets'ga yozib bo'lmadi", 502);

    if (MOCK && section === "deadline") {
      const [head, ...rows] = parsed[0].values;
      setMockDeadlineRows(
        rows
          .map((row) => toDeadlineRow(Object.fromEntries(head.map((h, i) => [String(h).trim(), row[i]]))))
          .filter((x): x is DeadlineRow => x !== null)
      );
    }
    invalidate(section); // "payment" va "deadline:rows" keshlari
    const counts = parsed.map((p) => `${p.sourceName}: ${p.values.length - 1} qator`).join(", ");
    return NextResponse.json({ success: true, message: `Baza yangilandi (${counts}).${r.message ? ` ${r.message}` : ""}` });
  } catch (e) {
    console.error("upload:", e);
    return fail("Server bilan bog'lanib bo'lmadi. Qayta urinib ko'ring.", 502);
  }
}
