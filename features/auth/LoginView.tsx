"use client";

import { useState } from "react";

/** Login va parolda bo'sh joy bo'lmaydi: yozilsa ham, nusxalab qo'yilsa ham olib tashlanadi */
const noSpaces = (v: string) => v.replace(/\s/g, "");
const blockSpace = (e: React.KeyboardEvent) => {
  if (e.key === " " || e.key === "Spacebar") e.preventDefault();
};

/** Saytga kirish sahifasi: login va parol (joylashuv so'ralmaydi) */
export default function LoginView() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message || "Login yoki parol noto'g'ri!");
        setBusy(false);
        return;
      }
      // Oldingi foydalanuvchining keshlangan ma'lumotlari qolib ketmasin
      try {
        Object.keys(localStorage).filter((k) => k.startsWith("dkp_cache_")).forEach((k) => localStorage.removeItem(k));
      } catch {}
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch {
      setError("Tarmoq xatosi. Qayta urinib ko'ring.");
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="" width={72} height={72} />
          <h1>DKP Namangan</h1>
          <p>Monitoring tizimiga kirish</p>
        </div>

        {error && (
          <div className="auth-alert" role="alert">
            <i className="fa-solid fa-circle-exclamation" />
            <div>{error}</div>
          </div>
        )}

        <form onSubmit={submit} className="auth-form">
          <label htmlFor="auth-login">Login</label>
          <div className="auth-input">
            <i className="fa-regular fa-user" />
            <input id="auth-login" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus value={login}
              onChange={(e) => setLogin(noSpaces(e.target.value))} onKeyDown={blockSpace} placeholder="Foydalanuvchi nomi" />
          </div>

          <label htmlFor="auth-pass">Parol</label>
          <div className="auth-input">
            <i className="fa-solid fa-lock" />
            <input id="auth-pass" type={showPass ? "text" : "password"} autoComplete="current-password" required value={password}
              onChange={(e) => setPassword(noSpaces(e.target.value))} onKeyDown={blockSpace} placeholder="••••••••" />
            <button type="button" className="auth-eye" onClick={() => setShowPass((v) => !v)} aria-label="Parolni ko'rsatish">
              <i className={`fa-regular ${showPass ? "fa-eye-slash" : "fa-eye"}`} />
            </button>
          </div>

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy && <i className="fa-solid fa-spinner fa-spin" />}
            {busy ? "Kirilmoqda..." : "Kirish"}
          </button>
        </form>

        <p className="auth-note">
          <i className="fa-solid fa-shield-halved" /> Kirish vaqti va IP manzil tizim jurnalida saqlanadi.
        </p>
      </div>
    </div>
  );
}
