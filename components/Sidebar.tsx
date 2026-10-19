"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SECTIONS } from "@/lib/sections";
import { canSee, ROLE_LABEL, type AreaId, type Role } from "@/lib/roles";
import { useData, type SlotStatus } from "./DataProvider";

const STATUS_LABEL: Record<SlotStatus, string> = {
  idle: "Kutilmoqda",
  loading: "Yuklanmoqda…",
  ready: "Tayyor",
  error: "Xatolik",
};

export type SidebarUser = { login: string; fullName: string; branch: string; department: string; role: Role };

/** Ma'lumot bo'limi bo'lmagan ilovalar (DataProvider'ga bog'lanmagan) — "Bo'limlar" ro'yxatida chiqadi */
type NavChild = { href: string; title: string; icon: string };
const TOOL_LINKS: { id: AreaId; href: string; title: string; subtitle: string; icon: string; children: NavChild[] }[] = [
  {
    id: "regtest",
    href: "/regtest",
    title: "Registratsiya",
    subtitle: "Registratorlar testi",
    icon: "fa-solid fa-clipboard-question",
    children: [
      { href: "/regtest/test", title: "Test yechish", icon: "fa-solid fa-pen-to-square" },
      { href: "/regtest/natijalar", title: "Test natijalari", icon: "fa-solid fa-chart-column" },
    ],
  },
];

