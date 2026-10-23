"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { UserRow } from "@/lib/auth-server";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { AREA_LABEL, BlockDialog, SCOPE_LABEL, UnblockDialog, UserFormDialog } from "./UserDialogs";
import PageLoader from "@/components/PageLoader";

/**
 * "Foydalanuvchilar" (faqat superadmin): statistika, filtrlar, sahifalangan ro'yxat;
 * yangi foydalanuvchi, parolni tiklash, bloklash / blokdan chiqarish (oynalar — UserDialogs.tsx).
 * Tiklanganda vaqtinchalik parol bir marta ko'rsatiladi — xodim u bilan kirib, darhol o'z parolini o'rnatadi.
 * Uslub — styles/users.css (.sec-users); oynalar — globals.css (.sb-confirm).
 */
const PER_PAGE = 10;
type Status = "all" | "must" | "ok" | "blocked";

/** "2026-10-25 18:00" → "25.10 18:00" (joriy yil) yoki "25.10.2027 18:00" */
const dmyHm = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})/.exec(s);
  if (!m) return s;
  return `${m[3]}.${m[2]}${Number(m[1]) === new Date().getFullYear() ? "" : `.${m[1]}`} ${m[4]}`;
};

const initials = (name: string, login: string) =>
  (name || login).trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";

/** Sahifa raqamlari: 1 … (joriy ±1) … oxirgi */
function pageList(cur: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const a = Math.max(2, cur - 1);
  const b = Math.min(total - 1, cur + 1);
  if (a > 2) out.push("…");
  for (let p = a; p <= b; p++) out.push(p);
  if (b < total - 1) out.push("…");
  out.push(total);
  return out;
}

