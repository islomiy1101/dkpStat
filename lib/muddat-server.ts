import { config } from "./config";
import { MOCK } from "./mock";
import { cached, invalidate } from "./cache";
import { fetchGvizCsv } from "./gviz";
import { colLetter } from "@/features/deadline/source";
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
      let idx: Record<MuddatKey, number>;
      try {
        idx = locateMuddatColumns(head).idx;
      } catch (e) {
        throw new Error(`"${MUDDAT_SHEET}" varag'i: ${(e as Error).message}. Bazani qayta yuklang.`);
      }
      const rows = await fetchGvizCsv(id, MUDDAT_SHEET, { tq: `select ${KEYS.map((k) => colLetter(idx[k])).join(",")}` });
      // Tanlangan ustunlar KEYS tartibida keladi; sarlavha qatorigacha bo'lgan qatorlar tashlanadi
      const h = locateMuddatColumns(rows.slice(0, 3)).headerRow;
      return rows.slice(h + 1);
    },
    { fresh }
  );
}

const SELECTED_IDX = Object.fromEntries(KEYS.map((k, i) => [k, i])) as Record<MuddatKey, number>;

export type MuddatResult = { svod: MuddatSvod; arizalar: MuddatAriza[]; today: number; empty: boolean };

export async function loadMuddat(fresh = false): Promise<MuddatResult> {
  const raw = await loadRaw(fresh);
  const today = todayTashkent();
  const arizalar = toArizalar(raw, SELECTED_IDX, today);
  return { svod: buildSvod(arizalar), arizalar, today, empty: raw.length === 0 };
}

export const invalidateMuddat = () => invalidate(KEY);
