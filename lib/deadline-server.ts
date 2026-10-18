import { config } from "./config";
import { MOCK, readMock } from "./mock";
import { cached } from "./cache";
import { fetchGviz, gvizRecords } from "./gviz";
import { DEADLINE_HEADERS, type DeadlineRow } from "@/features/deadline/aggregate";

/** Demo rejimida yuklangan fayl xotirada turadi (Sheets'ga yozilmaydi) */
let mockUploaded: DeadlineRow[] | null = null;
export const setMockDeadlineRows = (rows: DeadlineRow[]) => {
  mockUploaded = rows;
};

export function toDeadlineRow(r: Record<string, unknown>): DeadlineRow | null {
  const s = (k: string) => String(r[k] ?? "").trim();
  const ariza = s("Ariza raqami");
  const tuman = s("Tuman");
  if (!ariza || !tuman) return null;
  const kun = Number(String(r["Kun"] ?? "").replace(",", "."));
  return { ariza, tuman, manba: s("Manba"), rol: s("Rol"), kun: Number.isFinite(kun) ? kun : 0 };
}

async function load(): Promise<DeadlineRow[]> {
  if (MOCK) {
    if (mockUploaded) return mockUploaded;
    const m = await readMock<{ headers: string[]; data: unknown[][] }>("deadline_details");
    return m.data
      .map((row) => toDeadlineRow(Object.fromEntries(m.headers.map((h, i) => [h, row[i]]))))
      .filter((r): r is DeadlineRow => r !== null);
  }
  const t = await fetchGviz(config.deadlineSheetId, config.deadlineSheetName);
  return gvizRecords(t, DEADLINE_HEADERS)
    .map(toDeadlineRow)
    .filter((r): r is DeadlineRow => r !== null);
}

/** Barcha qatorlar — umumiy kesh (summary va details shu bitta so'rovdan hisoblanadi) */
export const loadDeadlineRows = (fresh = false) => cached("deadline:rows", config.cacheTtlMs, load, { fresh });
