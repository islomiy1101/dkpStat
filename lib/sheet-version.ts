import { config } from "./config";
import { MOCK } from "./mock";
import { cached, invalidate } from "./cache";
import { sheetVersions } from "./auth-server";

/**
 * Jadval "versiyasi" — Google Drive'dagi oxirgi o'zgarish vaqti. Sheets'da qo'lda tahrirlansa ham, "Bazaga yuklash"
 * orqali yozilsa ham o'zgaradi. Server keshi har bir nusxaning (Netlify serverless) o'z xotirasida — shu sabab har bir
 * nusxa ma'lumot berishdan oldin versiyani tekshiradi (syncSection) va o'zgargan bo'lsa bo'lim keshini tozalaydi.
 * Versiyalar bitta Apps Script so'rovi bilan olinadi va 10 soniya keshlanadi.
 * Apps Script eski versiyada / xato bo'lsa — versiya yo'q, kesh avvalgidek TTL bo'yicha ishlaydi.
 */
export type VersionSection = "kadr" | "deadline" | "muddat" | "etirof" | "xatlov" | "payment" | "regtest";

const SECTION_SHEETS = (): Record<VersionSection, string[]> => ({
  kadr: [config.kadrSheetId],
  deadline: [config.deadlineSheetId],
  muddat: [config.muddatSheetId],
  etirof: Object.values(config.etirofSheets),
  xatlov: [config.xatlovSheetId],
  payment: [config.paymentSheetId],
  regtest: [config.regtestSheetId],
});

const VERSION_TTL = 10_000;
/**
 * Xato bo'lsa (Apps Script eski versiyada, tarmoq uzilishi) Apps Script har so'rovda chaqirilmasin.
 * Qisqa: serverless nusxa "muzlab" so'rov uzilsa ham, versiya kuzatuvi uzoq to'xtab qolmasin.
 */
const ERROR_TTL = 60_000;
/**
 * Ma'lumot so'rovi versiyani shundan ko'p kutmaydi (Apps Script 1–4 s javob beradi) — so'rov fonda davom etib keshga
 * yoziladi; o'zgarishni ochiq sahifaning /api/versions so'rovi baribir sezadi va bo'limni fresh yuklaydi.
 */
const SYNC_WAIT_MS = 1_500;

export type Versions = Partial<Record<VersionSection, string>>;

export function loadVersions(): Promise<Versions> {
  return cached<Versions>(
    "ver:all",
    (v) => (Object.keys(v).length ? VERSION_TTL : ERROR_TTL),
    async () => {
      if (MOCK) return {};
      const sheets = SECTION_SHEETS();
      const ids = [...new Set(Object.values(sheets).flat().map((s) => s.trim()).filter(Boolean))];
      if (!ids.length) return {};
      try {
        const got = await sheetVersions(ids);
        const out: Versions = {};
        for (const [sec, list] of Object.entries(sheets) as [VersionSection, string[]][]) {
          const vs = list.map((id) => got[id.trim()]).filter((v): v is number => typeof v === "number");
          if (vs.length) out[sec] = String(Math.max(...vs));
        }
        return out;
      } catch (e) {
        console.error("[sheet-version] versiyalarni olib bo'lmadi:", (e as Error).message);
        return {};
      }
    }
  );
}

/** Nusxa ko'rgan oxirgi versiyalar (dev'da HMR'dan keyin ham saqlanadi) */
const seen: Map<VersionSection, string> = ((globalThis as { __dkpSeenVersions?: Map<VersionSection, string> }).__dkpSeenVersions ??= new Map());

/**
 * Bo'lim jadvali o'zgargan bo'lsa (shu nusxa oxirgi ko'rgandan beri) — keshi (prefix) tozalanadi.
 * Birinchi ko'rishda ham tozalanadi: odatda kesh bo'sh, lekin versiya avval olinmagan paytda to'ldirilgan bo'lishi mumkin.
 */
export async function syncSection(section: VersionSection, prefix: string) {
  const all = await Promise.race([loadVersions(), new Promise<Versions>((r) => setTimeout(() => r({}), SYNC_WAIT_MS))]);
  const v = all[section];
  if (!v || seen.get(section) === v) return;
  seen.set(section, v);
  invalidate(prefix);
}
