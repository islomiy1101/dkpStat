import { sameBranch } from "./roles";
import { TUMANLAR, cyrillicToLatin } from "@/features/advice/utils";

/**
 * Murojaatlar analitikasi uchun umumiy sof funksiyalar ("Filial qabulxonasi" va "Maslahat burchagi").
 * Jadvallardagi maqsad va manzil (mahalla) erkin matn, lotin/kirill aralash — shuning uchun avval
 * lotinga o'giriladi, so'ng kalit so'z / normallashtirilgan kalit bo'yicha guruhlanadi.
 */

/** Ikkala bo'limda ham bor maydonlar */
export type BaseMurojaat = { sana: string; keldi: string; ketdi: string; tuman: string; maqsad: string; manzil: string };

/* ---------- matn normallashtirish ---------- */

/** Kirill → lotin, kichik harf, apostrof va ortiqcha belgilarsiz */
export function plain(text: unknown) {
  return cyrillicToLatin(String(text ?? ""))
    .toLowerCase()
    .replace(/[`'ʻʼ’‘"]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const capFirst = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const isEmpty = (s: unknown) => !s || /^mavjud emas$/i.test(String(s).trim());

/* ---------- murojaat turlari ---------- */

/** Tartib muhim: birinchi mos kelgan tur olinadi. Yangi tur — shu massivga bitta qator. */
export const MAQSAD_TURLARI: { name: string; test: RegExp }[] = [
  { name: "Xatlov / 937-son qaror", test: /xatlov|hatlov|937|etirof|e tirof|qaror|karor/ },
  { name: "Auksion", test: /auks|aukts|aukc|auktsion/ },
  { name: "Kadastr raqami", test: /(kadas|kadsatr).*(raqam|rakam)|(raqam|rakam).*(kadas)/ },
  { name: "Kadastr hujjati", test: /kadas|kdastr|kadsatr|kadastr|hujjat|xujjat|xujat|hujat|pasport|texpasport|tex pasport/ },
  { name: "Yer masalasi", test: /\byer\b|\ber\b|\byerni|\byerini|\berni|dehqon|dexqon|\bbog\b|bog masala|nizoli|kontur|sotix|sotx|\bf x\b|fermer|ijara|tomorqa|tomorka|uchastka|uchstka/ },
  { name: "Davlat ro'yxati va mulk huquqi", test: /royxat|ruyxat|ruyhat|royhat|mulk|egalik|rasmiylashtir|uzkad|uy joy|uy-joy|meros|hadya|xadya|oldi sotdi|oldi-sotdi|ipoteka|farzand|subyekt|nomiga otkaz/ },
  { name: "Ariza holati (rad etilgan)", test: /ariza|\brad\b|rad etil|rad qil|javob/ },
  { name: "Turar joy va qurilish", test: /turar joy|turar-joy|noturar|foydalanishga|bolish|bulish|razdel|qurilish|uy qurish|ruxsatnoma|dalolatnoma|loyix|loyih|arxitektura|kotej/ },
  { name: "Arxiv ko'chirmasi", test: /kochirma|kuchirma|arxiv|arhiv/ },
  { name: "Ijtimoiy obyektlar", test: /maktab|bogcha|shifoxona|poliklinika|masjid/ },
  { name: "Huquqiy maslahat", test: /maslah|maslax|masla h|huquq|xuquq|tushuncha|advokat|tushuntir|malumot/ },
];
export const BOSHQA = "Boshqa";

export function maqsadTuri(maqsad: string) {
  const p = plain(maqsad);
  if (!p) return BOSHQA;
  for (const t of MAQSAD_TURLARI) if (t.test.test(p)) return t.name;
  return BOSHQA;
}

/** Xom maqsad matnini guruhlash kaliti ("Kadastr masalasi." = "кадастр масаласи") */
export function normMaqsad(maqsad: string) {
  return plain(maqsad).replace(/\s*(masalasi|masalasida|masala|boyicha|buyicha|yuzasidan|uchun keldi|keldi)$/g, "").trim();
}

/* ---------- mahallalar ---------- */

/**
 * Mahalla kaliti: "Тепакургон", "Tepaqo'rg'on MFY" va "tepakurgon" bitta kalit beradi.
 * Kirill yozuvda ў/қ/ҳ ko'pincha у/к/х bilan yoziladi — shuning uchun q→k, x/h→h, u→o birlashtiriladi.
 */
export function mahallaKey(manzil: string) {
  return plain(manzil)
    .replace(/\b(mfy|mahallasi|mahalla|mahalasi|mahala|fuqarolar yigini|qishlogi|qishloq|kocha|kochasi|kuchasi)\b/g, " ")
    .replace(/[^a-z]/g, "")
    .replace(/q/g, "k")
    .replace(/x/g, "h")
    .replace(/u/g, "o")
    .replace(/(.)\1+/g, "$1");
}

/** Ko'rsatish uchun: lotin, bosh harf bilan, "MFY" kabi qo'shimchalarsiz */
export function mahallaLabel(manzil: string) {
  const s = cyrillicToLatin(manzil)
    .replace(/[\s-]*\b(mfy|mahallasi|mahalla)\b\.?/gi, "")
    .replace(/\s+/g, " ")
    .replace(/[\s,.-]+$/, "")
    .trim();
  return s.split(" ").map(capFirst).join(" ");
}

/* ---------- sana va vaqt ---------- */

export function sanaKey(sana: string) {
  const s = String(sana ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return s;
}
const pad = (n: number) => String(n).padStart(2, "0");
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const keyToDate = (k: string) => {
  const [y, mo, d] = k.split("-").map(Number);
  return new Date(y, mo - 1, d);
};
export const addDays = (k: string, n: number) => {
  const d = keyToDate(k);
  d.setDate(d.getDate() + n);
  return dateKey(d);
};
/** Dushanba = 0 … Yakshanba = 6 */
export const weekday = (k: string) => (keyToDate(k).getDay() + 6) % 7;
export const WEEKDAYS = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

const toMin = (hm: string) => {
  const m = String(hm ?? "").match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
/** Qabul davomiyligi (daqiqa). Ketdi yo'q yoki mantiqsiz (0 dan kam, 4 soatdan ko'p) — null */
export function qabulDaqiqa(keldi: string, ketdi: string) {
  const a = toMin(keldi), b = toMin(ketdi);
  if (a === null || b === null) return null;
  const d = b - a;
  return d >= 0 && d <= 240 ? d : null;
}
export const keldiSoat = (keldi: string) => {
  const m = toMin(keldi);
  return m === null ? null : Math.floor(m / 60);
};

/* ---------- davr filtri ---------- */

export type Period = "bugun" | "7" | "30" | "oy" | "all";
export const PERIODS: { id: Period; label: string }[] = [
  { id: "bugun", label: "Bugun" },
  { id: "7", label: "7 kun" },
  { id: "30", label: "30 kun" },
  { id: "oy", label: "Shu oy" },
  { id: "all", label: "Barchasi" },
];

/** Davrning boshlanish kuni (yyyy-MM-dd); "all" — null */
export function periodStart(period: Period, today: string): string | null {
  if (period === "bugun") return today;
  if (period === "7") return addDays(today, -6);
  if (period === "30") return addDays(today, -29);
  if (period === "oy") return `${today.slice(0, 8)}01`;
  return null;
}

export function filterByPeriod<T extends { sana: string }>(list: T[], period: Period, today: string) {
  const start = periodStart(period, today);
  if (!start) return list;
  return list.filter((m) => {
    const k = sanaKey(m.sana);
    return k >= start && k <= today;
  });
}

/* ---------- agregatlar ---------- */

export const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
/** Jadvaldagi tuman nomini TUMANLAR ro'yxatidagi ko'rinishga keltirish */
export const tumanOf = (t: string) => TUMANLAR.find((x) => sameBranch(x, t)) || t || "Mavjud emas";
export const sortByCount = <T extends { count: number }>(rows: T[]) => rows.sort((a, b) => b.count - a.count);

export type CountRow = { name: string; count: number; share: number };
export type TumanRow = CountRow & { avgMin: number | null };
export type MahallaRow = CountRow & { tuman: string };
export type DayPoint = { date: string; count: number; avg7: number };
export type Heat = { hours: number[]; cells: number[][]; max: number; peak: { day: number; hour: number; count: number } | null };

export type CommonStats = {
  total: number;
  today: number;
  yesterday: number;
  activeDays: number;
  avgDaily: number;
  avgMin: number | null;
  daily: DayPoint[];
  heat: Heat;
  tumanlar: TumanRow[];
  turlar: CountRow[];
  topMaqsad: CountRow[];
  mahallalar: MahallaRow[];
  mahallaCount: number;
};

/** Barcha mahallalar (tuman bilan), ko'pidan kamiga */
export function mahallaRows(list: BaseMurojaat[]): MahallaRow[] {
  const total = list.length || 1;
  const mah = new Map<string, { count: number; tuman: string; labels: Map<string, number> }>();
  for (const m of list) {
    if (isEmpty(m.manzil)) continue;
    const tName = tumanOf(m.tuman);
    const key = mahallaKey(m.manzil);
    if (!key) continue;
    const full = `${tName}|${key}`;
    const e = mah.get(full) || { count: 0, tuman: tName, labels: new Map() };
    e.count++;
    const lbl = mahallaLabel(m.manzil);
    e.labels.set(lbl, (e.labels.get(lbl) || 0) + 1);
    mah.set(full, e);
  }
  return sortByCount(
    [...mah.values()].map((e) => ({
      name: [...e.labels.entries()].sort((a, b) => b[1] - a[1])[0][0],
      tuman: e.tuman,
      count: e.count,
      share: e.count / total,
    }))
  );
}

/**
 * Ikkala bo'lim uchun umumiy ko'rsatkichlar.
 * @param list   davr va tuman filtridan o'tgan murojaatlar
 * @param today  bugungi kun (yyyy-MM-dd)
 * @param start  davr boshi (kunlik grafik shu kundan chiziladi); null — eng birinchi murojaatdan
 */
export function buildCommon(list: BaseMurojaat[], today: string, start: string | null): CommonStats {
  const total = list.length;
  const share = (n: number) => (total ? n / total : 0);

  const byDay = new Map<string, number>();
  const durations: number[] = [];
  const heatRaw = new Map<string, number>();
  const tum = new Map<string, { count: number; mins: number[] }>();
  const tur = new Map<string, number>();
  const maq = new Map<string, { count: number; label: string }>();
  let minHour = 24, maxHour = -1;

  for (const m of list) {
    const day = sanaKey(m.sana);
    byDay.set(day, (byDay.get(day) || 0) + 1);

    const d = qabulDaqiqa(m.keldi, m.ketdi);
    if (d !== null) durations.push(d);

    const h = keldiSoat(m.keldi);
    if (h !== null && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
      const k = `${weekday(day)}|${h}`;
      heatRaw.set(k, (heatRaw.get(k) || 0) + 1);
      minHour = Math.min(minHour, h);
      maxHour = Math.max(maxHour, h);
    }

    const tName = tumanOf(m.tuman);
    const t = tum.get(tName) || { count: 0, mins: [] };
    t.count++;
    if (d !== null) t.mins.push(d);
    tum.set(tName, t);

    const turName = maqsadTuri(m.maqsad);
    tur.set(turName, (tur.get(turName) || 0) + 1);

    if (!isEmpty(m.maqsad)) {
      const mk = normMaqsad(m.maqsad);
      if (mk) {
        const e = maq.get(mk) || { count: 0, label: capFirst(mk) };
        e.count++;
        maq.set(mk, e);
      }
    }
  }

  // Kunlik qator: davr boshidan bugungacha, bo'sh kunlar 0 bilan
  const days = [...byDay.keys()].filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  const from = start || days[0] || today;
  const daily: DayPoint[] = [];
  for (let k = from, guard = 0; k <= today && guard < 800; k = addDays(k, 1), guard++) daily.push({ date: k, count: byDay.get(k) || 0, avg7: 0 });
  daily.forEach((p, i) => {
    const win = daily.slice(Math.max(0, i - 6), i + 1);
    p.avg7 = win.reduce((a, b) => a + b.count, 0) / win.length;
  });

  // Heatmap: ma'lumotdagi soatlar (6:00–21:00 oralig'ida)
  const hFrom = Math.max(6, Math.min(minHour, 8)), hTo = Math.min(21, Math.max(maxHour, 17));
  const hours = Array.from({ length: Math.max(0, hTo - hFrom + 1) }, (_, i) => hFrom + i);
  let heatMax = 0;
  let peak: Heat["peak"] = null;
  const cells = WEEKDAYS.map((_, wd) =>
    hours.map((h) => {
      const c = heatRaw.get(`${wd}|${h}`) || 0;
      if (c > heatMax) heatMax = c;
      if (!peak || c > peak.count) peak = { day: wd, hour: h, count: c };
      return c;
    })
  );

  const tumanlar = sortByCount(
    [...new Set([...TUMANLAR, ...tum.keys()])].map((name) => {
      const t = tum.get(name);
      return { name, count: t?.count || 0, share: share(t?.count || 0), avgMin: t ? avg(t.mins) : null };
    })
  );
  const turlar = sortByCount([...tur.entries()].map(([name, count]) => ({ name, count, share: share(count) })));
  // "Boshqa" har doim oxirida
  turlar.sort((a, b) => (a.name === BOSHQA ? 1 : b.name === BOSHQA ? -1 : 0));

  const topMaqsad = sortByCount([...maq.values()].map((e) => ({ name: e.label, count: e.count, share: share(e.count) }))).slice(0, 8);
  const mahallalar = mahallaRows(list);

  const activeDays = days.length;
  return {
    total,
    today: byDay.get(today) || 0,
    yesterday: byDay.get(addDays(today, -1)) || 0,
    activeDays,
    avgDaily: activeDays ? total / activeDays : 0,
    avgMin: avg(durations),
    daily,
    heat: { hours, cells, max: heatMax, peak: peak && (peak as { count: number }).count > 0 ? peak : null },
    tumanlar,
    turlar,
    topMaqsad,
    mahallalar: mahallalar.slice(0, 15),
    mahallaCount: mahallalar.length,
  };
}
