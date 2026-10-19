import type { DeadlineData, RoleStats } from "@/lib/types";

export type SectionDef = {
  id: "manba" | "filial" | "boshqarma" | "dkp" | "agentlik";
  title: string;
  themeClass: string;
  isSingleCol: boolean;
  roles: string[];
};

export const SECTIONS: SectionDef[] = [
  { id: "manba", title: "Ariza manbasi", themeClass: "theme-manba", isSingleCol: true, roles: ["Agroportal", "Davreestr", "DXM", "E-ijara", "E'tirof", "Kadastr muhandisi", "Migratsiya", "Notarius", "Reestr MKD", "UZKAD", "YaIDXP", "Yer-elektron"] },
  { id: "filial", title: "FILIAL", themeClass: "theme-filial", isSingleCol: false, roles: ["Filial boʼlimi boshligʼi", "Filial bosh muhandisi", "Inventarizatsiya muhandisi", "Filial topograf", "Filial DKYaT", "Filial balans inspektori", "Arxivchi", "Tizim", "Filial Jami"] },
  { id: "boshqarma", title: "BOSHQARMA", themeClass: "theme-boshqarma", isSingleCol: false, roles: ["Boshqarma topograf", "Boshqarma bino-inshootlar (soliq)", "Boshliq o'rinbosari", "Bosh ro'yxatdan o'tkazuvchi", "Bino-inshootlar", "Roʼyxatdan oʼtkazuvchi", "BOSHQARMA JAMI KUNLAR"] },
  { id: "dkp", title: "DAVLAT KADASTRLARI PALATASI", themeClass: "theme-dkp", isSingleCol: false, roles: ["DKP yer bo'limi", "DKP ro'yxatdan o'tkazuvchisi", "DKP Topograf", "DKP bino-inshootlar", "DKP JAMI KUNLAR"] },
  { id: "agentlik", title: "KADASTR AGENTLIGI", themeClass: "theme-agentlik", isSingleCol: false, roles: ["FMMI"] },
];

export const SUB_COLS = ["Ariza soni", "1-kun", "2-kun", "3-kun", "4-kun", "5-kun", "6-10-kun", "11+ kun"];
export const DAY_KEYS: (keyof RoleStats)[] = ["arizaSoni", "day1", "day2", "day3", "day4", "day5", "day6_10", "day11_plus"];

export const DISTRICTS = [
  { no: 1, name: "Kosonsoy tumani" }, { no: 2, name: "Mingbuloq tumani" }, { no: 3, name: "Namangan tumani" },
  { no: 4, name: "Namangan shahar" }, { no: 5, name: "Norin tumani" }, { no: 6, name: "Pop tumani" },
  { no: 7, name: "To'raqo'rg'on tumani" }, { no: 8, name: "Uychi tumani" }, { no: 9, name: "Uchqo'rg'on tumani" },
  { no: 10, name: "Chortoq tumani" }, { no: 11, name: "Chust tumani" }, { no: 12, name: "Yangiqo'rg'on tumani" },
];

/** Jadval qatorlari: birinchi "Viloyat jami", keyin tumanlar */
export const ROWS = [{ no: "-", name: "Viloyat jami", isJami: true }, ...DISTRICTS.map((d) => ({ no: String(d.no), name: d.name, isJami: false }))];

