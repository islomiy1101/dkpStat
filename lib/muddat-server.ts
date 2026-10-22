import { config } from "./config";
import { MOCK } from "./mock";
import { cached, invalidate } from "./cache";
import { fetchGvizCsv } from "./gviz";
import { colLetter } from "@/features/deadline/source";
import { setMuddatHolat } from "./auth-server";
import {
  MUDDAT_COLS, MUDDAT_SHEET, buildSvod, locateMuddatColumns, toArizalar, todayTashkent, type MuddatAriza, type MuddatKey, type MuddatSvod,
} from "@/features/muddat/rules";

/**
 * "Muddat buzilish": MuddatBuzilishBaza varag'idan faqat kerakli ustunlar o'qiladi (gviz select — ~4 MB o'rniga
 * 73 ustunlik to'liq varaq emas), arizalar filtrlanib, SVOD bugungi sana bo'yicha hisoblanadi.
 * Xom qatorlar keshlanadi; svod har so'rovda qayta hisoblanadi (arzon, sana o'zgarishi bilan to'g'ri qoladi).
 */
const KEY = "muddat:";
const TTL = () => Math.max(config.cacheTtlMs, config.muddatCacheTtlMs);
const KEYS = Object.keys(MUDDAT_COLS) as MuddatKey[];

/** Sarlavha qatori bo'yicha ustun harflari — so'ng faqat shu ustunlar so'raladi */
async function loadRaw(fresh: boolean): Promise<string[][]> {
  return cached<string[][]>(
    `${KEY}raw`,
    TTL(),
    async () => {
      if (MOCK) return [];
      const id = config.muddatSheetId;
      if (!id) throw new Error("MUDDAT_SHEET_ID sozlanmagan");
      const head = await fetchGvizCsv(id, MUDDAT_SHEET, { range: "A1:CZ3" });
      if (!head.some((r) => r.some((c) => c.trim()))) return [];
      let loc: ReturnType<typeof locateMuddatColumns>;
      try {
        loc = locateMuddatColumns(head);
      } catch (e) {
        throw new Error(`"${MUDDAT_SHEET}" varag'i: ${(e as Error).message}. Bazani qayta yuklang.`);
      }
      const rows = await fetchGvizCsv(id, MUDDAT_SHEET, { tq: `select ${KEYS.map((k) => colLetter(loc.idx[k])).join(",")}` });
      // Tanlangan ustunlar KEYS tartibida keladi; sarlavha qatorigacha bo'lgan qatorlar tashlanadi.
      // Sarlavha qatori qayta qidirilmaydi: gviz sonli ustunni (masalan, "Tashqi o'lchovlar bo'yicha maydon") number deb
      // aniqlaydi va uning matnli sarlavha katagi select natijasida bo'sh keladi.
      return rows.slice(loc.headerRow + 1);
    },
    { fresh }
  );
}

const SELECTED_IDX = Object.fromEntries(KEYS.map((k, i) => [k, i])) as Record<MuddatKey, number>;

/**
 * Hisobot holati ("22.10.2026-yil 09:00 holatiga") — sahifada tahrirlanadi, hammaga umumiy: MuddatHolat!A1 = "yyyy-MM-ddTHH:mm".
 * Muddatlar shu sana bo'yicha hisoblanadi (soat — faqat yozuv). Kiritilmagan bo'lsa — bugun 09:00.
 */
const HOLAT_SHEET = "MuddatHolat";
export const HOLAT_RE = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}$/;

async function loadHolat(fresh: boolean): Promise<string | null> {
  return cached<string | null>(
    `${KEY}holat`,
    TTL(),
    async () => {
      if (MOCK || !config.muddatSheetId) return null;
      // Varaq yo'q bo'lsa gviz birinchi varaqni qaytaradi — qiymat formatga mos kelmaydi → null
      const rows = await fetchGvizCsv(config.muddatSheetId, HOLAT_SHEET, { range: "A1" }).catch(() => []);
      const v = String(rows[0]?.[0] ?? "").trim();
      return HOLAT_RE.test(v) ? v : null;
    },
    { fresh }
  );
}

export async function saveHolat(value: string) {
  if (!HOLAT_RE.test(value)) throw new Error("Sana/vaqt noto'g'ri");
  if (MOCK) throw new Error("Demo rejimida saqlanmaydi");
  await setMuddatHolat(config.muddatSheetId, value);
  invalidate(`${KEY}holat`);
}

const iso = (d: number) => new Date(d).toISOString().slice(0, 10);

export type MuddatResult = { svod: MuddatSvod; arizalar: MuddatAriza[]; today: number; holat: string; empty: boolean };

export async function loadMuddat(fresh = false): Promise<MuddatResult> {
  const [raw, saved] = await Promise.all([loadRaw(fresh), loadHolat(fresh)]);
  const m = saved?.match(HOLAT_RE);
  const today = m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : todayTashkent();
  const arizalar = toArizalar(raw, SELECTED_IDX, today);
  return { svod: buildSvod(arizalar), arizalar, today, holat: saved ?? `${iso(today)}T09:00`, empty: raw.length === 0 };
}

export const invalidateMuddat = () => invalidate(KEY);
