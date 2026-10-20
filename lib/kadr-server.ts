import { config } from "./config";
import { cached, invalidate } from "./cache";
import { fetchSheetCsvByName } from "./gviz";
import { MOCK, readMock } from "./mock";
import { KADR_SHEET, parseKadr, type KadrRow } from "@/features/kadr/model";

/**
 * "Kadrlar statistikasi": "Shtat" varag'i (Bazaga yuklash orqali yoziladi, kuniga ko'pi bilan bir necha marta) — kesh uzoq,
 * yuklashda tozalanadi. MOCK — mock/kadr_shtat.json yoki demo yuklangan fayl (xotirada).
 */
const KEY = "kadr:";
const TTL = Math.max(config.cacheTtlMs, config.deadlineCacheTtlMs);

type MockState = { uploaded: unknown[][] | null };
const mock: MockState = ((globalThis as { __dkpKadrMock?: MockState }).__dkpKadrMock ??= { uploaded: null });

/** Demo: yuklangan varaqni xotirada saqlash (Sheets'ga yozilmaydi) */
export function mockSetKadr(values: unknown[][]) {
  mock.uploaded = values;
}

export async function loadKadr(fresh = false): Promise<{ rows: KadrRow[]; uploadedAt: string }> {
  return cached(`${KEY}rows`, TTL, async () => {
    if (MOCK) return parseKadr(mock.uploaded ?? (await readMock<unknown[][]>("kadr_shtat")));
    if (!config.kadrSheetId) return { rows: [], uploadedAt: "" };
    try {
      return parseKadr(await fetchSheetCsvByName(config.kadrSheetId, KADR_SHEET));
    } catch (e) {
      // Varaq hali yaratilmagan / yuklanmagan — sahifa "ma'lumot yuklanmagan" kartasini ko'rsatadi
      // ("havola orqali ko'rish" yoqilmagani esa haqiqiy xato — ko'rsatiladi)
      if (/topilmadi \(mavjud/.test((e as Error).message)) return { rows: [], uploadedAt: "" };
      throw e;
    }
  }, { fresh });
}

export const invalidateKadr = () => invalidate(KEY);
