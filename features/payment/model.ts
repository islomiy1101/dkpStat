import type { PaymentData } from "@/lib/types";

export const MONTH_NAMES: Record<number, string> = {
  0: "Yanvar", 1: "Fevral", 2: "Mart", 3: "Aprel", 4: "May", 5: "Iyun",
  6: "Iyul", 7: "Avgust", 8: "Sentyabr", 9: "Oktyabr", 10: "Noyabr", 11: "Dekabr",
};

export type SrcKey = "dxm" | "yaidxp" | "notarius" | "agroportal" | "";
export type PeriodKey = "m1" | "m3" | "m6" | "m12" | "y1";

export type WaitingApp = {
  district: string; appNumber: string; trx: string; client: string; phone: string;
  source: string; engineer: string; issueDate: string; srcKey: SrcKey; periodKey: PeriodKey;
};
export type PaidApp = {
  district: string; appNumber: string; trx: string; client: string; phone: string; source: string;
  engineer: string; paidDate: string; kadastr: number; registratsiya: number; manzil: number; totalPaid: number;
};
export type Money = { total: number; kadastr: number; registratsiya: number; manzil: number };
export type EngPaid = Money & { apps: PaidApp[] };
export type DistPaid = Money & { engineers: Record<string, EngPaid> };
export type Counts = { jami: number; dxm: number; yaidxp: number; notarius: number; agroportal: number };

export const zeroCounts = (): Counts => ({ jami: 0, dxm: 0, yaidxp: 0, notarius: 0, agroportal: 0 });
export const zeroMoney = (): Money => ({ total: 0, kadastr: 0, registratsiya: 0, manzil: 0 });

export function getSourceKey(src: string): SrcKey {
  const s = (src || "").toUpperCase();
  if (s.includes("DXM")) return "dxm";
  if (s.includes("YAIDXP") || s.includes("YAID")) return "yaidxp";
  if (s.includes("NOTARIUS")) return "notarius";
  if (s.includes("AGRO")) return "agroportal";
  return "";
}