export function slugify(text: string) {
  return text.toLowerCase().replace(/['`ʻ’‘ʼ]/g, "").replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function roleDisplayName(role: string, secId: string) {
  const isJami = role.toLowerCase().includes("jami");
  if (!isJami && secId !== "manba" && !role.toLowerCase().includes("kunlar")) return role + "da turgan kunlar";
  return role;
}

export type DrillCtx = { tuman: string; manba?: string | null; role?: string; day?: string };
export type Cell = { value: number; ctx: DrillCtx | null; expired: boolean };
/** Bitta qator uchun barcha kataklar: kalit = "cell-<slug>-<idx>" yoki "cell-sec-total-<secId>" */
export type RowCells = Record<string, Cell>;

const cleanKey = (s: string) => s.toLowerCase().replace(/['`ʻ’ʼ\s]/g, "");
const zero: Cell = { value: 0, ctx: null, expired: false };

/**
 * Original applyDashboardData() mantiqi — DOM o'rniga katak qiymatlari xaritasini qaytaradi.
 */
export function computeTable(summary: DeadlineData | null, manbaFilters: string[]) {
  const result: Record<string, RowCells> = {};
  const hasData: Record<string, boolean> = {};
  for (const r of ROWS) result[r.name] = {};
  if (!summary) return { result, hasData };

  for (const regionName of Object.keys(summary)) {
    const row = ROWS.find((r) => cleanKey(r.name) === cleanKey(regionName));
    if (!row) continue;
    const cells = result[row.name];
    hasData[row.name] = true;
    const regionData = summary[regionName];
    const set = (key: string, value: unknown, ctx: DrillCtx | null = null, expired = false) => {
      const v = Number(value || 0);
      cells[key] = { value: v, ctx: v > 0 ? ctx : null, expired: expired && v > 0 };
    };

    // 1. Manbalar
    if (regionData.manbalar) {
      for (const mSlug of Object.keys(regionData.manbalar)) {
        let count = regionData.manbalar[mSlug];
        if (manbaFilters.length > 0 && !manbaFilters.includes(mSlug)) count = 0;
        set(`cell-${mSlug}-0`, count, count > 0 ? { tuman: regionName, manba: mSlug } : null);
      }
    }

    // 2. Rollar va kunlar
    if (regionData.rollar) {
      for (const roleSlug of Object.keys(regionData.rollar)) {
        let stats: RoleStats = regionData.rollar[roleSlug];
        const isExcludedBoshqarmaRole = roleSlug.includes("bosh-royxatdan-otkazuvchi") || roleSlug.includes("royxatdan-otkazuvchi");

        if (manbaFilters.length > 0) {
          const agg: Required<RoleStats> = { arizaSoni: 0, day1: 0, day2: 0, day3: 0, day4: 0, day5: 0, day6_10: 0, day11_plus: 0 };
          for (const mSlug of manbaFilters) {
            const s = regionData.byManba?.[mSlug]?.rollar?.[roleSlug];
            if (s) for (const k of DAY_KEYS) agg[k] += Number(s[k]) || 0;
          }
          stats = agg;
        }
        const ctxM = manbaFilters.length > 0 ? manbaFilters.join(",") : null;
        DAY_KEYS.forEach((day, idx) => {
          const highlight = idx >= 6 && !isExcludedBoshqarmaRole;
          set(`cell-${roleSlug}-${idx}`, stats[day], { tuman: regionName, role: roleSlug, day, manba: ctxM }, highlight);
        });
      }
    }

    // 3. Bo'lim jami
    for (const sec of SECTIONS) {
      let total = 0;
      for (const role of sec.roles) {
        if (role.toLowerCase().includes("jami")) continue;
        const roleSlug = slugify(role);
        if (sec.id === "manba") {
          if (regionData.manbalar && regionData.manbalar[roleSlug] !== undefined) {
            if (manbaFilters.length === 0 || manbaFilters.includes(roleSlug)) total += Number(regionData.manbalar[roleSlug]) || 0;
          }
        } else {
          const stats = regionData.rollar ? regionData.rollar[roleSlug] : null;
          if (manbaFilters.length > 0 && regionData.byManba) {
            for (const mSlug of manbaFilters) total += Number(regionData.byManba[mSlug]?.rollar?.[roleSlug]?.arizaSoni) || 0;
          } else if (stats) {
            total += Number(stats.arizaSoni) || 0;
          }
        }
      }
      cells[`cell-sec-total-${sec.id}`] = { value: total, ctx: null, expired: false };
    }
  }
  return { result, hasData };
}

export const getCell = (cells: RowCells, key: string) => cells[key] || zero;
export const fmtNum = (v: number) => Number(v || 0).toLocaleString();
