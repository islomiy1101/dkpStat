import type { ReceptionMurojaat } from "@/lib/types";
import { avg, buildCommon, isEmpty, mahallaRows, qabulDaqiqa, sanaKey, sortByCount, tumanOf, type CommonStats } from "@/lib/analytics";

/**
 * "Filial qabulxonasi" analitikasi: umumiy ko'rsatkichlar (lib/analytics.ts) + qabulxonaga xos
 * qismlar — qayta murojaat, hozir qabulda, xodimlar reytingi va ma'lumot sifati.
 */
export * from "@/lib/analytics";

export type XodimRow = { fio: string; lavozim: string; tuman: string; count: number; avgMin: number | null };

export type ReceptionStats = CommonStats & {
  qabulda: number;
  qayta: number;
  xodimlar: XodimRow[];
  sifat: { passport: number; telefon: number; bosh: number; ketdiYoq: number };
};

export function buildStats(list: ReceptionMurojaat[], today: string, start: string | null): ReceptionStats {
  const common = buildCommon(list, today, start);
  const total = list.length;
  const share = (n: number) => (total ? n / total : 0);

  const xod = new Map<string, XodimRow & { mins: number[] }>();
  let qabulda = 0, qayta = 0, passport = 0, telefon = 0, ketdiYoq = 0;

  for (const m of list) {
    if (!m.ketdi) {
      ketdiYoq++;
      if (sanaKey(m.sana) === today) qabulda++;
    }
    if (m.qaytaMurojaat > 1) qayta++;

    const p = String(m.passport || "").replace(/\s/g, "").toUpperCase();
    if (/^[A-Z]{2}\d{7}$/.test(p)) passport++;
    else if (/^\+?\d{9,12}$/.test(p)) telefon++;

    if (!isEmpty(m.qabulQildi)) {
      const tName = tumanOf(m.tuman);
      const key = `${tName}|${m.qabulQildi.trim().toUpperCase()}`;
      const e = xod.get(key) || { fio: m.qabulQildi.trim(), lavozim: m.lavozim, tuman: tName, count: 0, avgMin: null, mins: [] };
      e.count++;
      const d = qabulDaqiqa(m.keldi, m.ketdi);
      if (d !== null) e.mins.push(d);
      xod.set(key, e);
    }
  }

  return {
    ...common,
    qabulda,
    qayta,
    xodimlar: sortByCount([...xod.values()].map(({ mins, ...x }) => ({ ...x, avgMin: avg(mins) }))).slice(0, 10),
    sifat: { passport: share(passport), telefon: share(telefon), bosh: share(total - passport - telefon), ketdiYoq },
  };
}

/** Excel uchun: barcha mahallalar (top emas), tuman bo'yicha tartiblangan */
export function allMahallalar(list: ReceptionMurojaat[]) {
  return mahallaRows(list).sort((a, b) => a.tuman.localeCompare(b.tuman) || b.count - a.count);
}