export function parseDate(dateVal: unknown): Date | null {
  if (!dateVal) return null;
  if (dateVal instanceof Date) return dateVal;
  const s = String(dateVal).trim();
  if (s.includes("/")) {
    const p = s.split("/");
    if (p.length === 3) return new Date(+p[2], +p[1] - 1, +p[0]);
  } else if (s.includes(".")) {
    const p = s.split(".");
    if (p.length === 3) return new Date(+p[2], +p[1] - 1, +p[0]);
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function getPeriodKey(dateVal: unknown): PeriodKey {
  const d = parseDate(dateVal);
  if (!d) return "m1";
  const diffDays = Math.ceil(Math.abs(Date.now() - d.getTime()) / 86_400_000);
  if (diffDays <= 30) return "m1";
  if (diffDays <= 90) return "m3";
  if (diffDays <= 180) return "m6";
  if (diffDays <= 365) return "m12";
  return "y1";
}

export function formatDateStr(dateVal: unknown) {
  const d = parseDate(dateVal);
  if (!d) return dateVal ? String(dateVal) : "—";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

export const fmtMoney = (val: number) => (!val ? "—" : Math.round(val).toLocaleString());

export function getInitials(name: string) {
  if (!name || name === "Регистрация") return "Р";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

const isAggregateName = (d: string) => {
  const s = d.toLowerCase();
  return s.includes("viloyat") || s.includes("вилоят") || s.includes("jami") || s.includes("жами");
};

/** Original loadData() dagi qayta ishlash */
export function processPayment(data: PaymentData | null) {
  const waiting: WaitingApp[] = [];
  const paid: Record<string, Record<string, DistPaid>> = {};
  const monthsSet = new Set<string>();
  const plan = data?.plan || {};

  for (const r of data?.rows || []) {
    const { district, appNumber, trx, client, phone, source, engineer, issueDate, status, paidDateRaw } = r;
    const totalPaid = r.kadastr + r.registratsiya + r.manzil;
    if (status.includes("kutilmoqda") || !status.includes("to'langan")) {
      waiting.push({ district, appNumber, trx, client, phone, source, engineer, issueDate, srcKey: getSourceKey(source), periodKey: getPeriodKey(issueDate) });
    } else {
      const pDate = parseDate(paidDateRaw);
      let monthName = "Boshqa oy";
      if (pDate) {
        monthName = MONTH_NAMES[pDate.getMonth()] || "Boshqa";
        monthsSet.add(monthName);
      }
      paid[monthName] ??= {};
      const dObj = (paid[monthName][district] ??= { ...zeroMoney(), engineers: {} });
      dObj.total += totalPaid; dObj.kadastr += r.kadastr; dObj.registratsiya += r.registratsiya; dObj.manzil += r.manzil;
      const eObj = (dObj.engineers[engineer] ??= { ...zeroMoney(), apps: [] });
      eObj.total += totalPaid; eObj.kadastr += r.kadastr; eObj.registratsiya += r.registratsiya; eObj.manzil += r.manzil;
      eObj.apps.push({ district, appNumber, trx, client, phone, source, engineer, paidDate: paidDateRaw, kadastr: r.kadastr, registratsiya: r.registratsiya, manzil: r.manzil, totalPaid });
    }
  }
  return { waiting, paid, months: Array.from(monthsSet), plan };
}

export type Processed = ReturnType<typeof processPayment>;

/** Original renderTableBody() dagi hisob-kitoblar (filtrlar bilan) */
export function buildView(p: Processed, selectedSources: Set<string>, selectedPeriods: Set<string>) {
  const totalStats = zeroCounts();
  const periodStats: Record<PeriodKey, number> = { m1: 0, m3: 0, m6: 0, m12: 0, y1: 0 };
  for (const app of p.waiting) {
    totalStats.jami++;
    if (app.srcKey) totalStats[app.srcKey]++;
    if (periodStats[app.periodKey] !== undefined) periodStats[app.periodKey]++;
  }

  const filtered = p.waiting.filter(
    (a) => (selectedSources.size === 0 || selectedSources.has(a.srcKey)) && (selectedPeriods.size === 0 || selectedPeriods.has(a.periodKey))
  );

  type EngW = { totals: Counts; apps: WaitingApp[] };
  const waitingSummary: Record<string, { totals: Counts; engineers: Record<string, EngW> }> = {};
  const grandWaiting = zeroCounts();
  for (const app of filtered) {
    const d = (waitingSummary[app.district] ??= { totals: zeroCounts(), engineers: {} });
    const e = (d.engineers[app.engineer] ??= { totals: zeroCounts(), apps: [] });
    grandWaiting.jami++;
    if (app.srcKey) grandWaiting[app.srcKey]++;
    d.totals.jami++;
    if (app.srcKey) d.totals[app.srcKey]++;
    e.totals.jami++;
    if (app.srcKey) e.totals[app.srcKey]++;
    e.apps.push(app);
  }

  const districtNames = Array.from(new Set([...Object.keys(waitingSummary), ...Object.keys(p.plan)]))
    .filter((d) => !isAggregateName(d))
    .sort();

  let grandPlan = 0;
  districtNames.forEach((d) => (grandPlan += p.plan[d] || 0));

  const grandMonth: Record<string, Money> = {};
  for (const m of p.months) {
    const g = (grandMonth[m] = zeroMoney());
    for (const d of districtNames) {
      const x = p.paid[m]?.[d];
      if (x) { g.total += x.total; g.kadastr += x.kadastr; g.registratsiya += x.registratsiya; g.manzil += x.manzil; }
    }
  }

  const engineerNamesFor = (districtName: string) => {
    const set = new Set(Object.keys(waitingSummary[districtName]?.engineers || {}));
    for (const m of p.months) Object.keys(p.paid[m]?.[districtName]?.engineers || {}).forEach((e) => set.add(e));
    return Array.from(set).sort((a, b) => (a === "Регистрация" ? 1 : b === "Регистрация" ? -1 : a.localeCompare(b)));
  };

  return { totalStats, periodStats, waitingSummary, grandWaiting, districtNames, grandPlan, grandMonth, engineerNamesFor };
}
