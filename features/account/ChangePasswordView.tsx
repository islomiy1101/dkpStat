"use client";

import { useState } from "react";
import PasswordForm from "./PasswordForm";

/** /account/password: majburiy (forced) yoki ixtiyoriy parol almashtirish; saqlangach — o'z bo'limiga */
export default function ChangePasswordView({ login, fullName, forced }: { login: string; fullName: string; forced: boolean }) {
  const [done, setDone] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const logout = async () => {
    setLeaving(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.replace("/login");
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="" width={64} height={64} />
          <h1>Parolni yangilash</h1>
          <p>{fullName || login}</p>
        </div>

        {done ? (
          <div className="pw-done">
            <i className="fa-solid fa-circle-check" />
            <p>Parol muvaffaqiyatli yangilandi.</p>
            <p className="pw-done-sub">Bo&apos;limingizga o&apos;tilmoqda...</p>
          </div>
        ) : (
          <>
            {forced && (
              <div className="pw-notice">
                <i className="fa-solid fa-shield-halved" />
                <div>
                  <b>Xavfsizlik uchun o&apos;z parolingizni o&apos;rnating</b> (kamida 8 belgi). Yangi parol o&apos;rnatmaguncha
                  bo&apos;limlar ochilmaydi.
                </div>
              </div>
            )}
            <PasswordForm login={login} onDone={() => { setDone(true); setTimeout(() => window.location.replace("/"), 1200); }} />
          </>
        )}

        <div className="pw-foot">
          {!forced && !done && <a href="/" className="auth-link"><i className="fa-solid fa-arrow-left" /> Orqaga</a>}
          <button type="button" className="auth-link" onClick={logout} disabled={leaving}>
            <i className="fa-solid fa-right-from-bracket" /> {leaving ? "Chiqilmoqda..." : "Tizimdan chiqish"}
          </button>
        </div>
      </div>
    </div>
  );
}
