/**
 * RegTest — registratorlar testi. Savollar banki (Google Sheet, yopiq) Apps Script orqali o'qiladi;
 * to'g'ri javoblar faqat serverda — brauzerga savol va aralashtirilgan variantlar matni boradi.
 */
export const QUESTION_COUNT = 20;
export const DURATION_SEC = 40 * 60;
/** Muddatdan keyin shuncha soniya ichida kelgan javoblar qabul qilinadi (tarmoq kechikishi) */
export const GRACE_SEC = 60;
/** Bitta PINFL — shuncha soatda bir marta (boshlangan test bo'yicha; Code.gs → REGTEST_RETAKE_HOURS bilan bir xil) */
export const RETAKE_HOURS = 2;
export const JARAYON = "Registratsiya";
/** Full screen'dan chiqish / vkladka yoki oyna almashtirish — shuncha marta bo'lsa test avtomatik yakunlanadi */
export const MAX_VIOLATIONS = 3;

export const isPinfl = (s: string) => /^\d{14}$/.test(s);

/** F.I.O.: bo'sh joylar yig'iladi, chetlari kesiladi */
export const normalizeFio = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
/** Kamida 2 so'z, 5–100 belgi; faqat lotin/kirill harflari, bo'sh joy, apostrof va chiziqcha (raqamsiz) */
export const isFio = (s: string) => {
  const v = normalizeFio(s);
  return v.length >= 5 && v.length <= 100 && v.split(" ").length >= 2 && /^[A-Za-zА-Яа-яЁёЎўҚқҒғҲҳ'ʻʼ’`‘\- ]+$/.test(v);
};
export const FIO_ERROR = "F.I.O.ni to'liq kiriting (familiya, ism, otasining ismi) — faqat harflar";

/**
 * Test yechayotgan xodim — PINFL bilan. Tizimga u emas, registrator kirib beradi:
 * registratordan faqat login saqlanadi (F.I.O., filial, bo'lim — test yechgan odamniki emas).
 */
export type ExamUser = { login: string; pinfl: string; fio: string };

/** Brauzerga yuboriladigan test (to'g'ri javobsiz) */
export type ExamQuestion = { n: number; text: string; options: string[] };
export type Exam = { questions: ExamQuestion[]; startedAt: number; deadline: number; user: ExamUser };

export type ExamResult = {
  user: ExamUser;
  jarayon: string;
  date: string;
  total: number;
  durationSec: number;
  spentSec: number;
  correct: number;
  wrong: number;
  unanswered: number;
  score: number;
  status: "Yakunlandi" | "Vaqt tugadi" | "Qoidabuzarlik";
  /** Full screen'dan chiqish, vkladka/oyna almashtirish soni */
  violations: number;
  /** Natija sheet'ga yozilmagan bo'lsa — sababi */
  saveError?: string;
};

/** "Test natijalari" — parol qayta kiritilgach shuncha vaqt ochiq */
export const UNLOCK_SEC = 15 * 60;

/** "Натижалар" varag'idagi bitta qator (dashboard uchun) */
export type ResultRow = {
  date: string;
  time: string;
  login: string;
  pinfl: string;
  fio: string;
  total: number;
  correct: number;
  wrong: number;
  unanswered: number;
  score: number;
  spentSec: number;
  status: string;
  violations: number;
  testId: string;
};
