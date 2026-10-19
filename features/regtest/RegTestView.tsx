"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DURATION_SEC, FIO_ERROR, JARAYON, QUESTION_COUNT, isFio, isPinfl, normalizeFio, type Exam, type ExamResult } from "./config";

/**
 * Registratsiya → "Test yechish" — registratorlar testi.
 * Tizimga registrator kirib beradi, testni ishga kirayotgan xodim PINFL bilan yechadi —
 * shuning uchun ekranda va natijada registratordan faqat login, qolgani PINFL egasiga tegishli.
 *  1) F.I.O. + PINFL → "Testni boshlash" (server 20 ta tasodifiy savol beradi, variantlari aralash);
 *  2) test: 40 daqiqa, savollar bo'yicha yurish, javoblar sessionStorage'da (sahifa yangilansa ham saqlanadi);
 *  3) yakunlash (yoki vaqt tugashi) → serverda baholanadi → natija oynasi.
 */
type Answers = (number | null)[];

const LETTERS = ["A", "B", "C", "D"];
const storeKey = (e: Exam) => `dkp_regtest_${e.user.login}_${e.startedAt}`;

const pad = (n: number) => String(n).padStart(2, "0");
const mmss = (sec: number) => `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (res.status === 401) {
    window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    throw new Error("Sessiya tugagan");
  }
  if (!res.ok) throw new Error((json && (json.error || json.message)) || `HTTP ${res.status}`);
  return json as T;
}

export default function RegTestView({ login }: { login: string }) {
  const [phase, setPhase] = useState<"loading" | "start" | "exam" | "result">("loading");
  const [exam, setExam] = useState<Exam | null>(null);
  const [answers, setAnswers] = useState<Answers>([]);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sahifa yangilangan bo'lsa — boshlangan testni davom ettirish
  useEffect(() => {
    post<{ exam: Exam | null }>("/api/regtest")
      .then(({ exam }) => {
        if (!exam) return setPhase("start");
        let saved: Answers = [];
        try {
          saved = JSON.parse(sessionStorage.getItem(storeKey(exam)) || "[]");
        } catch {}
        setExam(exam);
        setAnswers(exam.questions.map((_, i) => (typeof saved[i] === "number" ? saved[i] : null)));
        setPhase("exam");
      })
      .catch(() => setPhase("start"));
  }, []);

  const begin = async (pinfl: string, fio: string) => {
    setError(null);
    const { exam } = await post<{ exam: Exam }>("/api/regtest/start", { pinfl, fio });
    setExam(exam);
    setAnswers(exam.questions.map(() => null));
    setPhase("exam");
  };

  const finish = useCallback(
    async (final: Answers) => {
      if (!exam) return;
      const { result } = await post<{ result: ExamResult }>("/api/regtest/finish", { answers: final });
      try {
        sessionStorage.removeItem(storeKey(exam));
      } catch {}
      setResult(result);
      setPhase("result");
    },
    [exam]
  );

  const backHome = () => {
    setExam(null);
    setResult(null);
    setAnswers([]);
    setPhase("start");
  };

  return (
    <div className="sec-regtest">
      <header className="rt-toolbar">
        <div className="rt-badge"><i className="fa-solid fa-clipboard-question" /></div>
        <div>
          <h2>Test yechish</h2>
          <span>Registratsiya · {QUESTION_COUNT} ta savol · {DURATION_SEC / 60} daqiqa</span>
        </div>
      </header>

      {phase === "loading" && <div className="rt-loading"><i className="fa-solid fa-spinner fa-spin" /> Yuklanmoqda…</div>}
      {phase === "start" && <StartScreen login={login} error={error} onStart={begin} />}
      {phase === "exam" && exam && <ExamScreen exam={exam} answers={answers} setAnswers={setAnswers} onFinish={finish} />}
      {phase === "result" && result && <ResultModal result={result} onClose={backHome} />}
    </div>
  );
}

/* ---------------- 1. Boshlash ---------------- */

/** Test yechayotgan xodim — F.I.O. va PINFL; registrator faqat login bilan */
function TakerCard({ fio, pinfl, login }: { fio: string; pinfl: string; login: string }) {
  return (
    <div className="rt-taker">
      <div className="rt-taker-icon"><i className="fa-solid fa-user-pen" /></div>
      <span>Test topshiruvchi</span>
      {fio && <strong className="rt-taker-fio">{fio}</strong>}
      <b className="rt-mono">{pinfl}</b>
      <small><i className="fa-solid fa-user-shield" /> Registrator: {login}</small>
    </div>
  );
}

function StartScreen({ login, error, onStart }: { login: string; error: string | null; onStart: (pinfl: string, fio: string) => Promise<void> }) {
  const [fio, setFio] = useState("");
  const [fioTouched, setFioTouched] = useState(false);
  const [pinfl, setPinfl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(error);
  const valid = isPinfl(pinfl);
  const fioOk = isFio(fio);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fioOk) return setErr(FIO_ERROR);
    if (!valid) return setErr("PINFL 14 ta raqamdan iborat bo'lishi kerak.");
    setBusy(true);
    setErr(null);
    try {
      await onStart(pinfl, normalizeFio(fio));
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="rt-start">
      <form className="rt-start-card" onSubmit={submit}>
        <h3><i className="fa-solid fa-id-card" /> Testga kirish</h3>
        <p>Test topshiruvchi xodimning F.I.O.si va shaxsiy identifikatsiya raqamini (PINFL) kiriting.</p>
        <label className={`rt-field${fioTouched && !fioOk ? " is-bad" : ""}${fioOk ? " is-ok" : ""}`}>
          <span>F.I.O.</span>
          <input
            autoComplete="off"
            autoCapitalize="words"
            spellCheck={false}
            autoFocus
            maxLength={100}
            placeholder="Familiya Ism Otasining ismi"
            value={fio}
            onChange={(e) => setFio(e.target.value.replace(/\s{2,}/g, " ").replace(/^\s+/, ""))}
            onBlur={() => setFioTouched(true)}
            disabled={busy}
          />
          {fioTouched && !fioOk && <small className="rt-field-hint">{FIO_ERROR}</small>}
        </label>
        <label className={`rt-pinfl${pinfl && !valid ? " is-bad" : ""}${valid ? " is-ok" : ""}`}>
          <span>PINFL</span>
          <input
            inputMode="numeric"
            autoComplete="off"
            maxLength={14}
            placeholder="14 ta raqam"
            value={pinfl}
            onChange={(e) => setPinfl(e.target.value.replace(/\D/g, "").slice(0, 14))}
            disabled={busy}
          />
          <small>{pinfl.length} / 14</small>
        </label>
        {err && <div className="rt-error"><i className="fa-solid fa-circle-exclamation" /> {err}</div>}
        <ul className="rt-rules">
          <li><i className="fa-solid fa-list-ol" /> {QUESTION_COUNT} ta savol — har safar tasodifiy, variantlar ham aralash</li>
          <li><i className="fa-solid fa-stopwatch" /> Umumiy vaqt — {DURATION_SEC / 60} daqiqa; tugasa test avtomatik yakunlanadi</li>
          <li><i className="fa-solid fa-circle-check" /> Har bir savolda bitta to&apos;g&apos;ri javob; javobni yakunlashgacha o&apos;zgartirish mumkin</li>
        </ul>
        <button className="rt-btn rt-btn-primary rt-btn-lg" disabled={!valid || !fioOk || busy}>
          {busy ? <><i className="fa-solid fa-spinner fa-spin" /> Tayyorlanmoqda…</> : <><i className="fa-solid fa-play" /> Testni boshlash</>}
        </button>
        <div className="rt-reg-note"><i className="fa-solid fa-user-shield" /> Tizimga kirgan registrator: <b>{login}</b></div>
      </form>
    </div>
  );
}

/* ---------------- 2. Test ---------------- */

function ExamScreen({ exam, answers, setAnswers, onFinish }: {
  exam: Exam;
  answers: Answers;
  setAnswers: React.Dispatch<React.SetStateAction<Answers>>;
  onFinish: (a: Answers) => Promise<void>;
}) {
  const [cur, setCur] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const total = exam.questions.length;
  const left = Math.max(0, Math.ceil((exam.deadline - now) / 1000));
  const answered = answers.filter((a) => a != null).length;
  const q = exam.questions[cur];

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // Javoblar sessionStorage'da — sahifa tasodifan yangilansa yo'qolmaydi
  useEffect(() => {
    try {
      sessionStorage.setItem(storeKey(exam), JSON.stringify(answers));
    } catch {}
  }, [answers, exam]);

  const submit = useCallback(async () => {
    if (sending) return;
    setSending(true);
    setErr(null);
    try {
      await onFinish(answersRef.current);
    } catch (e) {
      setErr((e as Error).message);
      setSending(false);
    }
  }, [onFinish, sending]);

  // Vaqt tugadi — avtomatik yakunlash
  useEffect(() => {
    if (left === 0 && !sending && !err) void submit();
  }, [left, sending, err, submit]);

  // Test davomida sahifadan chiqishda ogohlantirish
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  const choose = useCallback(
    (k: number) => setAnswers((a) => a.map((v, i) => (i === cur ? k : v))),
    [cur, setAnswers]
  );

  // Klaviatura: 1–4 — javob, ← → — savollar
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (confirm || sending || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (/^[1-4]$/.test(e.key) && Number(e.key) <= q.options.length) choose(Number(e.key) - 1);
      else if (e.key === "ArrowRight") setCur((c) => Math.min(total - 1, c + 1));
      else if (e.key === "ArrowLeft") setCur((c) => Math.max(0, c - 1));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [choose, confirm, sending, q, total]);

  const pct = useMemo(() => Math.round((answered / total) * 100), [answered, total]);

  return (
    <div className="rt-exam">
      <aside className="rt-side">
        <div className={`rt-timer${left <= 300 ? " is-low" : ""}`}>
          <span>Qolgan vaqt</span>
          <strong>{mmss(left)}</strong>
          <div className="rt-timer-bar"><i style={{ width: `${(left / DURATION_SEC) * 100}%` }} /></div>
        </div>
        <div className="rt-progress">
          <div><span>Javob berilgan</span><b>{answered} / {total}</b></div>
          <div className="rt-progress-bar"><i style={{ width: `${pct}%` }} /></div>
        </div>
        <TakerCard fio={exam.user.fio} pinfl={exam.user.pinfl} login={exam.user.login} />
        <button className="rt-btn rt-btn-danger rt-btn-block" onClick={() => setConfirm(true)} disabled={sending}>
          <i className="fa-solid fa-flag-checkered" /> Testni yakunlash
        </button>
      </aside>

      <section className="rt-main">
        <div className="rt-question">
          <div className="rt-q-num">Savol {cur + 1} / {total}</div>
          <h3>{q.text}</h3>
        </div>
        <div className="rt-options" role="radiogroup" aria-label={`Savol ${cur + 1} javoblari`}>
          {q.options.map((o, k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={answers[cur] === k}
              className={`rt-option${answers[cur] === k ? " is-picked" : ""}`}
              onClick={() => choose(k)}
              disabled={sending}
            >
              <span className="rt-letter">{LETTERS[k]}</span>
              <span className="rt-option-text">{o}</span>
              <i className={`fa-${answers[cur] === k ? "solid fa-circle-check" : "regular fa-circle"}`} aria-hidden />
            </button>
          ))}
        </div>

        <div className="rt-nav">
          <button className="rt-btn" onClick={() => setCur((c) => c - 1)} disabled={cur === 0}>
            <i className="fa-solid fa-arrow-left" /> Oldingi
          </button>
          <span className="rt-nav-hint">Klaviatura: 1–4 — javob, ← → — savollar</span>
          {cur < total - 1 ? (
            <button className="rt-btn rt-btn-primary" onClick={() => setCur((c) => c + 1)}>
              Keyingi <i className="fa-solid fa-arrow-right" />
            </button>
          ) : (
            <button className="rt-btn rt-btn-danger" onClick={() => setConfirm(true)} disabled={sending}>
              <i className="fa-solid fa-flag-checkered" /> Yakunlash
            </button>
          )}
        </div>

        <div className="rt-grid" aria-label="Savollar">
          {exam.questions.map((_, i) => (
            <button
              key={i}
              className={`rt-cell${answers[i] != null ? " is-done" : ""}${i === cur ? " is-cur" : ""}`}
              onClick={() => setCur(i)}
              title={answers[i] != null ? `${i + 1}-savol — javob berilgan` : `${i + 1}-savol — javobsiz`}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <div className="rt-legend">
          <span><i className="is-done" /> Javob berilgan</span>
          <span><i /> Javobsiz</span>
          <span><i className="is-cur" /> Joriy savol</span>
        </div>
      </section>

      {(confirm || sending || err) && (
        <div className="rt-modal" role="dialog" aria-modal="true">
          <div className="rt-dialog">
            {sending && !err ? (
              <>
                <div className="rt-dialog-icon"><i className="fa-solid fa-spinner fa-spin" /></div>
                <h3>{left === 0 ? "Vaqt tugadi" : "Natija hisoblanmoqda"}</h3>
                <p>Iltimos, kuting…</p>
              </>
            ) : err ? (
              <>
                <div className="rt-dialog-icon is-bad"><i className="fa-solid fa-triangle-exclamation" /></div>
                <h3>Yuborib bo&apos;lmadi</h3>
                <p>{err}</p>
                <div className="rt-dialog-actions">
                  <button className="rt-btn rt-btn-primary" onClick={submit}><i className="fa-solid fa-rotate" /> Qayta yuborish</button>
                </div>
              </>
            ) : (
              <>
                <div className="rt-dialog-icon"><i className="fa-solid fa-flag-checkered" /></div>
                <h3>Testni yakunlaysizmi?</h3>
                <p>
                  {answered} ta savolga javob berdingiz.
                  {total - answered > 0 && <> <b className="t-bad">{total - answered} ta savol javobsiz</b> — ular noto&apos;g&apos;ri hisoblanmaydi, lekin ball ham bermaydi.</>}
                  {" "}Yakunlangach javoblarni o&apos;zgartirib bo&apos;lmaydi.
                </p>
                <div className="rt-dialog-actions">
                  <button className="rt-btn" onClick={() => setConfirm(false)} autoFocus>Davom etish</button>
                  <button className="rt-btn rt-btn-danger" onClick={() => { setConfirm(false); void submit(); }}>Ha, yakunlash</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- 3. Natija ---------------- */

function ResultModal({ result, onClose }: { result: ExamResult; onClose: () => void }) {
  const pct = result.total ? Math.round((result.correct / result.total) * 100) : 0;
  const tone = pct >= 80 ? "good" : pct >= 60 ? "mid" : "bad";
  const rows: [string, React.ReactNode, string?][] = [
    ["Xodim FIO", result.user.fio || "—"],
    ["PINFL", <span key="p" className="rt-mono">{result.user.pinfl}</span>],
    ["Sana", result.date],
    ["Jarayon", result.jarayon || JARAYON],
    ["Savol soni", result.total],
    ["Berilgan vaqt", `${result.durationSec / 60} daqiqa`],
    ["Sarflangan vaqt", `${mmss(result.spentSec)} (${result.spentSec} s)`],
    ["To'g'ri javoblar", result.correct, "good"],
    ["Noto'g'ri javoblar", result.wrong, "bad"],
    ["Javobsiz", result.unanswered],
    ["To'plangan ball", <b key="b">{result.score}</b>, "score"],
  ];
  return (
    <div className="rt-modal" role="dialog" aria-modal="true" aria-labelledby="rt-result-title">
      <div className="rt-result">
        <div className="rt-result-head">
          <h3 id="rt-result-title">Test natijalari</h3>
          <button className="rt-x" onClick={onClose} aria-label="Yopish"><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className={`rt-score tone-${tone}`}>
          <div className="rt-ring" style={{ "--p": pct } as React.CSSProperties}>
            <span>{pct}%</span>
          </div>
          <div>
            <b>{result.correct} / {result.total}</b>
            <span>{result.status === "Vaqt tugadi" ? "Vaqt tugagani sababli yakunlandi" : "Test yakunlandi"}</span>
          </div>
        </div>
        {result.saveError && (
          <div className="rt-error"><i className="fa-solid fa-triangle-exclamation" /> {result.saveError}. Natijani rahbaringizga ko&apos;rsating.</div>
        )}
        <table className="rt-result-table">
          <tbody>
            {rows.map(([k, v, cls]) => (
              <tr key={k} className={cls ? `is-${cls}` : undefined}>
                <th>{k}:</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="rt-btn rt-btn-outline rt-btn-block" onClick={onClose}>
          <i className="fa-solid fa-house" /> Bosh sahifaga qaytish
        </button>
      </div>
    </div>
  );
}
