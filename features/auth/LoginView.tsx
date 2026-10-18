"use client";

import { useState } from "react";
import { GeoError, GEO_MAX_ACCURACY_M, getUserLocation, type GeoFix } from "@/lib/geo";

/** Saytga kirish sahifasi. Joylashuvga ruxsat berilmasa kirish bloklanadi. */
export default function LoginView() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [stage, setStage] = useState<null | "location" | "auth">(null);
  const [error, setError] = useState<{ text: string; location?: boolean } | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStage("location");
    setAccuracy(null);
    let fix: GeoFix;
    try {
      fix = await getUserLocation(setAccuracy);
    } catch (err) {
      setStage(null);
      const text = err instanceof GeoError ? err.message : String(err);
      setError({ text, location: true });
      return;
    }
    setStage("auth");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password, lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy }),
      });
      const json = await res.json();
      if (!json.success) {
        setError({ text: json.message || "Login yoki parol noto'g'ri!" });
        setStage(null);
        return;
      }
      // Oldingi foydalanuvchining keshlangan ma'lumotlari qolib ketmasin
      try {
        Object.keys(localStorage).filter((k) => k.startsWith("dkp_cache_")).forEach((k) => localStorage.removeItem(k));
      } catch {}
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch {
      setError({ text: "Tarmoq xatosi. Qayta urinib ko'ring." });
      setStage(null);
    }
  };

  const busy = stage !== null;

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
            <div>
              {error.text}
              {error.location && (
                <button type="button" className="auth-link" onClick={() => setGuideOpen(true)}>
                  Qanday yoqiladi? (yo&apos;riqnoma)
                </button>
              )}
            </div>
          </div>
        )}

        <form onSubmit={submit} className="auth-form">
          <label htmlFor="auth-login">Login</label>
          <div className="auth-input">
            <i className="fa-regular fa-user" />
            <input id="auth-login" autoComplete="username" required autoFocus value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Foydalanuvchi nomi" />
          </div>

          <label htmlFor="auth-pass">Parol</label>
          <div className="auth-input">
            <i className="fa-solid fa-lock" />
            <input id="auth-pass" type={showPass ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            <button type="button" className="auth-eye" onClick={() => setShowPass((v) => !v)} aria-label="Parolni ko'rsatish">
              <i className={`fa-regular ${showPass ? "fa-eye-slash" : "fa-eye"}`} />
            </button>
          </div>

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy && <i className="fa-solid fa-spinner fa-spin" />}
            {stage === "location"
              ? `Joylashuv aniqlanmoqda...${accuracy !== null ? ` ±${accuracy} m` : ""}`
              : stage === "auth" ? "Kirilmoqda..." : "Kirish"}
          </button>
        </form>

        <p className="auth-note">
          <i className="fa-solid fa-location-dot" /> Kirish uchun joylashuv ±{GEO_MAX_ACCURACY_M} m aniqlikda aniqlanishi kerak. Kirish vaqti, IP va joylashuv tizim jurnalida saqlanadi.
        </p>
      </div>

      {guideOpen && (
        <div className="auth-modal" onClick={(e) => e.target === e.currentTarget && setGuideOpen(false)}>
          <div className="auth-modal-card">
            <div className="auth-modal-head">
              <h3><i className="fa-solid fa-location-dot" /> Joylashuvni yoqish tartibi</h3>
              <button onClick={() => setGuideOpen(false)} aria-label="Yopish"><i className="fa-solid fa-xmark" /></button>
            </div>
            <p className="auth-modal-sub">Kompyuterda (Google Chrome / Edge):</p>
            <ol>
              <li>Manzil (URL) oldidagi <b>sozlama / qulf</b> belgisini bosing.</li>
              <li><b>Location (Joylashuv)</b> bandini yoqing yoki <b>Reset permission</b> ni bosing.</li>
              <li>Sahifani yangilang (<b>F5</b>).</li>
            </ol>
            <p className="auth-modal-sub">Mobil telefonda:</p>
            <ol>
              <li>Telefon sozlamalarida <b>GPS / Joylashuv</b> yoqilganini tekshiring.</li>
              <li>Brauzer menyusi → <b>Sayt sozlamalari → Joylashuv</b> → ruxsat bering.</li>
            </ol>
            <p className="auth-modal-sub">Aniqlik yetarli bo&apos;lmasa (±{GEO_MAX_ACCURACY_M} m dan katta):</p>
            <ol>
              <li>Kompyuterda <b>Wi-Fi</b> ni yoqing (kabel orqali ulangan bo&apos;lsa ham) — joylashuv Wi-Fi tarmoqlari bo&apos;yicha aniqlanadi.</li>
              <li>Windows: <b>Sozlamalar → Maxfiylik → Joylashuv</b> xizmati yoqilganini tekshiring.</li>
              <li>Telefonda <b>aniq joylashuv (Precise location)</b> ni yoqing, bino ichida bo&apos;lsangiz deraza yoniga o&apos;ting.</li>
              <li>Bir oz kutib, <b>Kirish</b> tugmasini qayta bosing.</li>
            </ol>
            <button className="auth-submit" onClick={() => setGuideOpen(false)}>Tushundim</button>
          </div>
        </div>
      )}
    </div>
  );
}
