"use client";

import { useMemo, useState } from "react";
import { passwordRules, passwordStrength } from "@/lib/password-policy";

/** Parolda bo'sh joy bo'lmaydi: yozilsa ham, nusxalab qo'yilsa ham olib tashlanadi (LoginView bilan bir xil) */
const noSpaces = (v: string) => v.replace(/\s/g, "");
const STRENGTH = ["", "Zaif", "O'rtacha", "Yaxshi", "Kuchli"];

function PassInput({ id, label, value, onChange, autoComplete, autoFocus, invalid }: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
  invalid?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <div className={`auth-input${invalid ? " is-invalid" : ""}`}>
        <i className="fa-solid fa-lock" />
        <input id={id} type={show ? "text" : "password"} autoComplete={autoComplete} autoFocus={autoFocus} value={value}
          maxLength={64} spellCheck={false} onChange={(e) => onChange(noSpaces(e.target.value))}
          onKeyDown={(e) => e.key === " " && e.preventDefault()} placeholder="••••••••" />
        <button type="button" className="auth-eye" onClick={() => setShow((v) => !v)} aria-label={show ? "Parolni yashirish" : "Parolni ko'rsatish"}>
          <i className={`fa-regular ${show ? "fa-eye-slash" : "fa-eye"}`} />
        </button>
      </div>
    </>
  );
}

/**
 * Parolni o'zgartirish formasi: joriy parol, yangi parol (jonli talablar ro'yxati va kuchlilik chizig'i), takrorlash.
 * Sidebar oynasida ham, majburiy sahifada (/account/password) ham ishlatiladi. Talablar — lib/password-policy.ts.
 */
export default function PasswordForm({ login, onDone, submitLabel = "Parolni saqlash" }: {
  login: string;
  /** Muvaffaqiyatli saqlangandan keyin */
  onDone: () => void;
  submitLabel?: string;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rules = useMemo(() => passwordRules(next, login), [next, login]);
  const strength = passwordStrength(next, login);
  const strong = rules.every((r) => r.ok);
  const same = next !== "" && next === current;
  const mismatch = repeat !== "" && repeat !== next;
  const canSubmit = !!current && strong && !same && repeat === next && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const j = await res.json().catch(() => null);
      // Sessiya tugagan (joriy parol xato bo'lsa ham 401, lekin error: "auth" emas)
      if (res.status === 401 && j?.error === "auth") return window.location.replace("/login");
      if (!res.ok || !j?.success) throw new Error(j?.message || `Xatolik (HTTP ${res.status})`);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form className="auth-form pw-form" onSubmit={submit}>
      {error && (
        <div className="auth-alert" role="alert">
          <i className="fa-solid fa-circle-exclamation" />
          <div>{error}</div>
        </div>
      )}

      {/* Parol menejerlari uchun yashirin login maydoni */}
      <input type="text" name="username" autoComplete="username" value={login} readOnly hidden />

      <PassInput id="pw-current" label="Joriy parol" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
      <PassInput id="pw-next" label="Yangi parol" value={next} onChange={setNext} autoComplete="new-password" invalid={next !== "" && (!strong || same)} />

      {next !== "" && (
        <div className={`pw-meter s-${strength}`} aria-hidden>
          <span><i /><i /><i /><i /></span>
          <small>{STRENGTH[strength]}</small>
        </div>
      )}
      <ul className="pw-rules" aria-label="Parol talablari">
        {rules.map((r) => (
          <li key={r.id} className={next === "" ? "" : r.ok ? "ok" : "bad"}>
            <i className={`fa-solid ${next !== "" && r.ok ? "fa-circle-check" : next === "" ? "fa-circle" : "fa-circle-xmark"}`} /> {r.label}
          </li>
        ))}
        {same && <li className="bad"><i className="fa-solid fa-circle-xmark" /> Yangi parol joriy paroldan farq qilishi kerak</li>}
      </ul>

      <PassInput id="pw-repeat" label="Yangi parolni takrorlang" value={repeat} onChange={setRepeat} autoComplete="new-password" invalid={mismatch} />
      {mismatch && <p className="pw-hint bad"><i className="fa-solid fa-circle-xmark" /> Parollar mos kelmadi</p>}

      <button type="submit" className="auth-submit" disabled={!canSubmit}>
        {busy ? <><i className="fa-solid fa-spinner fa-spin" /> Saqlanmoqda...</> : <><i className="fa-solid fa-key" /> {submitLabel}</>}
      </button>
    </form>
  );
}
