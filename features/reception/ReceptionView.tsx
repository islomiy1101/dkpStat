"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSection, type ReceptionPayload } from "@/components/DataProvider";
import ReportActions from "@/components/ReportActions";
import PageLoader from "@/components/PageLoader";
import { useReportCapture } from "@/lib/useReportCapture";
import { useClock, fmtDate, fmtHM } from "@/lib/useClock";
import { sameBranch } from "@/lib/roles";
import { isSuperAdmin, parseLocalDate, TUMANLAR } from "@/features/advice/utils";
import type { ReceptionMurojaat, ReceptionXodim } from "@/lib/types";
import { exportByDates, exportRegionalSummary, exportWeekly } from "./excel";
import AdminDashboard from "./AdminDashboard";
import { EMPTY_RANGE, dateKey, filterByPeriod, type DateRange, type Period } from "./stats";

/**
 * "Filial qabulxonasi" — branchreceptionist/myjs.js ning React ko'rinishi.
 * Alohida login yo'q: tuman sayt foydalanuvchisidan serverda olinadi (/api/reception/data).
 * Viloyat doirasidagi rollar ("Boshqarma") uchun tepada analitika paneli (AdminDashboard), forma yo'q.
 */

const ITEMS_PER_PAGE = 7;
type Alert = { text: string; type: "success" | "danger" } | null;
type Form = { passport: string; fio: string; tuman: string; manzil: string; maqsad: string; qabulQildi: string; lavozim: string };
const EMPTY_FORM: Form = { passport: "", fio: "", tuman: "", manzil: "", maqsad: "", qabulQildi: "", lavozim: "" };