/** Bo'limchali bo'lim: bosilganda ochiladi/yopiladi; joriy sahifa shu ichida bo'lsa — doim ochiq */
function NavGroup({ id, inner, tip, items, isActive, isOpen, onToggle, pathname, collapsed }: {
  id: string;
  inner: React.ReactNode;
  tip?: string;
  items: NavChild[];
  isActive: boolean;
  isOpen: boolean;
  onToggle: () => void;
  pathname: string | null;
  collapsed: boolean;
}) {
  return (
    <div key={id} className={`sb-group${isOpen ? " open" : ""}`}>
      <button type="button" className={`sb-item sb-group-toggle${isActive ? " active-parent" : ""}`} title={tip}
        aria-expanded={isOpen} onClick={onToggle}>
        {inner}
        <i className="fa-solid fa-chevron-down sb-caret" />
      </button>
      {isOpen && (
        <div className="sb-children">
          {items.map((c) => (
            <Link key={c.href} href={c.href} prefetch title={collapsed ? c.title : undefined}
              className={`sb-child${pathname?.startsWith(c.href) ? " active" : ""}`}>
              <i className={c.icon} />
              <span>{c.title}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Superadmin sahifalari (ma'lumot bo'limlaridan alohida, DataProvider'ga bog'lanmagan) */
const ADMIN_LINKS: { id: AreaId; href: string; title: string; subtitle: string; icon: string }[] = [
  { id: "upload", href: "/upload", title: "Bazaga yuklash", subtitle: "Excel → Google Sheets", icon: "fa-solid fa-file-arrow-up" },
  { id: "logs", href: "/logs", title: "Log", subtitle: "Kirishlar tarixi", icon: "fa-solid fa-clock-rotate-left" },
];

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
  const [confirmOut, setConfirmOut] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  // Escape bilan yopish
  useEffect(() => {
    if (!confirmOut) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !leaving && setConfirmOut(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmOut, leaving]);

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

  const sections = SECTIONS.filter((s) => canSee(user.role, s.id));
  const adminLinks = ADMIN_LINKS.filter((l) => canSee(user.role, l.id));
  const toolLinks = TOOL_LINKS.filter((l) => canSee(user.role, l.id));
  const subLinks = [...sections, ...toolLinks].flatMap((s) => ("children" in s ? s.children : []));
  const active = [...subLinks, ...sections, ...toolLinks, ...adminLinks].find((s) => pathname?.startsWith(s.href));

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
            <span className="sb-role">{ROLE_LABEL[user.role]}</span>
          </div>
          <button className="sb-logout" onClick={() => { setMobileOpen(false); setConfirmOut(true); }} title="Tizimdan chiqish" aria-label="Tizimdan chiqish">
            <i className="fa-solid fa-right-from-bracket" />
          </button>
        </div>

        <div className="sb-label">Bo&apos;limlar</div>
        <nav className="sb-nav">
          {sections.map((s) => {
            const slot = state[s.id];
            const isActive = pathname?.startsWith(s.href);
            const st: SlotStatus = slot.refreshing && slot.status !== "ready" ? "loading" : slot.status;
            const inner = (
              <>
                <span className="sb-icon">
                  <i className={s.icon} />
                </span>
                <span className="sb-text">
                  <span className="sb-title">{s.title}</span>
                  <span className="sb-sub">{s.subtitle}</span>
                </span>
                <span className={`sb-status st-${st}${slot.refreshing ? " is-refreshing" : ""}`} title={STATUS_LABEL[st]} />
              </>
            );
            const tip = collapsed ? `${s.title} — ${STATUS_LABEL[st]}` : undefined;
            if (!("children" in s)) {
              return (
                <Link key={s.id} href={s.href} prefetch className={`sb-item${isActive ? " active" : ""}`} title={tip}>
                  {inner}
                </Link>
              );
            }
            const isOpen = !!(isActive || openGroups[s.id]);
            return (
              <NavGroup key={s.id} id={s.id} inner={inner} tip={tip} items={s.children} isActive={!!isActive} isOpen={isOpen}
                onToggle={() => setOpenGroups((g) => ({ ...g, [s.id]: !isOpen }))} pathname={pathname} collapsed={collapsed} />
            );
          })}

          {toolLinks.map((l) => {
            const isActive = !!pathname?.startsWith(l.href);
            const isOpen = isActive || !!openGroups[l.id];
            return (
              <NavGroup key={l.id} id={l.id} tip={collapsed ? l.title : undefined} items={l.children} isActive={isActive} isOpen={isOpen}
                onToggle={() => setOpenGroups((g) => ({ ...g, [l.id]: !isOpen }))} pathname={pathname} collapsed={collapsed}
                inner={
                  <>
                    <span className="sb-icon"><i className={l.icon} /></span>
                    <span className="sb-text">
                      <span className="sb-title">{l.title}</span>
                      <span className="sb-sub">{l.subtitle}</span>
                    </span>
                  </>
                } />
            );
          })}

          {adminLinks.length > 0 && <div className="sb-divider" />}
          {adminLinks.map((l) => (
            <Link key={l.id} href={l.href} className={`sb-item${pathname?.startsWith(l.href) ? " active" : ""}`} title={collapsed ? l.title : undefined}>
              <span className="sb-icon"><i className={l.icon} /></span>
              <span className="sb-text">
                <span className="sb-title">{l.title}</span>
                <span className="sb-sub">{l.subtitle}</span>
              </span>
            </Link>
          ))}
        </nav>

        {/* Ma'lumot bo'limlari bo'lmasa (masalan, faqat RegTest) — yangilash paneli kerak emas */}
        {sections.length > 0 && (
        <div className="sb-footer">
          <button className="sb-refresh" onClick={onRefreshAll} disabled={busy} title="Barcha bo'limlarni parallel yangilash">
            <i className={`fa-solid fa-rotate${busy ? " fa-spin" : ""}`} />
            <span>Barchasini yangilash</span>
          </button>
        </div>
        )}
      </aside>

      {confirmOut && (
        <div className="sb-confirm" role="dialog" aria-modal="true" aria-labelledby="sb-confirm-title"
          onClick={(e) => e.target === e.currentTarget && !leaving && setConfirmOut(false)}>
          <div className="sb-confirm-card">
            <div className="sb-confirm-icon"><i className="fa-solid fa-right-from-bracket" /></div>
            <h3 id="sb-confirm-title">Tizimdan chiqish</h3>
            <p>
              <b>{user.fullName || user.login}</b>, haqiqatan ham tizimdan chiqmoqchimisiz?
            </p>
            <div className="sb-confirm-actions">
              <button className="sb-btn-cancel" onClick={() => setConfirmOut(false)} disabled={leaving} autoFocus>
                Bekor qilish
              </button>
              <button className="sb-btn-danger" disabled={leaving}
                onClick={async () => { setLeaving(true); await logout(); }}>
                {leaving ? <><i className="fa-solid fa-spinner fa-spin" /> Chiqilmoqda...</> : "Ha, chiqish"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
