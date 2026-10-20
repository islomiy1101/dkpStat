import type { Murojaat } from "@/lib/types";
import { buildCommon, tumanOf, type CommonStats } from "@/lib/analytics";
import { TUMANLAR, isFilial, isIjobiy, isVakolatsiz } from "./utils";

/**
 * "Maslahat burchagi" analitikasi: umumiy ko'rsatkichlar (lib/analytics.ts) + ko'rilgan chora
 * (ijobiy / filialga / vakolatsiz / hali chora ko'rilmagan) va shaxs turi (yuridik / jismoniy).
 */

export type NatijaKey = "ijobiy" | "filial" | "vakolatsiz" | "kutilmoqda";
export const NATIJA_SEGMENTS: { key: NatijaKey; label: string; color: string }[] = [
  { key: "ijobiy", label: "Ijobiy hal etildi", color: "#1baf7a" },
  { key: "filial", label: "Filialga yo'naltirildi", color: "#eda100" },
  { key: "vakolatsiz", label: "Vakolatiga kirmaydi", color: "#eb6834" },
  { key: "kutilmoqda", label: "Chora ko'rilmagan", color: "#c3c2b7" },
];
export const SHAXS_SEGMENTS = [
  { key: "jismoniy", label: "Jismoniy shaxs", color: "#2a78d6" },
  { key: "yuridik", label: "Yuridik shaxs", color: "#6250d6" },
];

export const natijaOf = (m: Murojaat): NatijaKey =>
  isIjobiy(m) ? "ijobiy" : isFilial(m) ? "filial" : isVakolatsiz(m) ? "vakolatsiz" : "kutilmoqda";

const isYuridik = (m: Murojaat) => m.shaxsTuri == 1 || m.shaxsTuri === "Yuridik";

export type AdviceStats = CommonStats & {
  natija: Record<NatijaKey, number>;
  tumanNatija: { key: string; label: string; parts: Record<NatijaKey, number> }[];
  shaxs: { jismoniy: number; yuridik: number };
  ketdiYoq: number;
};

export function buildAdviceStats(list: Murojaat[], today: string, start: string | null, end = today): AdviceStats {
  const common = buildCommon(list, today, start, end);
  const zero = (): Record<NatijaKey, number> => ({ ijobiy: 0, filial: 0, vakolatsiz: 0, kutilmoqda: 0 });
  const natija = zero();
  const byTuman = new Map<string, Record<NatijaKey, number>>(TUMANLAR.map((t) => [t, zero()]));
  const shaxs = { jismoniy: 0, yuridik: 0 };
  let ketdiYoq = 0;

  for (const m of list) {
    const n = natijaOf(m);
    natija[n]++;
    const t = tumanOf(m.tuman);
    if (!byTuman.has(t)) byTuman.set(t, zero());
    byTuman.get(t)![n]++;
    if (isYuridik(m)) shaxs.yuridik++;
    else shaxs.jismoniy++;
    if (!m.ketdi) ketdiYoq++;
  }

  // Tumanlar tartibi umumiy "tumanlar" reytingi bilan bir xil (ko'pidan kamiga)
  const tumanNatija = common.tumanlar.map((t) => ({ key: t.name, label: t.name, parts: byTuman.get(t.name) || zero() }));
  return { ...common, natija, tumanNatija, shaxs, ketdiYoq };
}