async function postAction(payload: Record<string, unknown>) {
  try {
    const res = await fetch("/api/reception/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (res.status === 401) window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    if (res.status === 403) return { success: false, message: "Ruxsat yo'q" };
    return await res.json();
  } catch {
    return { success: false, message: "Tarmoq ulanishida xatolik yuz berdi!" };
  }
}

/** Original toggleLoading(): tugma ichida spinner + matn */
const BtnLabel = ({ loading, text }: { loading: boolean; text: string }) =>
  loading ? (<><span className="spinner" /> {text}</>) : <>{text}</>;

/** Passport maskasi: 2 lotin harf + 7 raqam (original setupPassportValidation) */
function maskPassport(raw: string) {
  const val = raw.toUpperCase().replace(/\s/g, "");
  let out = "";
  for (const ch of val) {
    if (out.length < 2) { if (/[A-Z]/.test(ch)) out += ch; }
    else if (out.length < 9) { if (/[0-9]/.test(ch)) out += ch; }
  }
  return out;
}

/** Original setupPaginationControls(): 1 … (joriy±1) … oxirgi */
function pageList(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  let start = Math.max(2, current - 1);
  let end = Math.min(total - 1, current + 1);
  if (current <= 3) end = 4;
  else if (current >= total - 2) start = total - 3;
  const pages: (number | "...")[] = [1];
  if (start > 2) pages.push("...");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("...");
  pages.push(total);
  return pages;
}

const xodimlarOf = (all: ReceptionXodim[], tuman: string) => (tuman ? all.filter((x) => sameBranch(x.tuman, tuman)) : all);

export default function ReceptionView() {
  const slot = useSection("reception");
  const session = slot.data?.session ?? null;
  return (
    <div className="sec-reception">
      <div className="container">
        {session && slot.data ? (
          // Keshdagi boshqa foydalanuvchi ma'lumotidan keyin sessiya tumani o'zgarsa — forma va filtrlar qaytadan
          <Dashboard key={session.tuman} data={slot.data} />
        ) : (
          slot.status === "error" ? (
            <div style={{ padding: 40, textAlign: "center", color: "#dc2626" }}>Ma&apos;lumotlarni yuklashda xatolik: {slot.error || ""}</div>
          ) : (
            <PageLoader />
          )
        )}
      </div>
    </div>
  );
}

function Dashboard({ data }: { data: ReceptionPayload }) {
  const slot = useSection("reception");
  const now = useClock();
  const { session, xodimlar, murojaatlar } = data;
  const isAdmin = isSuperAdmin(session.tuman);
  // Filial rahbari: o'z tumani bo'yicha analitika paneli + ro'yxat (faqat ko'rish, forma yo'q)
  const readOnly = !!session.analytics;
  const panel = isAdmin || readOnly;
  const reportRef = useRef<HTMLDivElement>(null);
  // Rasm / Chop etish — faqat Boshqarma analitika paneli (header + dashboard). Pechat — 2 sahifa, matnli
  // (dinamika va gavjum vaqtlar — data-print-skip, 2-sahifa — data-print-page="2"; styles/analytics.css → .print-mode)
  const cap = useReportCapture(reportRef, { fileName: () => `DKP_Namangan_Filial_qabulxonasi_${fmtDate(new Date())}.png`, background: "#f1f5f9", windowWidth: 1400, pagedPrint: true });
  const ownTuman = isAdmin ? "" : session.tuman;

  const [form, setForm] = useState<Form>({ ...EMPTY_FORM, tuman: ownTuman });
  const [formAlert, setFormAlert] = useState<Alert>(null);
  const [tableAlert, setTableAlert] = useState<Alert>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [ketdiBusy, setKetdiBusy] = useState<number | null>(null);
  const [updating, setUpdating] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [tumanFilter, setTumanFilter] = useState("");
  // Davr filtri faqat analitika panelida (admin, filial rahbari); filial xodimi ko'rinishida butun ro'yxat
  const [period, setPeriod] = useState<Period>(panel ? "30" : "all");
  const [range, setRange] = useState<DateRange>(EMPTY_RANGE);
  // Chip — sana oralig'i tozalanadi; sana tanlansa — "custom", ikkalasi bo'shatilsa — standart davr
  const choosePeriod = (p: Period) => {
    setPeriod(p);
    if (p !== "custom") setRange(EMPTY_RANGE);
  };
  const chooseRange = (r: DateRange) => {
    setRange(r);
    setPeriod(r.from || r.to ? "custom" : panel ? "30" : "all");
  };
  const [page, setPage] = useState(1);
  const [dateModal, setDateModal] = useState<{ open: boolean; start: string; end: string }>({ open: false, start: "", end: "" });
  const today = now ? dateKey(now) : "";

  // Muvaffaqiyat xabarlari bir necha soniyadan keyin yo'qoladi (original kabi)
  useEffect(() => {
    if (formAlert?.type !== "success") return;
    const t = setTimeout(() => setFormAlert(null), 5000);
    return () => clearTimeout(t);
  }, [formAlert]);
  useEffect(() => {
    if (tableAlert?.type !== "success") return;
    const t = setTimeout(() => setTableAlert(null), 3000);
    return () => clearTimeout(t);
  }, [tableAlert]);

  const sorted = useMemo(() => [...murojaatlar].sort((a, b) => Number(b.id) - Number(a.id)), [murojaatlar]);

  // Davr + tuman filtri: panel diagrammalari, ro'yxat va hisobotlar uchun umumiy
  const scoped = useMemo(() => {
    const byTuman = tumanFilter ? sorted.filter((m) => sameBranch(m.tuman, tumanFilter)) : sorted;
    return today ? filterByPeriod(byTuman, period, today, range) : byTuman;
  }, [sorted, tumanFilter, period, today, range]);

  const filtered = useMemo(() => {
    let rows = scoped;
    const txt = search.trim().toLowerCase();
    if (txt) {
      rows = rows.filter((m) =>
        m.fio.toLowerCase().includes(txt) || m.passport.toLowerCase().includes(txt) || m.tuman.toLowerCase().includes(txt)
      );
    }
    return rows;
  }, [scoped, search]);
  useEffect(() => setPage(1), [search, tumanFilter, period, range]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const curPage = Math.min(page, totalPages);
  const startIndex = (curPage - 1) * ITEMS_PER_PAGE;
  const pageItems = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const formXodimlar = useMemo(() => xodimlarOf(xodimlar, form.tuman), [xodimlar, form.tuman]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const onSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setSearch("");
    await slot.refresh(true);
    setSyncing(false);
  };

  // Hisobotlar joriy filtr (tuman / karta / qidiruv) bo'yicha; filtr bo'sh natija bersa — butun baza
  const exportSource = () => (filtered.length > 0 ? filtered : sorted);
  const openDateModal = () => setDateModal({ open: true, start: today, end: today });
  const confirmDateExport = () => {
    if (!dateModal.start || !dateModal.end) {
      alert("Iltimos, boshlanish va tugash sanalarini to'liq tanlang!");
      return;
    }
    const st = parseLocalDate(dateModal.start)!;
    const en = parseLocalDate(dateModal.end)!;
    if (st > en) {
      alert("Boshlanish sanasi tugash sanasidan katta bo'lishi mumkin emas!");
      return;
    }
    setDateModal((d) => ({ ...d, open: false }));
    exportByDates(exportSource(), st, en);
  };

  const onPassport = async (raw: string) => {
    const passport = maskPassport(raw);
    set("passport", passport);
    if (!/^[A-Z]{2}\d{7}$/.test(passport)) return;
    setFormAlert({ text: "Passport tekshirilmoqda...", type: "success" });
    const res = await postAction({ action: "searchByPassport", passport });
    if (res.exists && res.data) {
      setForm((f) => ({
        ...f,
        fio: String(res.data.fio || f.fio),
        manzil: String(res.data.manzil || f.manzil),
        // Filial xodimi uchun tuman o'zgarmaydi
        tuman: isAdmin && res.data.tuman ? String(res.data.tuman) : f.tuman,
      }));
      setFormAlert({ text: `Fuqaro aniqlandi. Avval ${res.murojaatSoni} marotaba murojaat qilgan.`, type: "success" });
    } else if (res.success === false) {
      setFormAlert({ text: res.message || "Xatolik", type: "danger" });
    } else {
      setFormAlert({ text: "Yangi fuqaro.", type: "success" });
    }
  };

  const onQabulQildi = (fio: string) => {
    const found = formXodimlar.find((x) => x.fio.trim() === fio.trim());
    setForm((f) => ({ ...f, qabulQildi: fio, lavozim: found ? found.lavozim : "" }));
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])) as Form;
    if (f.qabulQildi && !f.lavozim) {
      setFormAlert({ text: "Xatolik: \"Kim qabul qildi\" maydonida xodimni ro'yxatdan tanlang!", type: "danger" });
      return;
    }
    if (!f.fio || !f.tuman || !f.manzil || !f.maqsad || !f.qabulQildi || !f.lavozim) {
      setFormAlert({ text: "Xatolik: Formadagi barcha maydonlarni to'ldirish majburiy!", type: "danger" });
      return;
    }
    setSaving(true);
    const res = await postAction({ action: "saveMurojaat", formData: f });
    setSaving(false);
    if (res.success) {
      setFormAlert({ text: res.message, type: "success" });
      setForm({ ...EMPTY_FORM, tuman: ownTuman });
      setSearch("");
      await slot.refresh(true);
    } else {
      setFormAlert({ text: res.message || "Xatolik", type: "danger" });
    }
  };

  const onKetdi = async (rowNum: number) => {
    setKetdiBusy(rowNum);
    const res = await postAction({ action: "setKetdiVaqti", rowNum });
    setKetdiBusy(null);
    if (res.success) {
      slot.mutate((d) => ({ ...d, murojaatlar: d.murojaatlar.map((m) => (m.rowNum === rowNum ? { ...m, ketdi: res.vaqt } : m)) }));
    } else {
      setTableAlert({ text: "Xatolik yuz berdi: " + (res.message || ""), type: "danger" });
    }
  };

  const onInlineUpdate = async (item: ReceptionMurojaat, fio: string) => {
    const found = xodimlarOf(xodimlar, item.tuman).find((x) => x.fio === fio);
    if (!found) return;
    setUpdating(item.rowNum);
    const res = await postAction({ action: "updateMurojaat", rowNum: item.rowNum, qabulQildi: fio, lavozim: found.lavozim });
    setUpdating(null);
    if (res.success) {
      slot.mutate((d) => ({
        ...d,
        murojaatlar: d.murojaatlar.map((m) => (m.rowNum === item.rowNum ? { ...m, qabulQildi: fio, lavozim: found.lavozim } : m)),
      }));
      setTableAlert({ text: `Murojaat №${item.id} muvaffaqiyatli yangilandi! Yangi biriktirilgan xodim: ${fio}`, type: "success" });
    } else {
      setTableAlert({ text: "Xatolik: " + (res.message || ""), type: "danger" });
    }
  };

  const tableLoading = syncing || (slot.refreshing && !slot.data);

  return (
    <>
      <div ref={reportRef} className={panel ? `print-page rc-report${cap.capturing ? " capturing" : ""}` : undefined}>
      <div className="header-panel">
        <div>
          <h2 className="rc-title">Filial qabulxonasi — murojaatlar monitoringi</h2>
          <span className="rc-tuman-badge">{isAdmin ? `Boshqarma | ${session.fio || "Viloyat bo'yicha"}` : `Tuman: ${session.tuman}`}</span>
        </div>
        <div className="status-container">
          <button className={`btn-sync no-print${syncing ? " spinning" : ""}`} onClick={onSync} disabled={syncing} data-html2canvas-ignore>
            <svg viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" /></svg>
            Sinxronizatsiya
          </button>
          <div className="realtime-indicator"><span className="dot" /> Real vaqt</div>
          <div className="live-clock">{now ? `${fmtDate(now)} ${fmtHM(now)}` : "--.--.---- --:--"}</div>
          {panel && (
            <ReportActions onImage={cap.saveImage} imageBusy={cap.busy} onPrint={cap.print} printBusy={cap.printing} disabled={!today} hidden={cap.capturing} />
          )}
        </div>
      </div>

      {panel && today && (
        <AdminDashboard scoped={scoped} today={today} period={period} onPeriod={choosePeriod} range={range} onRange={chooseRange}
          tuman={tumanFilter} onTuman={setTumanFilter} fixedTuman={isAdmin ? undefined : session.tuman} totalAll={murojaatlar.length}
          actions={
            <>
              <button type="button" className="btn-excel-date" onClick={openDateModal} title="Sana oralig'i bo'yicha Excel hisobot">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z" /></svg>
                Sana bo&apos;yicha
              </button>
              <button type="button" className="btn-excel" onClick={() => exportWeekly(exportSource())} title="Joriy hafta (dushanba — juma) bo'yicha Excel hisobot">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg>
                Haftalik
              </button>
              {isAdmin && (
                <button type="button" className="btn-excel-summary" onClick={() => exportRegionalSummary(sorted)} title="Butun baza bo'yicha viloyat yig'ma Excel hisoboti">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 3h16c1.1 0 2 .9 2 2v14c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2zm0 4v3h4V7H4zm6 0v3h10V7H10zm-6 5v3h4v-3H4zm6 0v3h10v-3H10zm-6 5v3h4v-3H4zm6 0v3h10v-3H10z" /></svg>
                  Viloyat yig&apos;ma
                </button>
              )}
            </>
          }
        />
      )}
      </div>

      {!isAdmin && (
        <div className="dashboard-grid" style={readOnly ? { gridTemplateColumns: "1fr", marginTop: 16 } : undefined}>
          {!readOnly && <div className="card">
            <h3>Yangi Murojaat Qo&apos;shish</h3>
            {formAlert && <div className={`alert alert-${formAlert.type}`}>{formAlert.text}</div>}
            <form onSubmit={onSave}>
              <div className="form-group">
                <label>Passport Seriya va Raqami</label>
                <input type="text" className="form-control" placeholder="AA1234567" maxLength={9} value={form.passport} onChange={(e) => onPassport(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Fuqaro F.I.O</label>
                <input type="text" className="form-control" required placeholder="F.I.O kiriting" value={form.fio} onChange={(e) => set("fio", e.target.value)} />
              </div>
              <div className="form-group">
                <label>Tumani</label>
                <select className="form-control" required disabled={!isAdmin} value={form.tuman}
                  onChange={(e) => setForm((f) => ({ ...f, tuman: e.target.value, qabulQildi: "", lavozim: "" }))}>
                  <option value="" disabled>Tumanni tanlang</option>
                  {(TUMANLAR.includes(form.tuman) || !form.tuman ? TUMANLAR : [form.tuman, ...TUMANLAR]).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>MFY / Manzil</label>
                <input type="text" className="form-control" required placeholder="MFY nomi, ko'cha va uy" value={form.manzil} onChange={(e) => set("manzil", e.target.value)} />
              </div>
              <div className="form-group">
                <label>Kelishdan Maqsad</label>
                <input type="text" className="form-control" required placeholder="Kelish sababi" value={form.maqsad} onChange={(e) => set("maqsad", e.target.value)} />
              </div>
              <div className="form-group">
                <label>Kim Qabul qildi</label>
                <input type="text" className="form-control" list="rc-xodimlar-list" required placeholder="Xodim F.I.O" value={form.qabulQildi} onChange={(e) => onQabulQildi(e.target.value)} />
                <datalist id="rc-xodimlar-list">
                  {formXodimlar.map((x) => <option key={`${x.tuman}|${x.fio}`} value={x.fio} />)}
                </datalist>
                {form.tuman && formXodimlar.length === 0 && (
                  <small style={{ color: "var(--danger-color)", display: "block", marginTop: 4 }}>
                    Bu tuman uchun xodimlar ro&apos;yxati topilmadi — Sinxronizatsiya qiling yoki administratorga murojaat qiling.
                  </small>
                )}
              </div>
              <div className="form-group">
                <label>Lavozimi</label>
                <input type="text" className="form-control" readOnly required value={form.lavozim} style={{ background: "#e9ecef" }} />
              </div>
              <button type="submit" className={`btn btn-primary${saving ? " btn-disabled" : ""}`} disabled={saving}>
                <BtnLabel loading={saving} text={saving ? "Saqlanmoqda..." : "Saqlash"} />
              </button>
            </form>
          </div>}

          <div className="card table-card">
            <div className="table-card-header">
              <h3>
                Murojaatlar Ro&apos;yxati
                {tumanFilter && (
                  <button type="button" className="rc-filter-chip" onClick={() => setTumanFilter("")} title="Filtrni bekor qilish">
                    {tumanFilter} ✕
                  </button>
                )}
              </h3>
              <div className="table-actions-wrapper">
                <div className="search-container">
                  <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.637 10.636Z" />
                  </svg>
                  <input type="text" className="search-input" placeholder="F.I.O, passport yoki tuman bo'yicha izlash..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
              </div>
            </div>

            {tableAlert && <div className={`table-alert alert-${tableAlert.type}`}>{tableAlert.text}</div>}

            <div className="table-wrapper">
              {tableLoading && (
                <div className="table-loader-overlay">
                  <div className="table-loader-circle" />
                  <div className="table-loader-text">Murojaatlar yuklanmoqda...</div>
                </div>
              )}
              <table>
                <thead>
                  <tr>
                    <th>№</th><th>Sana</th><th>Passport</th><th>F.I.O</th><th>Tumani</th><th>Keldi / Ketdi</th>
                    <th>Maqsad</th><th>Qabul qiluvchi / Lavozim</th><th>Qayta</th><th>Amal</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: "center", fontWeight: 600, color: search || tumanFilter || period !== (panel ? "30" : "all") ? "var(--danger-color)" : "#666" }}>
                        {search || tumanFilter || period !== (panel ? "30" : "all") ? "Qidiruv bo'yicha hech qanday ma'lumot topilmadi." : "Bazada hali birorta ham murojaat mavjud emas."}
                      </td>
                    </tr>
                  ) : (
                    pageItems.map((item, i) => {
                      const rowXodimlar = xodimlarOf(xodimlar, item.tuman);
                      const known = rowXodimlar.some((x) => x.fio === item.qabulQildi);
                      return (
                        <tr key={item.rowNum}>
                          <td>{startIndex + i + 1}</td>
                          <td style={{ whiteSpace: "nowrap", color: "#555" }}>{item.sana || "Mavjud emas"}</td>
                          <td><b>{item.passport || "Mavjud emas"}</b></td>
                          <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{item.fio || "Mavjud emas"}</td>
                          <td style={{ whiteSpace: "nowrap", color: "var(--primary-color)", fontWeight: 500 }}>{item.tuman || "Mavjud emas"}</td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            🕒 Keldi: <b>{item.keldi || "Mavjud emas"}</b><br />🕒 Ketdi: <b>{item.ketdi || "-"}</b>
                          </td>
                          <td className="rc-maqsad">{item.maqsad || "Mavjud emas"}</td>
                          <td>
                            {readOnly ? <b>{item.qabulQildi || "—"}</b> : <select className="table-select" value={item.qabulQildi} disabled={updating === item.rowNum}
                              style={{ opacity: updating === item.rowNum ? 0.5 : 1 }} onChange={(e) => onInlineUpdate(item, e.target.value)}>
                              {!known && <option value={item.qabulQildi}>{item.qabulQildi || "—"}</option>}
                              {rowXodimlar.map((x) => <option key={x.fio} value={x.fio}>{x.fio}</option>)}
                            </select>}
                            <br />
                            <small style={{ color: "#666", display: "inline-block", marginTop: 4 }}>{item.lavozim || "Mavjud emas"}</small>
                          </td>
                          <td><span className={`badge${item.qaytaMurojaat > 1 ? " badge-qayta" : ""}`}>{item.qaytaMurojaat} m</span></td>
                          <td>
                            {readOnly && !item.ketdi ? (
                              <span style={{ color: "#d97706", fontWeight: "bold" }}>Jarayonda</span>
                            ) : !item.ketdi ? (
                              <button className={`btn btn-success${ketdiBusy === item.rowNum ? " btn-disabled" : ""}`} disabled={ketdiBusy === item.rowNum} onClick={() => onKetdi(item.rowNum)}>
                                <BtnLabel loading={ketdiBusy === item.rowNum} text={ketdiBusy === item.rowNum ? "..." : "Ketdi"} />
                              </button>
                            ) : (
                              <span style={{ color: "gray", fontWeight: "bold" }}>Yakunlangan</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="pagination-wrapper">
              <div className="pagination-info">
                {filtered.length > 0 && `${filtered.length} tadan ${startIndex + 1}-${Math.min(startIndex + ITEMS_PER_PAGE, filtered.length)} qatorlar ko'rsatilmoqda`}
              </div>
              {totalPages > 1 && (
                <div className="pagination-buttons">
                  <button className="page-btn" disabled={curPage === 1} onClick={() => setPage(curPage - 1)}>«</button>
                  {pageList(curPage, totalPages).map((p, i) =>
                    p === "..." ? (
                      <span key={`d${i}`} className="page-dots">...</span>
                    ) : (
                      <button key={p} className={`page-btn${p === curPage ? " active" : ""}`} onClick={() => setPage(p)}>{p}</button>
                    )
                  )}
                  <button className="page-btn" disabled={curPage === totalPages} onClick={() => setPage(curPage + 1)}>»</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SANA BO'YICHA HISOBOT MODALI */}
      {dateModal.open && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setDateModal((d) => ({ ...d, open: false }))}>
          <div className="modal-card">
            <div className="modal-icon">📅</div>
            <h4>Sana oralig&apos;i bo&apos;yicha hisobot</h4>
            <div className="form-group">
              <label htmlFor="rc-export-start">Boshlanish sanasi</label>
              <input type="date" id="rc-export-start" className="form-control" value={dateModal.start} onChange={(e) => setDateModal((d) => ({ ...d, start: e.target.value }))} />
            </div>
            <div className="form-group">
              <label htmlFor="rc-export-end">Tugash sanasi</label>
              <input type="date" id="rc-export-end" className="form-control" value={dateModal.end} onChange={(e) => setDateModal((d) => ({ ...d, end: e.target.value }))} />
            </div>
            <div className="modal-buttons">
              <button onClick={confirmDateExport} className="btn-modal-yes">Yuklab olish</button>
              <button onClick={() => setDateModal((d) => ({ ...d, open: false }))} className="btn-modal-no">Bekor qilish</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
