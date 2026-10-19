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

/**
 * gviz CSV ko'rinishida (katta varaqlar uchun JSON'dan ancha yengil, qiymatlar formatlangan holda keladi).
 * `range` — "A1:CZ2" kabi oraliq; `tq` — "select B,G,W" kabi so'rov. Sarlavha qatorlari ham ma'lumot sifatida qaytadi (headers=0).
 * Diqqat: gviz har bir ustun turini ko'pchilik qiymatlarga qarab tanlaydi — boshqa turdagi kataklar bo'sh keladi.
 */
export async function fetchGvizCsv(sheetId: string, sheetName: string, opts: { range?: string; tq?: string } = {}): Promise<string[][]> {
  if (!sheetId) throw new Error(`Sheet ID sozlanmagan (${sheetName})`);
  const params = new URLSearchParams({ tqx: "out:csv", sheet: sheetName, headers: "0", _nc: String(Date.now()) });
  if (opts.range) params.set("range", opts.range);
  if (opts.tq) params.set("tq", opts.tq);
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Google Sheets javobi: ${res.status} (${sheetName})`);
  const text = await res.text();
  // Ruxsat yo'q yoki varaq topilmadi — CSV o'rniga HTML sahifa keladi
  if (/^\s*<(!doctype|html)/i.test(text)) throw new Error(`"${sheetName}" varag'ini o'qib bo'lmadi: sheet "havola orqali ko'rish" rejimida emas yoki varaq nomi noto'g'ri`);
  return parseCsv(text);
}

/** RFC 4180 CSV (qo'shtirnoq ichida vergul, qator ko'chishi va "" bo'lishi mumkin) */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    let val: string;
    if (text.charCodeAt(i) === 34) {
      // "..."
      let j = i + 1;
      let buf = "";
      for (;;) {
        const q = text.indexOf('"', j);
        if (q < 0) {
          buf += text.slice(j);
          j = n;
          break;
        }
        buf += text.slice(j, q);
        if (text.charCodeAt(q + 1) === 34) {
          buf += '"';
          j = q + 2;
        } else {
          j = q + 1;
          break;
        }
      }
      val = buf;
      i = j;
    } else {
      let j = i;
      while (j < n) {
        const c = text.charCodeAt(j);
        if (c === 44 || c === 10 || c === 13) break;
        j++;
      }
      val = text.slice(i, j);
      i = j;
    }
    row.push(val);
    const c = text.charCodeAt(i);
    if (c === 44) {
      i++;
      if (i === n) row.push("");
    } else {
      if (c === 13 && text.charCodeAt(i + 1) === 10) i += 2;
      else i++;
      rows.push(row);
      row = [];
    }
  }
  if (row.length) rows.push(row);
  return rows;
}

const gidCache = new Map<string, { at: number; gids: Record<string, string> }>();

/** Varaq nomi → gid (htmlview sahifasidagi ro'yxatdan; 1 soat keshlanadi) */
async function sheetGid(sheetId: string, sheetName: string): Promise<string> {
  let hit = gidCache.get(sheetId);
  if (!hit || Date.now() - hit.at > 3600_000 || !(sheetName in hit.gids)) {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Google Sheets javobi: ${res.status}`);
    const html = await res.text();
    const gids: Record<string, string> = {};
    for (const m of html.matchAll(/\{name: "((?:[^"\\]|\\.)*)", pageUrl: "(?:[^"\\]|\\.)*", gid: "(\d+)"/g)) {
      gids[JSON.parse(`"${m[1]}"`)] = m[2];
    }
    hit = { at: Date.now(), gids };
    gidCache.set(sheetId, hit);
  }
  const gid = hit.gids[sheetName];
  if (!gid) {
    const names = Object.keys(hit.gids);
    throw new Error(`"${sheetName}" varag'i topilmadi${names.length ? ` (mavjud: ${names.join(", ")})` : " — sheet \"havola orqali ko'rish\" rejimida emas"}`);
  }
  return gid;
}

/**
 * Varaqni aniq qiymatlari bilan (export CSV). gviz'dan farqli — ustun turini taxmin qilmaydi,
 * raqamli ustunlardagi sana/matn sarlavhalar yo'qolmaydi. Noto'g'ri nomda birinchi varaqqa ham tushmaydi.
 */
export async function fetchSheetCsvByName(sheetId: string, sheetName: string): Promise<string[][]> {
  if (!sheetId) throw new Error(`Sheet ID sozlanmagan (${sheetName})`);
  const gid = await sheetGid(sheetId, sheetName);
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Google Sheets javobi: ${res.status} (${sheetName})`);
  const text = await res.text();
  if (/^\s*<(!doctype|html)/i.test(text)) throw new Error(`"${sheetName}" varag'ini o'qib bo'lmadi: sheet "havola orqali ko'rish" rejimida emas`);
  return parseCsv(text);
}
