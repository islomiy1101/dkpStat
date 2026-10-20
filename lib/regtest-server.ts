import crypto from "node:crypto";
import { config } from "./config";
import { cached } from "./cache";
import { MOCK, readMock } from "./mock";
import { regtestQuestionRows, regtestResultRows, regtestSaveResult, regtestStartRow } from "./auth-server";
import {
  DURATION_SEC, GRACE_SEC, JARAYON, MAX_VIOLATIONS, QUESTION_COUNT, RETAKE_HOURS, UNLOCK_SEC,
  type Exam, type ExamResult, type ExamUser, type ResultRow,
} from "@/features/regtest/config";

/**
 * RegTest serveri: savollar banki ("Тест саволлари" varag'i, Apps Script orqali), test yaratish va baholash.
 * Qaysi savollar, qaysi tartibda va qachon boshlangani — imzolangan tokenda (httpOnly cookie):
 * Netlify'da so'rovlar orasida server xotirasi saqlanmaydi. To'g'ri javoblar brauzerga yuborilmaydi.
 */
export const REGTEST_COOKIE = "dkp_regtest";
/** "Test natijalari" qulfi: parol qayta kiritilgach beriladi (15 daqiqa; yangi test boshlansa o'chiriladi) */
export const REGTEST_UNLOCK_COOKIE = "dkp_regtest_unlock";

type BankQuestion = { id: string; text: string; options: string[]; correct: number };

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** "Тест саволлари": № | Савол | а) | б) | в) | г) | Тўғри жавоб (javob — variant matni) */
export function parseBank(rows: string[][]): BankQuestion[] {
  const hi = rows.findIndex((r) => r.some((v) => norm(v) === "савол"));
  if (hi < 0) throw new Error(`Savollar varag'ida "Савол" ustuni topilmadi`);
  const head = rows[hi].map(norm);
  const col = (name: string, fallback: number) => (head.indexOf(name) >= 0 ? head.indexOf(name) : fallback);
  const cNum = col("№", 0);
  const cText = col("савол", 1);
  const cOpts = ["а)", "б)", "в)", "г)"].map((n, i) => col(n, 2 + i));
  const cAns = head.findIndex((h) => h.startsWith("тўғри") || h.startsWith("тугри") || h.startsWith("to'g'ri"));
  if (cAns < 0) throw new Error(`Savollar varag'ida "Тўғри жавоб" ustuni topilmadi`);

  const out: BankQuestion[] = [];
  for (const r of rows.slice(hi + 1)) {
    const text = String(r[cText] ?? "").trim();
    if (!text) continue;
    const options = cOpts.map((c) => String(r[c] ?? "").trim());
    const ans = String(r[cAns] ?? "").trim();
    let correct = options.findIndex((o) => o === ans);
    if (correct < 0) correct = options.findIndex((o) => norm(o).replace(/\.$/, "") === norm(ans).replace(/\.$/, ""));
    if (correct < 0 || options.some((o) => !o)) {
      console.warn(`[regtest] savol chiqarib tashlandi (javob variantlarga mos emas yoki variant bo'sh): №${r[cNum]}`);
      continue;
    }
    // Sheet o'zgarsa eski token boshqa savolga bog'lanib qolmasin — id matn xeshini ham o'z ichiga oladi
    const hash = crypto.createHash("sha1").update(text + "\u0000" + options.join("\u0000")).digest("hex").slice(0, 10);
    out.push({ id: `${String(r[cNum] ?? "").trim() || out.length + 1}:${hash}`, text, options, correct });
  }
  return out;
}

function loadBank(fresh = false) {
  return cached(
    "regtest:bank",
    10 * 60_000,
    async () => {
      const rows = MOCK ? await readMock<string[][]>("regtest_questions") : await regtestQuestionRows();
      const bank = parseBank(rows);
      if (bank.length < QUESTION_COUNT) throw new Error(`Savollar bankida ${bank.length} ta savol bor, kamida ${QUESTION_COUNT} ta kerak`);
      return bank;
    },
    { fresh }
  );
}

