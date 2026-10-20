import { NextResponse } from "next/server";
import { requireArea } from "@/lib/auth";
import { importChunk, importSheets } from "@/lib/auth-server";
import { config } from "@/lib/config";
import { invalidate } from "@/lib/cache";
import { MOCK } from "@/lib/mock";
import { MAX_CHUNK_ROWS, UPLOAD_TARGETS, isUploadSection, parseWorkbook, type CellValue, type UploadSection } from "@/lib/upload-targets";
import { invalidateDeadline, mockAppendChunk } from "@/lib/deadline-server";
import { mockSetKadr } from "@/lib/kadr-server";
import { DEADLINE_LIST_IDS, DEADLINE_LISTS } from "@/features/deadline/source";

/**
 * POST /api/upload/<payment|deadline> — faqat superadmin.
 *  - payment: multipart .xlsx — server tekshirib, varaqlarni zaxira bilan to'liq almashtiradi;
 *  - deadline (chunked): fayl katta, so'rov hajmi cheklangan — brauzer tekshirib, har bir varaqni
 *    qismlarga bo'lib JSON bilan yuboradi; har bir qism shu yerda tekshirilib Apps Script'ga uzatiladi.
 */
export const dynamic = "force-dynamic";

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_WIDTH = 300;

const SHEET_ID: Record<UploadSection, () => string> = {
  kadr: () => config.kadrSheetId,
  payment: () => config.paymentSheetId,
  deadline: () => config.deadlineSheetId,
};

const fail = (message: string, status = 400) => NextResponse.json({ success: false, message }, { status });

type ChunkBody = {
  sheet?: unknown;
  fileName?: unknown;
  startRow?: unknown;
  totalRows?: unknown;
  values?: unknown;
};

export async function POST(req: Request, ctx: { params: Promise<{ section: string }> }) {
  const u = await requireArea("upload");
  if (u instanceof Response) return u;
  const { section } = await ctx.params;
  if (!isUploadSection(section)) return fail("Noma'lum bo'lim", 404);
  const target = UPLOAD_TARGETS[section];

  if (target.chunked) {
    const body = (await req.json().catch(() => null)) as ChunkBody | null;
    if (!body) return fail("So'rov noto'g'ri");
    const rule = [...target.sheets, ...(target.derived ?? [])].find((r) => r.target === body.sheet);
    if (!rule) return fail("Noma'lum varaq");
    const startRow = Number(body.startRow);
    const totalRows = Number(body.totalRows);
    const values = body.values as CellValue[][];
    if (!Array.isArray(values) || !values.length || values.length > MAX_CHUNK_ROWS || !Array.isArray(values[0])) {
      return fail("Qism noto'g'ri");
    }
    const width = values[0].length;
    if (!width || width > MAX_WIDTH || values.some((r) => !Array.isArray(r) || r.length !== width)) return fail("Qism qatorlari bir xil uzunlikda emas");
    if (!Number.isInteger(startRow) || startRow < 1 || !Number.isInteger(totalRows) || startRow + values.length - 1 > totalRows) {
      return fail("Qism raqamlari noto'g'ri");
    }
    // Birinchi qism sarlavhalarni o'z ichiga oladi — shu yerda qayta tekshiriladi
    if (startRow === 1 && rule.validate) {
      try {
        rule.validate(values);
      } catch (e) {
        return fail(`"${rule.target}" varag'i: ${(e as Error).message}`);
      }
    }
    const last = startRow + values.length - 1 === totalRows;
    const fileName = String(body.fileName || "").slice(0, 200);
    try {
      const r = await importChunk(
        SHEET_ID[section](),
        rule.target,
        { startRow, values, reset: startRow === 1, totalRows, width, last, asText: !!target.asText },
        { section, login: u.login, fullName: u.fullName, fileName }
      );
      if (!r.success) return fail(r.message || "Google Sheets'ga yozib bo'lmadi", 502);
      if (section === "deadline") {
        if (MOCK) {
          const list = DEADLINE_LIST_IDS.find((id) => DEADLINE_LISTS[id].sheet === rule.target);
          if (list) mockAppendChunk(list, startRow, values, last);
        }
        if (last) invalidateDeadline();
      }
      return NextResponse.json({ success: true, last });
    } catch (e) {
      console.error("upload chunk:", e);
      return fail("Server bilan bog'lanib bo'lmadi. Qayta urinib ko'ring.", 502);
    }
  }

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
      parsed.map((p) => ({ name: p.rule.target, values: p.values })),
      { section, login: u.login, fullName: u.fullName, fileName: file.name }
    );
    if (!r.success) return fail(r.message || "Google Sheets'ga yozib bo'lmadi", 502);
    invalidate(section); // "payment" / "kadr" keshi
    if (MOCK && section === "kadr") mockSetKadr(parsed[0].values);
    const counts = parsed.map((p) => `${p.rule.target}: ${p.values.length - (p.rule.headerRows ?? 1)} qator`).join(", ");
    return NextResponse.json({ success: true, message: `Baza yangilandi (${counts}).${r.message ? ` ${r.message}` : ""}` });
  } catch (e) {
    console.error("upload:", e);
    return fail("Server bilan bog'lanib bo'lmadi. Qayta urinib ko'ring.", 502);
  }
}
