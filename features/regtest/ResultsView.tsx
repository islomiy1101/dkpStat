"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { downloadBlob } from "@/lib/useClock";
import { QUESTION_COUNT, UNLOCK_SEC, type ResultRow } from "./config";

/**
 * "Test natijalari" — "Натижалар" varag'i dashboardi.
 * Test yechayotgan odam registrator kompyuterida bo'lgani uchun, ochishda tizimga kirgan foydalanuvchi
 * parolini qayta kiritadi (15 daqiqa; yangi test boshlansa yoki "Qulflash" bosilsa — yana qulflanadi).
 */
const PER_PAGE = 10;
type SortKey = "when" | "score" | "spentSec" | "login";

const pad = (n: number) => String(n).padStart(2, "0");
const mmss = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};
const tashkentToday = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() + 5 * 3600_000 - n * 86400_000).toISOString().slice(0, 10);
/** Natijasi bor (yakunlangan) urinish */
const isDone = (r: ResultRow) => r.status === "Yakunlandi" || r.status === "Vaqt tugadi";
const STATUS_CLS: Record<string, string> = { "Vaqt tugadi": " is-late", Jarayonda: " is-live", Yakunlanmagan: " is-gone" };

const tone = (score: number, total: number) => {
  const p = total ? score / total : 0;
  return p >= 0.8 ? "good" : p >= 0.6 ? "mid" : "bad";
};

export default function ResultsView({ login }: { login: string }) {
  const [state, setState] = useState<"checking" | "locked" | "open">("checking");
  const [until, setUntil] = useState<number | null>(null);
  const [rows, setRows] = useState<ResultRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lock = useCallback(async (callServer = true) => {
    if (callServer) await fetch("/api/regtest/unlock", { method: "DELETE" }).catch(() => {});
    setRows(null);
    setUntil(null);
    setState("locked");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/regtest/results", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.status === 401) return window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      if (res.status === 423) return void lock(false);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setRows(json.results as ResultRow[]);
      setUntil(json.until);
      setState("open");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [lock]);

  // Sahifa ochilganda: qulf ochiq bo'lsa (15 daqiqa ichida) — darhol natijalar
  useEffect(() => {
    fetch("/api/regtest/unlock", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j.unlocked ? load() : setState("locked")))
      .catch(() => setState("locked"));
  }, [load]);

  // Qulf muddati tugasa — avtomatik qulflash
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (state !== "open") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state]);
  useEffect(() => {
    if (state === "open" && until && now >= until) void lock(false);
  }, [now, until, state, lock]);

  return (
    <div className="sec-regtest">
      <header className="rt-toolbar">
        <div className="rt-badge"><i className="fa-solid fa-chart-column" /></div>
        <div className="rt-toolbar-text">
          <h2>Test natijalari</h2>
          <span>Registratsiya · «Натижалар» varag&apos;i</span>
        </div>
        {state === "open" && (
          <div className="rt-toolbar-actions">
            {until && <span className="rt-lock-left"><i className="fa-solid fa-lock-open" /> {mmss(Math.min(UNLOCK_SEC, Math.ceil((until - now) / 1000)))} dan keyin qulflanadi</span>}
            <button className="rt-btn" onClick={load} disabled={loading}>
              <i className={`fa-solid fa-rotate${loading ? " fa-spin" : ""}`} /> <span>Yangilash</span>
            </button>
            <button className="rt-btn rt-btn-dark" onClick={() => lock()}>
              <i className="fa-solid fa-lock" /> <span>Qulflash</span>
            </button>
          </div>
        )}
      </header>

      {state === "checking" && <div className="rt-loading"><i className="fa-solid fa-spinner fa-spin" /> Tekshirilmoqda…</div>}
      {state === "locked" && <UnlockCard login={login} onUnlocked={load} />}
      {state === "open" && error && <div className="rt-error"><i className="fa-solid fa-circle-exclamation" /> {error}</div>}
      {state === "open" && rows && <Dashboard rows={rows} />}
    </div>
  );
}

/* ---------------- Qulf ---------------- */