/* ---------- token ---------- */

/** fio — test topshiruvchining F.I.O.si (imzolangan: yakunlashda brauzerdan qayta olinmaydi) */
type Token = { v: 1; jti: string; login: string; pinfl: string; fio?: string; startedAt: number; deadline: number; items: { id: string; order: number[] }[] };

const sign = (payload: string) => crypto.createHmac("sha256", "regtest:" + config.sessionSecret).update(payload).digest("base64url");

function encodeToken(t: Token) {
  const payload = Buffer.from(JSON.stringify(t)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeToken(raw: string | undefined): Token | null {
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const t = JSON.parse(Buffer.from(payload, "base64url").toString()) as Token;
    return t.v === 1 && typeof t.jti === "string" && Array.isArray(t.items) ? t : null;
  } catch {
    return null;
  }
}

/** Fisher–Yates, kriptografik tasodif bilan */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- test ---------- */

type Who = { login: string };
const examUser = (u: Who, pinfl: string, fio = ""): ExamUser => ({ login: u.login, pinfl, fio });

/** Bankdagi tartibda emas: 20 ta tasodifiy savol, har birining variantlari ham aralashtiriladi */
export async function startExam(u: Who, pinfl: string, fio: string, now = Date.now()): Promise<{ exam: Exam; token: string }> {
  const bank = await loadBank();
  const picked = shuffle(bank).slice(0, QUESTION_COUNT);
  const items = picked.map((q) => ({ id: q.id, order: shuffle(q.options.map((_, i) => i)) }));
  // Test ID'da boshlanish vaqti (base36) — Apps Script 2 soatlik cheklovni shundan hisoblaydi
  const jti = `${now.toString(36)}-${crypto.randomBytes(6).toString("base64url")}`;
  const token: Token = { v: 1, jti, login: u.login, pinfl, fio, startedAt: now, deadline: now + DURATION_SEC * 1000, items };
  const exam: Exam = {
    questions: picked.map((q, i) => ({ n: i + 1, text: q.text, options: items[i].order.map((k) => q.options[k]) })),
    startedAt: token.startedAt,
    deadline: token.deadline,
    user: examUser(u, pinfl, fio),
  };
  await registerStart(u, pinfl, fio, jti, now);
  return { exam, token: encodeToken(token) };
}

/** MOCK rejimida PINFL → oxirgi boshlanish vaqti (haqiqiy rejimda — "Натижалар" varag'i) */
const mockStarts = new Map<string, number>();

/** 2 soatlik cheklov; ruxsat bo'lsa — "Jarayonda" qatori yoziladi. Cheklangan bo'lsa ExamError */
async function registerStart(u: Who, pinfl: string, fio: string, jti: string, now: number) {
  if (MOCK) {
    const last = mockStarts.get(pinfl);
    const limitMs = RETAKE_HOURS * 3600_000;
    if (last && now - last < limitMs) {
      const d = new Date(last + limitMs + 5 * 3600_000).toISOString();
      const nextAt = `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)} ${d.slice(11, 16)}`;
      throw new ExamError(`Bu PINFL bilan test ${RETAKE_HOURS} soatda bir marta topshiriladi. Keyingi urinish: ${nextAt} dan keyin`, 429);
    }
    mockStarts.set(pinfl, now);
    return;
  }
  const r = await regtestStartRow({ testId: jti, login: u.login, pinfl, fio, total: QUESTION_COUNT });
  if (r.limited) throw new ExamError(r.message || `Bu PINFL bilan test ${RETAKE_HOURS} soatda bir marta topshiriladi`, 429);
  if (!r.success) throw new Error(r.message || "Testni boshlab bo'lmadi");
}

/** Sahifa yangilanganda davom ettirish uchun — tokendagi test qayta tiklanadi (javobsiz) */
export async function resumeExam(u: Who, raw: string | undefined): Promise<Exam | null> {
  const t = decodeToken(raw);
  if (!t || t.login !== u.login || Date.now() > t.deadline + GRACE_SEC * 1000) return null;
  const bank = new Map((await loadBank()).map((q) => [q.id, q]));
  if (!t.items.every((it) => bank.has(it.id))) return null;
  return {
    questions: t.items.map((it, i) => {
      const q = bank.get(it.id)!;
      return { n: i + 1, text: q.text, options: it.order.map((k) => q.options[k]) };
    }),
    startedAt: t.startedAt,
    deadline: t.deadline,
    user: examUser(u, t.pinfl, t.fio),
  };
}

export class ExamError extends Error {
  constructor(message: string, public status = 409) {
    super(message);
  }
}

/** MOCK rejimida yakunlangan testlar (haqiqiy rejimda — "Натижалар" varag'idagi "Test ID" ustuni) */
const mockFinished = new Set<string>();

/** Baholash: javob — ko'rsatilgan variant indeksi (0..3) yoki null */
export async function finishExam(u: Who, raw: string | undefined, answers: unknown, violations: unknown, now = Date.now()): Promise<ExamResult> {
  const t = decodeToken(raw);
  if (!t) throw new ExamError("Faol test topilmadi yoki muddati o'tgan. Testni qaytadan boshlang.");
  if (t.login !== u.login) throw new ExamError("Bu test boshqa foydalanuvchiga tegishli.");
  const list = Array.isArray(answers) ? answers : [];

  const late = now > t.deadline + GRACE_SEC * 1000;
  const bank = new Map((await loadBank()).map((q) => [q.id, q]));
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  t.items.forEach((it, i) => {
    const a = list[i];
    const q = bank.get(it.id);
    // Juda kech kelgan javoblar hisobga olinmaydi; bank o'zgarib savol yo'qolgan bo'lsa — javobsiz
    if (late || !q || typeof a !== "number" || !Number.isInteger(a) || a < 0 || a >= it.order.length) {
      unanswered++;
      return;
    }
    if (it.order[a] === q.correct) correct++;
    else wrong++;
  });

  const spentSec = Math.max(0, Math.min(DURATION_SEC, Math.round((now - t.startedAt) / 1000)));
  const vCount = Math.max(0, Math.min(99, Math.floor(Number(violations)) || 0));
  const result: ExamResult = {
    user: examUser(u, t.pinfl, t.fio),
    jarayon: JARAYON,
    date: new Date(now + 5 * 3600_000).toISOString().slice(0, 10),
    total: t.items.length,
    durationSec: DURATION_SEC,
    spentSec,
    correct,
    wrong,
    unanswered,
    score: correct,
    status: vCount >= MAX_VIOLATIONS ? "Qoidabuzarlik" : now > t.deadline ? "Vaqt tugadi" : "Yakunlandi",
    violations: vCount,
  };

  const row = {
    testId: t.jti, login: u.login, pinfl: t.pinfl, fio: t.fio || "",
    total: result.total, correct, wrong, unanswered, score: result.score, spentSec, status: result.status, violations: vCount,
  };
  // Token qayta yuborilsa (cookie nusxalanib) natija berilmaydi — aks holda javoblarni almashtirib,
  // ball o'zgarishidan to'g'ri javoblarni topib olish mumkin bo'lardi
  const duplicate = new ExamError("Bu test allaqachon yakunlangan. Yangi testni boshlang.");
  if (MOCK) {
    if (mockFinished.has(t.jti)) throw duplicate;
    mockFinished.add(t.jti);
    console.log("[regtest] MOCK natija:", JSON.stringify(row));
  } else {
    try {
      const r = await regtestSaveResult(row);
      if ((r as { duplicate?: boolean }).duplicate) throw duplicate;
      if (!r.success) result.saveError = r.message || "Natija sheet'ga yozilmadi";
    } catch (e) {
      if (e instanceof ExamError) throw e;
      console.error("[regtest] natijani yozib bo'lmadi:", e);
      result.saveError = "Natija sheet'ga yozilmadi (server bilan aloqa yo'q)";
    }
  }
  return result;
}

/* ---------- "Test natijalari" qulfi ---------- */

const unlockSign = (payload: string) => crypto.createHmac("sha256", "regtest-unlock:" + config.sessionSecret).update(payload).digest("base64url");

export function encodeUnlock(login: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ login, until: now + UNLOCK_SEC * 1000 })).toString("base64url");
  return `${payload}.${unlockSign(payload)}`;
}

