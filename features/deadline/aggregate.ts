import type { DeadlineData, RegionSummary, RoleStats } from "@/lib/types";
import { slugify } from "./model";

/**
 * "Rollar kesimida tahlil" — avval Django hisoblardi, endi Google Sheets'dagi xom qatorlardan
 * shu yerda (serverda) hisoblanadi. Har bir qator: bitta ariza bitta rolda necha kun turgani
 * (keng jadvaldan source.ts → toDeadlineRows orqali olinadi).
 */
export type DeadlineRow = { ariza: string; tranz: string; tuman: string; manba: string; rol: string; vaqt: string; kun: number };
export const VILOYAT_JAMI = "Viloyat jami";

type DayKey = Exclude<keyof RoleStats, "arizaSoni">;
export function dayKey(kun: number): DayKey {
  if (kun <= 1) return "day1";
  if (kun <= 5) return `day${Math.floor(kun)}` as DayKey;
  if (kun <= 10) return "day6_10";
  return "day11_plus";
}

const emptyStats = (): Required<RoleStats> => ({ arizaSoni: 0, day1: 0, day2: 0, day3: 0, day4: 0, day5: 0, day6_10: 0, day11_plus: 0 });

function addRow(region: RegionSummary, seen: Set<string>, r: DeadlineRow, mSlug: string, rSlug: string) {
  region.manbalar ??= {};
  region.rollar ??= {};
  region.byManba ??= {};
  // Manba bo'yicha ariza bir marta sanaladi (bitta ariza bir nechta rolda bo'lishi mumkin)
  // Varaqda har bir qator — bitta tranzaksiya; "Ariza raqami" takrorlanishi (yoki bo'sh bo'lishi) mumkin
  const id = r.tranz || r.ariza;
  if (!seen.has(id)) {
    seen.add(id);
    region.manbalar[mSlug] = (region.manbalar[mSlug] || 0) + 1;
  }
  const bump = (s: RoleStats) => {
    s.arizaSoni = (s.arizaSoni || 0) + 1;
    const k = dayKey(r.kun);
    s[k] = (s[k] || 0) + 1;
  };
  bump((region.rollar[rSlug] ??= emptyStats()));
  const bm = (region.byManba[mSlug] ??= { rollar: {} });
  bump((bm.rollar![rSlug] ??= emptyStats()));
}

/** Django /summary/ javobi bilan bir xil tuzilma: { [tuman]: RegionSummary } + "Viloyat jami" */
export function buildSummary(rows: DeadlineRow[]): DeadlineData {
  const out: DeadlineData = {};
  const seen = new Map<string, Set<string>>();
  for (const r of rows) {
    const mSlug = slugify(r.manba);
    const rSlug = slugify(r.rol);
    for (const name of [r.tuman, VILOYAT_JAMI]) {
      if (!seen.has(name)) seen.set(name, new Set());
      addRow((out[name] ??= {}), seen.get(name)!, r, mSlug, rSlug);
    }
  }
  return out;
}

export type DetailFilter = { tuman?: string | null; manba?: string | null; role?: string | null; day?: string | null };

const cleanKey = (s: string) => s.toLowerCase().replace(/['`ʻ’ʼ\s]/g, "");

/** Drilldown: model.ts → DrillCtx parametrlari (manba — vergul bilan ajratilgan slug'lar bo'lishi mumkin) */
export function filterDetails(rows: DeadlineRow[], f: DetailFilter) {
  const tuman = f.tuman && cleanKey(f.tuman) !== cleanKey(VILOYAT_JAMI) ? cleanKey(f.tuman) : null;
  const manbalar = f.manba ? f.manba.split(",").filter(Boolean) : null;
  const day = f.day && f.day !== "arizaSoni" ? f.day : null;
  return rows.filter(
    (r) =>
      (!tuman || cleanKey(r.tuman) === tuman) &&
      (!manbalar || manbalar.includes(slugify(r.manba))) &&
      (!f.role || slugify(r.rol) === f.role) &&
      (!day || dayKey(r.kun) === day)
  );
}

/** Drilldown jadvali va Excel eksporti uchun (Django /details/ formati) */
export const DETAIL_HEADERS = ["№", "Ariza raqami", "Tranzaksiya raqami", "Tuman", "Manba", "Rol", "Rolda turgan vaqt", "Kun"];
export const detailRows = (rows: DeadlineRow[]) => rows.map((r, i) => [i + 1, r.ariza, r.tranz, r.tuman, r.manba, r.rol, r.vaqt, r.kun]);