function UnlockCard({ login, onUnlocked }: { login: string; onUnlocked: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/regtest/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setPassword("");
      await onUnlocked();
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="rt-start">
      <form className="rt-start-card rt-unlock" onSubmit={submit}>
        <div className="rt-unlock-icon"><i className="fa-solid fa-lock" /></div>
        <h3>Natijalar himoyalangan</h3>
        <p>Natijalarni ko&apos;rish uchun tizimga kirgan foydalanuvchi parolini qayta kiriting.</p>
        <div className="rt-unlock-login"><i className="fa-solid fa-user-shield" /> {login}</div>
        <label className="rt-pass">
          <input
            type={show ? "text" : "password"}
            autoComplete="current-password"
            autoFocus
            placeholder="Parol"
            value={password}
            onChange={(e) => setPassword(e.target.value.replace(/\s/g, ""))}
            onKeyDown={(e) => e.key === " " && e.preventDefault()}
            disabled={busy}
          />
          <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Parolni yashirish" : "Parolni ko'rsatish"}>
            <i className={`fa-solid ${show ? "fa-eye-slash" : "fa-eye"}`} />
          </button>
        </label>
        {err && <div className="rt-error"><i className="fa-solid fa-circle-exclamation" /> {err}</div>}
        <button className="rt-btn rt-btn-primary rt-btn-lg rt-btn-block" disabled={!password || busy}>
          {busy ? <><i className="fa-solid fa-spinner fa-spin" /> Tekshirilmoqda…</> : <><i className="fa-solid fa-unlock" /> Ochish</>}
        </button>
        <small className="rt-unlock-note">Ochilgandan keyin 15 daqiqa amal qiladi. Yangi test boshlansa — avtomatik qulflanadi.</small>
      </form>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */

function Dashboard({ rows }: { rows: ResultRow[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "when", dir: -1 });
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const out = rows.filter(
      (r) =>
        (!from || r.date >= from) &&
        (!to || r.date <= to) &&
        (!status || r.status === status) &&
        (!s || r.pinfl.includes(s) || r.login.toLowerCase().includes(s) || r.fio.toLowerCase().includes(s))
    );
    const val = (r: ResultRow) => (sort.key === "when" ? `${r.date} ${r.time}` : sort.key === "login" ? r.login.toLowerCase() : r[sort.key]);
    return out.sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir);
  }, [rows, from, to, q, status, sort]);

  useEffect(() => setPage(1), [from, to, q, status, sort]);

  const stats = useMemo(() => {
    const n = filtered.length;
    const today = tashkentToday();
    // Ball ko'rsatkichlari faqat yakunlangan testlardan (Jarayonda / Yakunlanmagan — balli yo'q)
    const done = filtered.filter(isDone);
    const avg = done.length ? done.reduce((s, r) => s + r.score, 0) / done.length : 0;
    const total = done[0]?.total || QUESTION_COUNT;
    const dist = Array.from({ length: total + 1 }, () => 0);
    for (const r of done) dist[Math.max(0, Math.min(total, Math.round(r.score)))]++;
    return {
      n,
      done: done.length,
      today: filtered.filter((r) => r.date === today).length,
      avg,
      total,
      max: done.length ? Math.max(...done.map((r) => r.score)) : 0,
      timeout: filtered.filter((r) => r.status === "Vaqt tugadi").length,
      unfinished: filtered.filter((r) => r.status === "Yakunlanmagan").length,
      live: filtered.filter((r) => r.status === "Jarayonda").length,
      dist,
      distMax: Math.max(1, ...dist),
    };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const cur = Math.min(page, totalPages);
  const shown = filtered.slice((cur - 1) * PER_PAGE, cur * PER_PAGE);

  const sortBy = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : "");

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(
      filtered.map((r, i) => ({
        "№": i + 1, Sana: r.date, Vaqt: r.time, Login: r.login, PINFL: r.pinfl, "F.I.O.": r.fio, "Savol soni": r.total,
        "To'g'ri": r.correct, "Noto'g'ri": r.wrong, Javobsiz: r.unanswered, Ball: r.score,
        "Sarflangan vaqt": mmss(r.spentSec), Holat: r.status,
      }))
    );
    ws["!cols"] = [5, 12, 10, 16, 18, 34, 10, 9, 10, 9, 7, 15, 13].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Natijalar");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `Test_natijalari_${tashkentToday()}.xlsx`);
  };

  const pages = useMemo(() => {
    const set = new Set([1, totalPages, cur - 1, cur, cur + 1].filter((p) => p >= 1 && p <= totalPages));
    const list = [...set].sort((a, b) => a - b);
    const out: (number | "...")[] = [];
    list.forEach((p, i) => {
      if (i && p - list[i - 1] > 1) out.push("...");
      out.push(p);
    });
    return out;
  }, [cur, totalPages]);

  return (
    <div className="rt-dash">
      <div className="rt-kpis">
        <Kpi icon="fa-clipboard-list" label="Jami testlar" value={stats.n} />
        <Kpi icon="fa-calendar-day" label="Bugun" value={stats.today} />
        <Kpi icon="fa-chart-simple" label="O'rtacha ball" value={`${stats.avg.toFixed(1)} / ${stats.total}`} sub={`${Math.round((stats.avg / stats.total) * 100) || 0}%`} />
        <Kpi icon="fa-trophy" label="Eng yuqori ball" value={`${stats.max} / ${stats.total}`} />
        <Kpi icon="fa-hourglass-end" label="Vaqt tugagan / yakunlanmagan" value={`${stats.timeout} / ${stats.unfinished}`}
          sub={stats.live ? `${stats.live} ta jarayonda` : undefined} tone={stats.timeout + stats.unfinished ? "bad" : undefined} />
      </div>

      <div className="rt-panel">
        <div className="rt-panel-head"><h3><i className="fa-solid fa-chart-column" /> Ball taqsimoti</h3><span>{stats.done} ta yakunlangan test</span></div>
        <div className="rt-dist">
          {stats.dist.map((c, score) => (
            <div key={score} className="rt-dist-col" title={`${score} ball — ${c} ta`}>
              <span className="rt-dist-n">{c || ""}</span>
              <i className={`tone-${tone(score, stats.total)}`} style={{ height: `${(c / stats.distMax) * 100}%` }} />
              <span className="rt-dist-x">{score}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rt-panel">
        <div className="rt-filters">
          <label className="rt-search">
            <i className="fa-solid fa-magnifying-glass" />
            <input placeholder="PINFL, F.I.O. yoki login…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label><span>Dan</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label><span>Gacha</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label>
            <span>Holat</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Barchasi</option>
              <option>Yakunlandi</option>
              <option>Vaqt tugadi</option>
              <option>Jarayonda</option>
              <option>Yakunlanmagan</option>
            </select>
          </label>
          <div className="rt-chips">
            <button onClick={() => { setFrom(tashkentToday()); setTo(tashkentToday()); }}>Bugun</button>
            <button onClick={() => { setFrom(daysAgo(6)); setTo(""); }}>7 kun</button>
            <button onClick={() => { setFrom(daysAgo(29)); setTo(""); }}>30 kun</button>
            {(from || to || q || status) && <button onClick={() => { setFrom(""); setTo(""); setQ(""); setStatus(""); }}>Tozalash</button>}
          </div>
          <button className="rt-btn rt-btn-excel" onClick={exportExcel} disabled={!filtered.length}>
            <i className="fa-solid fa-file-excel" /> Excel
          </button>
        </div>

        <div className="rt-table-wrap">
          <table className="rt-table">
            <thead>
              <tr>
                <th>№</th>
                <th className="sortable" onClick={() => sortBy("when")}>Sana / vaqt{arrow("when")}</th>
                <th className="sortable" onClick={() => sortBy("login")}>Login{arrow("login")}</th>
                <th>PINFL</th>
                <th>F.I.O.</th>
                <th className="sortable" onClick={() => sortBy("score")}>Ball{arrow("score")}</th>
                <th>To&apos;g&apos;ri</th>
                <th>Noto&apos;g&apos;ri</th>
                <th>Javobsiz</th>
                <th className="sortable" onClick={() => sortBy("spentSec")}>Sarflangan{arrow("spentSec")}</th>
                <th>Holat</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.testId || `${r.date}${r.time}${r.pinfl}`}>
                  <td className="muted">{(cur - 1) * PER_PAGE + i + 1}</td>
                  <td><b>{r.date}</b> <span className="muted">{r.time}</span></td>
                  <td><span className="rt-login">{r.login}</span></td>
                  <td className="rt-mono">{r.pinfl}</td>
                  <td className="rt-fio" title={r.fio || undefined}>{r.fio || <span className="muted">—</span>}</td>
                  {isDone(r) ? (
                    <>
                      <td><span className={`rt-badge-score tone-${tone(r.score, r.total)}`}>{r.score} / {r.total}</span></td>
                      <td className="t-good">{r.correct}</td>
                      <td className="t-bad">{r.wrong}</td>
                      <td className="muted">{r.unanswered}</td>
                      <td>{mmss(r.spentSec)}</td>
                    </>
                  ) : (
                    <td colSpan={5} className="muted rt-nores">— natija yo&apos;q —</td>
                  )}
                  <td><span className={`rt-status${STATUS_CLS[r.status] || ""}`}>{r.status || "—"}</span></td>
                </tr>
              ))}
              {!shown.length && (
                <tr><td colSpan={11} className="rt-empty">Natija topilmadi</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rt-pager">
          <span className="muted">{filtered.length ? `${filtered.length} tadan ${(cur - 1) * PER_PAGE + 1}–${Math.min(cur * PER_PAGE, filtered.length)}` : ""}</span>
          {totalPages > 1 && (
            <div className="rt-pages">
              <button disabled={cur === 1} onClick={() => setPage(cur - 1)} aria-label="Oldingi"><i className="fa-solid fa-chevron-left" /></button>
              {pages.map((p, i) => (p === "..." ? <span key={`d${i}`}>…</span> : <button key={p} className={p === cur ? "active" : ""} onClick={() => setPage(p)}>{p}</button>))}
              <button disabled={cur === totalPages} onClick={() => setPage(cur + 1)} aria-label="Keyingi"><i className="fa-solid fa-chevron-right" /></button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, sub, tone: t }: { icon: string; label: string; value: React.ReactNode; sub?: string; tone?: string }) {
  return (
    <div className={`rt-kpi${t ? ` tone-${t}` : ""}`}>
      <div className="rt-kpi-icon"><i className={`fa-solid ${icon}`} /></div>
      <div>
        <span>{label}</span>
        <b>{value}</b>
        {sub && <small>{sub}</small>}
      </div>
    </div>
  );
}
