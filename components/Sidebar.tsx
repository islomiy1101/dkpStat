"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SECTIONS } from "@/lib/sections";
import { useData, type SlotStatus } from "./DataProvider";

const STATUS_LABEL: Record<SlotStatus, string> = {
  idle: "Kutilmoqda",
  loading: "Yuklanmoqda…",
  ready: "Tayyor",
  error: "Xatolik",
  locked: "Kirish talab qilinadi",
};

function timeAgo(ts?: number) {
  if (!ts) return "";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export type SidebarUser = { login: string; fullName: string; branch: string; department: string; role: "admin" | "user" };

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  try {
    Object.keys(localStorage).filter((k) => k.startsWith("dkp_cache_")).forEach((k) => localStorage.removeItem(k));
  } catch {}
  window.location.replace("/login");
}

export default function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const { state, refreshAll } = useData();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("dkp_sidebar_collapsed") === "1");
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.dataset.sidebar = collapsed ? "collapsed" : "open";
  }, [collapsed]);
  useEffect(() => setMobileOpen(false), [pathname]);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("dkp_sidebar_collapsed", c ? "0" : "1");
      } catch {}
      return !c;
    });
  };

  const active = SECTIONS.find((s) => pathname?.startsWith(s.href)) || (pathname?.startsWith("/logs") ? { title: "Kirishlar tarixi" } : undefined);
  const isAdmin = user.role === "admin";

  const onRefreshAll = async () => {
    setBusy(true);
    await refreshAll();
    setBusy(false);
  };

  return (
    <>
      {/* Mobil yuqori panel */}
      <div className="app-topbar">
        <button className="app-burger" onClick={() => setMobileOpen(true)} aria-label="Menyuni ochish">
          <i className="fa-solid fa-bars" />
        </button>
        <span className="app-topbar-title">{active?.title || "DKP Namangan"}</span>
      </div>
      {mobileOpen && <div className="app-scrim" onClick={() => setMobileOpen(false)} />}

      <aside className={`app-sidebar${mobileOpen ? " mobile-open" : ""}`}>
        <div className="sb-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="" width={36} height={36} />
          <div className="sb-brand-text">
            <strong>DKP Namangan</strong>
            <span>Monitoring tizimi</span>
          </div>
          <button className="sb-collapse" onClick={toggle} title={collapsed ? "Kengaytirish" : "Yig'ish"}>
            <i className={`fa-solid ${collapsed ? "fa-angles-right" : "fa-angles-left"}`} />
          </button>
        </div>

        {/* Avtorizatsiyadan o'tgan foydalanuvchi */}
        <div className="sb-user" title={collapsed ? `${user.fullName} — ${user.branch}` : undefined}>
          <div className="sb-avatar">{initials(user.fullName || user.login)}</div>
          <div className="sb-user-info">
            <span className="sb-user-name">{user.fullName || user.login}</span>
            <span className="sb-user-branch"><i className="fa-solid fa-building-columns" /> {user.branch}</span>
            {user.department && <span className="sb-user-dept">{user.department}</span>}
            {isAdmin && <span className="sb-role">Admin</span>}
          </div>
          <button className="sb-logout" onClick={logout} title="Tizimdan chiqish" aria-label="Tizimdan chiqish">
            <i className="fa-solid fa-right-from-bracket" />
          </button>
        </div>

        <div className="sb-label">Bo&apos;limlar</div>
        <nav className="sb-nav">
          {SECTIONS.map((s) => {
            const slot = state[s.id];
            const isActive = pathname?.startsWith(s.href);
            const st: SlotStatus = slot.refreshing && slot.status !== "ready" ? "loading" : slot.status;
            return (
              <Link
                key={s.id}
                href={s.href}
                prefetch
                className={`sb-item${isActive ? " active" : ""}`}
                title={collapsed ? `${s.title} — ${STATUS_LABEL[st]}` : undefined}
              >
                <span className="sb-icon">
                  <i className={s.icon} />
                </span>
                <span className="sb-text">
                  <span className="sb-title">{s.title}</span>
                  <span className="sb-sub">{s.subtitle}</span>
                </span>
                <span className={`sb-status st-${st}${slot.refreshing ? " is-refreshing" : ""}`} title={STATUS_LABEL[st]}>
                  {st === "locked" ? <i className="fa-solid fa-lock" /> : null}
                </span>
              </Link>
            );
          })}

          {isAdmin && (
            <>
              <div className="sb-divider" />
              <Link href="/logs" className={`sb-item${pathname?.startsWith("/logs") ? " active" : ""}`} title={collapsed ? "Kirishlar tarixi (Log)" : undefined}>
                <span className="sb-icon"><i className="fa-solid fa-clock-rotate-left" /></span>
                <span className="sb-text">
                  <span className="sb-title">Log</span>
                  <span className="sb-sub">Kirishlar tarixi · faqat admin</span>
                </span>
              </Link>
            </>
          )}
        </nav>

        <div className="sb-footer">
          <button className="sb-refresh" onClick={onRefreshAll} disabled={busy} title="Barcha bo'limlarni parallel yangilash">
            <i className={`fa-solid fa-rotate${busy ? " fa-spin" : ""}`} />
            <span>Barchasini yangilash</span>
          </button>
          <div className="sb-meta">
            {SECTIONS.map((s) => (
              <div key={s.id} className="sb-meta-row">
                <span>{s.source}</span>
                <span>{state[s.id].updatedAt ? timeAgo(state[s.id].updatedAt) : "—"}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}
