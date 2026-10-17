// ---------- Payment (To'lov kutilmoqda) ----------
export type PaymentRow = {
  district: string;
  appNumber: string;
  trx: string;
  client: string;
  phone: string;
  source: string;
  engineer: string;
  issueDate: string;
  status: string;
  paidDateRaw: string;
  kadastr: number;
  registratsiya: number;
  manzil: number;
};
export type PaymentData = { plan: Record<string, number>; rows: PaymentRow[] };

// ---------- Advice (Kadastr maslahat burchagi) ----------
export type Natija = "" | "ijobiy" | "filial" | "vakolatsiz";
export type Murojaat = {
  rowNum: number;
  id: number;
  shaxsTuri: number | string;
  tel: string;
  fio: string;
  tuman: string;
  manzil: string;
  keldi: string;
  ketdi: string;
  maqsad: string;
  sana: string;
  ijobiy: unknown;
  filial: unknown;
  vakolatsiz: unknown;
  natija: Natija;
};
export type AdviceData = {
  murojaatlar: Murojaat[];
  mahallalar: string[];
  masullar: Record<string, string>;
};
export type AdviceSessionInfo = { tuman: string; fio: string; loginTime: number };

// ---------- Deadline (Rollar kesimida tahlil) ----------
export type RoleStats = {
  arizaSoni?: number; day1?: number; day2?: number; day3?: number; day4?: number;
  day5?: number; day6_10?: number; day11_plus?: number;
};
export type RegionSummary = {
  manbalar?: Record<string, number>;
  rollar?: Record<string, RoleStats>;
  byManba?: Record<string, { rollar?: Record<string, RoleStats> }>;
};
export type DeadlineData = Record<string, RegionSummary>;
