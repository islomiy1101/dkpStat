import { MOCK, readMock } from "./mock";

/**
 * Google Sheets gviz endpoint'idan ma'lumot olish (server tomonda).
 * Original frontenddagi fetchSheetDataViaGviz bilan bir xil format qaytaradi.
 */
export type GvizCell = { v?: unknown; f?: string } | null;
export type GvizRow = { c: GvizCell[] | null };
export type GvizTable = { table?: { rows?: GvizRow[]; cols?: unknown[] } };


export async function fetchGviz(
  sheetId: string,
  sheetName: string,
  query = "SELECT *",
  opts: { headers?: boolean } = { headers: true }
): Promise<GvizTable> {
  if (MOCK) return readMock<GvizTable>(`${sheetName === "TolovReja" || sheetName === "TolovKutilmoqda" ? "payment" : "advice"}_${sheetName}`);
  if (!sheetId) throw new Error(`Sheet ID sozlanmagan (${sheetName})`);
  const params = new URLSearchParams({
    tqx: "out:json",
    sheet: sheetName,
    tq: query,
    _nc: String(Date.now()),
  });
  if (opts.headers) params.set("headers", "1");
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${params}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Google Sheets javobi: ${res.status}`);
  const text = await res.text();
  const json = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(json) as GvizTable;
}

/** c[i].v ni xavfsiz olish */
export const cv = (c: GvizCell[] | null | undefined, i: number) => (c && c[i] ? c[i]!.v : undefined);
/** c[i].f || c[i].v (formatlangan qiymat ustun) */
export const cf = (c: GvizCell[] | null | undefined, i: number) =>
  c && c[i] ? (c[i]!.f || (c[i]!.v as string) || "") : "";