export default function UsersView({ self }: { self: string }) {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [branch, setBranch] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<UserRow | null>(null);
  const [resetting, setResetting] = useState(false);
  const [issued, setIssued] = useState<{ fullName: string; login: string; password: string; created?: boolean; warning?: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [blockFor, setBlockFor] = useState<UserRow | null>(null);
  const [editFor, setEditFor] = useState<UserRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [unblockFor, setUnblockFor] = useState<UserRow | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) return window.location.replace("/login?next=/users");
      if (!res.ok || !json.success) throw new Error(json.message || `HTTP ${res.status}`);
      setUsers(json.users || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // "Parolni tiklash" oynasi: Escape bilan yopish (fonga bosish yopmaydi)
  useEffect(() => {
    if (!confirm) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !resetting && setConfirm(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirm, resetting]);

  const all = useMemo(() => users ?? [], [users]);
  const branches = useMemo(() => [...new Set(all.map((u) => u.branch).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [all]);
  const roles = useMemo(() => [...new Set(all.map((u) => u.role))], [all]);
  const mustCount = all.filter((u) => u.mustChange).length;
  const blockedCount = all.filter((u) => u.blocked).length;
  const okCount = all.length - mustCount;
  const okPct = all.length ? Math.round((okCount / all.length) * 100) : 0;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter(
      (u) =>
        (status === "all" || (status === "blocked" ? u.blocked : (status === "must") === u.mustChange)) &&
        (!branch || u.branch === branch) &&
        (!role || u.role === role) &&
        (!s || [u.fullName, u.login, u.department].some((v) => String(v || "").toLowerCase().includes(s)))
    );
  }, [all, q, status, branch, role]);

  useEffect(() => setPage(1), [q, status, branch, role]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const cur = Math.min(page, totalPages);
  const start = (cur - 1) * PER_PAGE;
  const rows = filtered.slice(start, start + PER_PAGE);
  const hasFilter = !!(q || status !== "all" || branch || role);
  const clearFilters = () => {
    setQ("");
    setStatus("all");
    setBranch("");
    setRole("");
  };

  const reset = async (u: UserRow) => {
    setResetting(true);
    setResetError(null);
    try {
      const res = await fetch("/api/admin/users/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: u.login }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || `HTTP ${res.status}`);
      setConfirm(null);
      setCopied(false);
      setIssued({ fullName: u.fullName, login: u.login, password: json.password });
      setUsers((list) => list && list.map((x) => (x.login === u.login ? { ...x, mustChange: true } : x)));
    } catch (e) {
      setResetError((e as Error).message);
    } finally {
      setResetting(false);
    }
  };

  const copy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.password);
      setCopied(true);
    } catch {}
  };

  return (
    <div className="sec-users">
      <header className="us-header">
        <div className="us-title">
          <div className="us-badge"><i className="fa-solid fa-users-gear" /></div>
          <div>
            <h2>Foydalanuvchilar</h2>
            <span>Yangi xodim qo&apos;shish, parolni tiklash va vaqtinchalik bloklash</span>
          </div>
        </div>
        <div className="us-head-actions">
          <button className="us-btn" onClick={() => load()} disabled={loading}>
            <i className={`fa-solid fa-rotate${loading ? " fa-spin" : ""}`} /> Yangilash
          </button>
          <button className="us-btn us-btn-main" onClick={() => setCreating(true)} disabled={!users}>
            <i className="fa-solid fa-user-plus" /> Yangi foydalanuvchi
          </button>
        </div>
      </header>

      <section className="us-stats">
        <button type="button" className={`us-stat c-blue${status === "all" ? " active" : ""}`} onClick={() => setStatus("all")}>
          <span className="us-stat-icon"><i className="fa-solid fa-users" /></span>
          <span className="us-stat-body">
            <small>Jami foydalanuvchilar</small>
            <b>{users ? all.length : "—"}</b>
          </span>
        </button>
        <button type="button" className={`us-stat c-amber${status === "must" ? " active" : ""}`} onClick={() => setStatus("must")}>
          <span className="us-stat-icon"><i className="fa-solid fa-triangle-exclamation" /></span>
          <span className="us-stat-body">
            <small>Parolini almashtirishi kerak</small>
            <b>{users ? mustCount : "—"}{users && all.length > 0 && <em>{100 - okPct}%</em>}</b>
          </span>
        </button>
        <button type="button" className={`us-stat c-green${status === "ok" ? " active" : ""}`} onClick={() => setStatus("ok")}>
          <span className="us-stat-icon"><i className="fa-solid fa-shield-halved" /></span>
          <span className="us-stat-body">
            <small>Murakkab parol o&apos;rnatgan</small>
            <b>{users ? okCount : "—"}{users && all.length > 0 && <em>{okPct}%</em>}</b>
            <span className="us-progress"><i style={{ width: `${okPct}%` }} /></span>
          </span>
        </button>
        <button type="button" className={`us-stat c-red${status === "blocked" ? " active" : ""}`} onClick={() => setStatus("blocked")}>
          <span className="us-stat-icon"><i className="fa-solid fa-ban" /></span>
          <span className="us-stat-body">
            <small>Bloklangan</small>
            <b>{users ? blockedCount : "—"}</b>
          </span>
        </button>
      </section>

      <section className="us-card">
        <div className="us-toolbar">
          <div className="us-search">
            <i className="fa-solid fa-magnifying-glass" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="F.I.O. yoki login bo'yicha qidirish..." />
            {q && <button type="button" onClick={() => setQ("")} aria-label="Tozalash"><i className="fa-solid fa-xmark" /></button>}
          </div>
          <div className="us-seg" role="group" aria-label="Parol holati">
            {([["all", "Barchasi"], ["must", "Almashtirishi kerak"], ["ok", "Murakkab"], ["blocked", "Bloklangan"]] as [Status, string][]).map(([id, label]) => (
              <button key={id} type="button" className={status === id ? "active" : ""} onClick={() => setStatus(id)}>{label}</button>
            ))}
          </div>
          <select className="us-select" value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Filial">
            <option value="">Barcha filiallar</option>
            {branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="us-select" value={role} onChange={(e) => setRole(e.target.value as Role | "")} aria-label="Rol">
            <option value="">Barcha rollar</option>
            {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
          {hasFilter && (
            <button type="button" className="us-clear" onClick={clearFilters}><i className="fa-solid fa-xmark" /> Tozalash</button>
          )}
        </div>

        <div className="us-table-wrap">
          {loading && !users && <PageLoader overlay text="Yuklanmoqda" />}
          <table className="us-table">
            <thead>
              <tr>
                <th className="us-n">№</th>
                <th>Foydalanuvchi</th>
                <th>Login</th>
                <th>Filial</th>
                <th>Rol</th>
                <th>Holat</th>
                <th aria-label="Amal" />
              </tr>
            </thead>
            <tbody>
              {error && (
                <tr><td colSpan={7} className="us-empty is-error"><i className="fa-solid fa-triangle-exclamation" /> {error}</td></tr>
              )}
              {!error && users && rows.length === 0 && (
                <tr><td colSpan={7} className="us-empty"><i className="fa-solid fa-user-slash" /> Foydalanuvchi topilmadi</td></tr>
              )}
              {rows.map((u, i) => {
                const isSelf = u.login.toLowerCase() === self.toLowerCase();
                return (
                  <tr key={u.login}>
                    <td className="us-n">{start + i + 1}</td>
                    <td>
                      <div className="us-user">
                        <span className={`us-avatar r-${u.role}`}>{initials(u.fullName, u.login)}</span>
                        <span className="us-user-text">
                          <b title={u.fullName}>{u.fullName || "—"}</b>
                          {u.department && <small title={u.department}>{u.department}</small>}
                        </span>
                      </div>
                    </td>
                    <td data-label="Login"><span className="us-login">{u.login}</span></td>
                    <td data-label="Filial" className="us-branch">{u.branch || "—"}</td>
                    <td data-label="Rol">
                      <span className={`us-role r-${u.role}`}>{ROLE_LABEL[u.role]}</span>
                      {u.areas.length > 0 && (
                        <span className="us-areas-list">
                          {u.areas.map((o) => (
                            <small key={o.id} className={o.op === "+" ? "us-area-tag is-add" : "us-area-tag is-del"}
                              title={o.op === "+" ? "Rolidan tashqari qo'shilgan bo'lim" : "Roldagi bo'lim shu xodimdan olib tashlangan"}>
                              {o.op === "+" ? "+" : "−"} {AREA_LABEL[o.id as keyof typeof AREA_LABEL]}
                              {o.op === "+" && o.scope && ` (${SCOPE_LABEL[o.scope]})`}
                            </small>
                          ))}
                        </span>
                      )}
                    </td>
                    <td data-label="Holat">
                      <span className="us-status">
                        {u.blocked && (
                          <span className="us-pill is-blocked" title={u.blockReason ? `Sabab: ${u.blockReason}` : undefined}>
                            <i className="fa-solid fa-ban" /> {u.blockedUntil === "muddatsiz" ? "Bloklangan · muddatsiz" : `Bloklangan · ${dmyHm(u.blockedUntil)} gacha`}
                          </span>
                        )}
                        {u.mustChange
                          ? <span className="us-pill is-warn"><i className="fa-solid fa-circle-exclamation" /> Almashtirishi kerak</span>
                          : <span className="us-pill is-ok"><i className="fa-solid fa-shield-halved" /> Murakkab</span>}
                        {u.changedAt && <small className="us-changed">Parol: {dmyHm(u.changedAt.slice(0, 16))}</small>}
                      </span>
                    </td>
                    <td className="us-act">
                      {isSelf ? (
                        <span className="us-actions">
                          <span className="us-self"><i className="fa-solid fa-user-check" /> Siz</span>
                          <button className="us-reset" onClick={() => setEditFor(u)} title="Ma'lumotlarni tahrirlash" aria-label="Tahrirlash">
                            <i className="fa-solid fa-pen" /> <span>Tahrirlash</span>
                          </button>
                        </span>
                      ) : (
                        <span className="us-actions">
                          <button className="us-reset" onClick={() => setEditFor(u)} title="Ma'lumotlarni tahrirlash (rol, filial…)" aria-label="Tahrirlash">
                            <i className="fa-solid fa-pen" /> <span>Tahrirlash</span>
                          </button>
                          <button className="us-reset" onClick={() => { setResetError(null); setConfirm(u); }} title="Parolni tiklash (vaqtinchalik parol)" aria-label="Parolni tiklash">
                            <i className="fa-solid fa-key" /> <span>Tiklash</span>
                          </button>
                          {u.blocked ? (
                            <button className="us-reset is-unblock" onClick={() => setUnblockFor(u)} title="Blokdan chiqarish" aria-label="Blokdan chiqarish">
                              <i className="fa-solid fa-lock-open" /> <span>Ochish</span>
                            </button>
                          ) : (
                            <button className="us-reset is-block" onClick={() => setBlockFor(u)} title="Bloklash" aria-label="Bloklash">
                              <i className="fa-solid fa-ban" /> <span>Bloklash</span>
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="us-pager">
            <span>
              <b>{filtered.length}</b> tadan <b>{start + 1}–{Math.min(start + PER_PAGE, filtered.length)}</b> ko&apos;rsatilmoqda
            </span>
            {totalPages > 1 && (
              <div className="us-pages">
                <button disabled={cur === 1} onClick={() => setPage(cur - 1)} aria-label="Oldingi"><i className="fa-solid fa-chevron-left" /></button>
                {pageList(cur, totalPages).map((p, k) =>
                  p === "…" ? <span key={`e${k}`} className="us-dots">…</span>
                    : <button key={p} className={p === cur ? "active" : ""} onClick={() => setPage(p)}>{p}</button>
                )}
                <button disabled={cur === totalPages} onClick={() => setPage(cur + 1)} aria-label="Keyingi"><i className="fa-solid fa-chevron-right" /></button>
              </div>
            )}
          </div>
        )}
      </section>

      {confirm && (
        <div className="sb-confirm" role="dialog" aria-modal="true" aria-labelledby="us-confirm-title">
          <div className="sb-confirm-card">
            <div className="sb-confirm-icon sb-pw-icon"><i className="fa-solid fa-key" /></div>
            <h3 id="us-confirm-title">Parolni tiklash</h3>
            <p>
              <b>{confirm.fullName || confirm.login}</b> ({confirm.login}) uchun vaqtinchalik parol yaratiladi.
              Joriy paroli ishlamay qoladi, keyingi kirishda yangi parol o&apos;rnatadi.
            </p>
            {resetError && <p className="us-err"><i className="fa-solid fa-circle-exclamation" /> {resetError}</p>}
            <div className="sb-confirm-actions">
              <button className="sb-btn-cancel" onClick={() => setConfirm(null)} disabled={resetting} autoFocus>Bekor qilish</button>
              <button className="sb-btn-danger" onClick={() => reset(confirm)} disabled={resetting}>
                {resetting ? <><i className="fa-solid fa-spinner fa-spin" /> Tiklanmoqda...</> : "Ha, tiklash"}
              </button>
            </div>
          </div>
        </div>
      )}

      {creating && users && (
        <UserFormDialog mode="create" self={self} users={users} onClose={() => setCreating(false)}
          onCreated={(u, password, warning) => { setCreating(false); setCopied(false); setIssued({ ...u, password, created: true, warning }); void load(); }} />
      )}
      {editFor && users && (
        <UserFormDialog mode="edit" user={editFor} self={self} users={users} onClose={() => setEditFor(null)}
          onSaved={(revoked) => {
            setEditFor(null);
            setToast(revoked ? "Saqlandi. Xodim bir daqiqa ichida qayta kirishi so'raladi." : "Ma'lumotlar saqlandi.");
            void load();
          }} />
      )}
      {toast && <div className="us-toast" role="status"><i className="fa-solid fa-circle-check" /> {toast}</div>}
      {blockFor && <BlockDialog user={blockFor} onClose={() => setBlockFor(null)} onDone={() => { setBlockFor(null); void load(); }} />}
      {unblockFor && <UnblockDialog user={unblockFor} onClose={() => setUnblockFor(null)} onDone={() => { setUnblockFor(null); void load(); }} />}

      {issued && (
        <div className="sb-confirm" role="dialog" aria-modal="true" aria-labelledby="us-issued-title">
          <div className="sb-confirm-card">
            <div className="sb-confirm-icon us-ok-icon"><i className="fa-solid fa-circle-check" /></div>
            <h3 id="us-issued-title">{issued.created ? "Foydalanuvchi qo'shildi" : "Vaqtinchalik parol"}</h3>
            <p><b>{issued.fullName || issued.login}</b> — login: <b>{issued.login}</b>. Vaqtinchalik parol:</p>
            <div className="us-temp">
              <code>{issued.password}</code>
              <button type="button" onClick={copy} title="Nusxalash">
                <i className={`fa-solid ${copied ? "fa-check" : "fa-copy"}`} /> {copied ? "Nusxalandi" : "Nusxalash"}
              </button>
            </div>
            <p className="us-warn">Bu parol faqat hozir ko&apos;rsatiladi — xodimga xavfsiz yo&apos;l bilan yetkazing.</p>
            {issued.warning && <p className="us-warn-box"><i className="fa-solid fa-triangle-exclamation" /> {issued.warning}</p>}
            <div className="sb-confirm-actions us-one">
              <button className="sb-btn-cancel" onClick={() => setIssued(null)} autoFocus>Yopish</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