/** Yaroqli bo'lsa — qulf tugash vaqti (ms), aks holda null */
export function checkUnlock(raw: string | undefined, login: string, now = Date.now()): number | null {
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = unlockSign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const t = JSON.parse(Buffer.from(payload, "base64url").toString()) as { login: string; until: number };
    return t.login === login && now < t.until ? t.until : null;
  } catch {
    return null;
  }
}

/* ---------- "Натижалар" ---------- */

/** Sarlavhani solishtirish (Code.gs → regtestKey_ bilan bir xil) */
const headKey = (h: unknown) => String(h ?? "").trim().toLowerCase().replace(/\(.*?\)/g, "").replace(/[`'ʻ’‘ʼ.\s]/g, "");

/**
 * Qatorlar sarlavha nomlari bo'yicha o'qiladi (ustunlar tartibi muhim emas).
 * PINFL'i 14 raqam bo'lmagan qatorlar (masalan, eski skript surib yozgan sinov qatorlari) tashlanadi.
 */
/** Urinish boshlangan vaqt: Test ID'dagi base36 vaqt, bo'lmasa Sana + Vaqt (Toshkent) */
function startedAt(r: ResultRow) {
  const m = /^([0-9a-z]{6,12})-/.exec(r.testId);
  const t = m ? parseInt(m[1], 36) : 0;
  if (t > 1.6e12 && t < 4.1e12) return t;
  const d = Date.parse(`${r.date}T${r.time.length === 5 ? r.time + ":00" : r.time}+05:00`);
  return Number.isFinite(d) ? d : 0;
}

export function parseResults(rows: string[][], now = Date.now()): ResultRow[] {
  if (!rows.length) return [];
  const head = rows[0].map(headKey);
  const col = (...names: string[]) => names.map((n) => head.indexOf(headKey(n))).find((i) => i >= 0) ?? -1;
  const c = {
    date: col("Sana"), time: col("Vaqt"), login: col("Login"), pinfl: col("PINFL"), fio: col("F.I.O.", "FIO", "Ф.И.О.", "F.I.SH", "Xodim FIO"), total: col("Savol soni"),
    correct: col("To'g'ri"), wrong: col("Noto'g'ri"), unanswered: col("Javobsiz"), score: col("Ball"),
    spent: col("Sarflangan vaqt"), status: col("Holat"), violations: col("Qoidabuzarlik"), id: col("Test ID"),
  };
  const str = (r: string[], i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");
  const num = (r: string[], i: number) => Number(str(r, i).replace(/[\s ]/g, "").replace(",", ".")) || 0;
  return rows
    .slice(1)
    .map((r) => ({
      date: str(r, c.date), time: str(r, c.time), login: str(r, c.login), pinfl: str(r, c.pinfl).replace(/^'/, ""), fio: str(r, c.fio),
      total: num(r, c.total), correct: num(r, c.correct), wrong: num(r, c.wrong), unanswered: num(r, c.unanswered),
      score: num(r, c.score), spentSec: num(r, c.spent), status: str(r, c.status), violations: num(r, c.violations), testId: str(r, c.id),
    }))
    .filter((r) => /^\d{14}$/.test(r.pinfl))
    // Boshlangan, lekin muddati o'tib ham yakunlanmagan (oyna yopilgan) — "Yakunlanmagan"
    .map((r) => {
      if (r.status !== "Jarayonda") return r;
      const t = startedAt(r);
      return t && now - t > (DURATION_SEC + GRACE_SEC) * 1000 ? { ...r, status: "Yakunlanmagan" } : r;
    });
}

export async function loadResults(): Promise<ResultRow[]> {
  if (MOCK) return parseResults(await readMock<string[][]>("regtest_results"));
  return parseResults(await regtestResultRows());
}
