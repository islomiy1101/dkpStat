"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LogRow } from "@/lib/auth-server";

const PER_PAGE = 25;
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function LogsView() {
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [branch, setBranch] = useState("");
  const [dept, setDept] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/logs${fresh ? "?fresh=1" : ""}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        window.location.replace("/login?next=/logs");
        return;
      }
      if (!res.ok) throw new Error(json.error || json.message || `HTTP ${res.status}`);
      setLogs(json.logs || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const all = useMemo(() => logs || [], [logs]);
  const branches = useMemo(() => [...new Set(all.map((l) => l.branch).filter(Boolean))].sort(), [all]);
  const departments = useMemo(
    () => [...new Set(all.filter((l) => !branch || l.branch === branch).map((l) => l.department).filter(Boolean))].sort(),
    [all, branch]
  );

  // ---- Statistika (filtrlarga bog'liq emas) ----
  const stats = useMemo(() => {
    const today = ymd(new Date());
    const weekAgo = ymd(new Date(Date.now() - 6 * 86_400_000));
    let todayCount = 0;
    let weekCount = 0;
    const weekUsers = new Set<string>();
    const todayUsers = new Set<string>();
    const branchCount: Record<string, number> = {};
    for (const l of all) {
      const d = l.dateTime.slice(0, 10);
      if (d === today) {
        todayCount++;
        todayUsers.add(l.login.toLowerCase());
      }
      if (d >= weekAgo && d <= today) {
        weekCount++;
        weekUsers.add(l.login.toLowerCase());
        if (l.branch) branchCount[l.branch] = (branchCount[l.branch] || 0) + 1;
      }
    }
    const topBranches = Object.entries(branchCount).sort((a, b) => b[1] - a[1]);
    return { todayCount, todayUsers: todayUsers.size, weekCount, weekUsers: weekUsers.size, topBranches };
  }, [all]);

  // ---- Filtrlash ----
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter((l) => {
      const d = l.dateTime.slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (branch && l.branch !== branch) return false;
      if (dept && l.department !== dept) return false;
      if (t && ![l.fullName, l.login, l.ip, l.branch, l.department].some((v) => (v || "").toLowerCase().includes(t))) return false;
      return true;
    });
  }, [all, q, from, to, branch, dept]);

  useEffect(() => setPage(1), [q, from, to, branch, dept]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const cur = Math.min(page, totalPages);
  const start = (cur - 1) * PER_PAGE;
  const rows = filtered.slice(start, start + PER_PAGE);
  const hasFilter = !!(q || from || to || branch || dept);

  const pages = useMemo(() => {
    const out: (number | "...")[] = [];
    if (totalPages <= 7) for (let i = 1; i <= totalPages; i++) out.push(i);
    else {
      out.push(1);
      const s = Math.max(2, cur - 1);
      const e = Math.min(totalPages - 1, cur + 1);
      if (s > 2) out.push("...");
      for (let i = s; i <= e; i++) out.push(i);
      if (e < totalPages - 1) out.push("...");
      out.push(totalPages);
    }
    return out;
  }, [totalPages, cur]);

  const resetFilters = () => {
    setQ("");
    setFrom("");
    setTo("");
    setBranch("");
    setDept("");
  };

  const setQuickRange = (days: number) => {
    setFrom(ymd(new Date(Date.now() - (days - 1) * 86_400_000)));
    setTo(ymd(new Date()));
  };

  const exportExcel = async () => {
    if (filtered.length === 0) {
      alert("Eksport qilish uchun yozuvlar yo'q!");
      return;
    }
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(
      filtered.map((l, i) => ({
        "№": i + 1,
        "Sana va vaqt": l.dateTime,
        "F.I.Sh": l.fullName,
        Login: l.login,
        Filial: l.branch,
        "Bo'lim": l.department,
        IP: l.ip,
        Joylashuv: l.location,
        "Aniqlik (m)": l.accuracy,
      }))
    );
    ws["!cols"] = [6, 20, 30, 16, 24, 22, 16, 44, 12].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kirishlar");
    XLSX.writeFile(wb, `Kirishlar_tarixi_${ymd(new Date())}.xlsx`);
  };

  const maxBranch = stats.topBranches[0]?.[1] || 1;

  return (
    <div className="sec-logs">
      <header className="lg-header">
        <div className="lg-title">
          <div className="lg-badge"><i className="fa-solid fa-clock-rotate-left" /></div>
          <div>
            <h2>Kirishlar tarixi</h2>
            <span>Tizimga kim, qachon, qaysi IP va joylashuvdan kirgani</span>
          </div>
        </div>
        <div className="lg-actions">
          <button className="lg-btn" onClick={() => load(true)} disabled={loading}>
            <i className={`fa-solid fa-rotate${loading ? " fa-spin" : ""}`} /> Yangilash
          </button>
          <button className="lg-btn lg-btn-excel" onClick={exportExcel} disabled={!logs}>
            <i className="fa-solid fa-file-excel" /> Excel{hasFilter ? ` (${filtered.length})` : ""}
          </button>
        </div>
      </header>

      {/* Statistika */}
      <section className="lg-stats">
        <div className="lg-stat">
          <div className="lg-stat-icon c-blue"><i className="fa-solid fa-right-to-bracket" /></div>
          <div><span>Bugungi kirishlar</span><h3>{logs ? stats.todayCount : "—"}</h3><small>{logs ? `${stats.todayUsers} nafar foydalanuvchi` : ""}</small></div>
        </div>
        <div className="lg-stat">
          <div className="lg-stat-icon c-green"><i className="fa-solid fa-calendar-week" /></div>
          <div><span>Oxirgi 7 kun</span><h3>{logs ? stats.weekCount : "—"}</h3><small>kirishlar soni</small></div>
        </div>
        <div className="lg-stat">
          <div className="lg-stat-icon c-violet"><i className="fa-solid fa-users" /></div>
          <div><span>Faol foydalanuvchilar</span><h3>{logs ? stats.weekUsers : "—"}</h3><small>oxirgi 7 kunda</small></div>
        </div>
        <div className="lg-stat lg-stat-wide">
          <div className="lg-stat-head"><span>Filiallar kesimida (7 kun)</span></div>
          <div className="lg-bars">
            {stats.topBranches.slice(0, 4).map(([b, n]) => (
              <button key={b} className={`lg-bar${branch === b ? " active" : ""}`} onClick={() => setBranch(branch === b ? "" : b)} title="Shu filial bo'yicha filtrlash">
                <span className="lg-bar-name">{b}</span>
                <span className="lg-bar-track"><span style={{ width: `${Math.max((n / maxBranch) * 100, 4)}%` }} /></span>
                <span className="lg-bar-val">{n}</span>
              </button>
            ))}
            {logs && stats.topBranches.length === 0 && <span className="lg-muted">Oxirgi 7 kunda kirish yo&apos;q</span>}
          </div>
        </div>
      </section>

      {/* Filtrlar */}
      <section className="lg-card">
        <div className="lg-filters">
          <div className="lg-search">
            <i className="fa-solid fa-magnifying-glass" />
            <input placeholder="F.I.Sh, login, IP, filial..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="lg-field">
            <span>Dan</span>
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="lg-field">
            <span>Gacha</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="lg-field">
            <span>Filial</span>
            <select value={branch} onChange={(e) => { setBranch(e.target.value); setDept(""); }}>
              <option value="">Barchasi</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label className="lg-field">
            <span>Bo&apos;lim</span>
            <select value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="">Barchasi</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
        </div>
        <div className="lg-quick">
          <button onClick={() => setQuickRange(1)}>Bugun</button>
          <button onClick={() => setQuickRange(7)}>7 kun</button>
          <button onClick={() => setQuickRange(30)}>30 kun</button>
          {hasFilter && <button className="lg-reset" onClick={resetFilters}><i className="fa-solid fa-xmark" /> Filtrlarni tozalash</button>}
        </div>

        {/* Jadval */}
        <div className="lg-table-wrap">
          {loading && !logs && <div className="lg-overlay"><div className="lg-spinner" /><span>Loglar yuklanmoqda...</span></div>}
          <table className="lg-table">
            <thead>
              <tr>
                <th style={{ width: 48 }}>№</th>
                <th style={{ width: 150 }}>Sana va vaqt</th>
                <th>F.I.Sh</th>
                <th style={{ width: 130 }}>Login</th>
                <th>Filial</th>
                <th>Bo&apos;lim</th>
                <th style={{ width: 130 }}>IP</th>
                <th style={{ width: 110 }}>Joylashuv</th>
                <th style={{ width: 80 }}>Aniqlik</th>
              </tr>
            </thead>
            <tbody>
              {error && (
                <tr><td colSpan={9} className="lg-empty lg-error"><i className="fa-solid fa-triangle-exclamation" /> {error}</td></tr>
              )}
              {!error && logs && rows.length === 0 && (
                <tr><td colSpan={9} className="lg-empty">{hasFilter ? "Filtr bo'yicha yozuv topilmadi" : "Hozircha kirishlar yo'q"}</td></tr>
              )}
              {rows.map((l, i) => {
                const [d, t] = l.dateTime.split(" ");
                const isMap = /^https?:\/\//.test(l.location);
                return (
                  <tr key={`${l.dateTime}-${l.login}-${start + i}`}>
                    <td className="lg-num">{start + i + 1}</td>
                    <td><span className="lg-date">{d}</span> <span className="lg-time">{t}</span></td>
                    <td className="lg-name">{l.fullName}</td>
                    <td><code className="lg-code">{l.login}</code></td>
                    <td>{l.branch}</td>
                    <td className="lg-muted">{l.department}</td>
                    <td><code className="lg-code">{l.ip}</code></td>
                    <td>
                      {isMap ? (
                        <a href={l.location} target="_blank" rel="noopener noreferrer" className="lg-map"><i className="fa-solid fa-location-dot" /> Xarita</a>
                      ) : (
                        <span className="lg-muted">{l.location || "—"}</span>
                      )}
                    </td>
                    <td className="lg-muted">{l.accuracy ? `±${l.accuracy} m` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="lg-pager">
          <span className="lg-muted">
            {filtered.length > 0 ? `${filtered.length} tadan ${start + 1}–${Math.min(start + PER_PAGE, filtered.length)} ko'rsatilmoqda` : ""}
            {hasFilter && logs ? ` (jami ${all.length})` : ""}
          </span>
          {totalPages > 1 && (
            <div className="lg-pages">
              <button disabled={cur === 1} onClick={() => setPage(cur - 1)} aria-label="Oldingi"><i className="fa-solid fa-chevron-left" /></button>
              {pages.map((p, i) =>
                p === "..." ? <span key={`d${i}`} className="lg-dots">…</span> : (
                  <button key={p} className={p === cur ? "active" : ""} onClick={() => setPage(p)}>{p}</button>
                )
              )}
              <button disabled={cur === totalPages} onClick={() => setPage(cur + 1)} aria-label="Keyingi"><i className="fa-solid fa-chevron-right" /></button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
