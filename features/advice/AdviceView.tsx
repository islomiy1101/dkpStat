"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSection } from "@/components/DataProvider";
import ReportActions from "@/components/ReportActions";
import PageLoader from "@/components/PageLoader";
import { useReportCapture } from "@/lib/useReportCapture";
import { useClock, fmtDate, fmtHM } from "@/lib/useClock";
import type { AdviceSessionInfo, Murojaat, Natija } from "@/lib/types";
import {
  ITEMS_PER_PAGE, TUMANLAR, cyrillicToLatin, formatFioTitleCase, getLatestDailyAppeals,
  isFilial, isIjobiy, isSuperAdmin, isVakolatsiz, normalizeName, parseLocalDate,
} from "./utils";
import { exportRegionalSummary, exportWeekly, generateExcelReportByDates } from "./excel";
import AdviceDashboard from "./AdviceDashboard";
import { sameBranch } from "@/lib/roles";
import { EMPTY_RANGE, dateKey, filterByPeriod, type DateRange, type Period } from "@/lib/analytics";

type Alert = { text: string; type: "success" | "danger" } | null;
type StatusFilter = "all" | "ijobiy" | "filial" | "vakolatsiz";

async function postAction(payload: Record<string, unknown>) {
  try {
    const res = await fetch("/api/advice/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    return await res.json();
  } catch {
    return { success: false, message: "Tarmoq xatosi yuz berdi!" };
  }
}

/** Original toggleLoading(): tugma ichida spinner + matn */
const BtnLabel = ({ loading, text }: { loading: boolean; text: string }) =>
  loading ? (<><span className="spinner" /> {text}</>) : <>{text}</>;

export default function AdviceView() {
  const slot = useSection("advice");
  // Alohida login yo'q: sessiya sayt foydalanuvchisidan serverda quriladi (/api/advice/data)
  const session = slot.data?.session ?? null;
  const [showLatin, setShowLatin] = useState(false);

  // Lotin alifbosi eslatmasi — filial xodimiga brauzer sessiyasida bir marta
  useEffect(() => {
    if (!session || isSuperAdmin(session.tuman) || session.analytics) return;
    try {
      if (sessionStorage.getItem("dkp_advice_latin_seen")) return;
      sessionStorage.setItem("dkp_advice_latin_seen", "1");
    } catch {}
    setShowLatin(true);
  }, [session]);

  return (
    <div className="sec-advice">
      <div className="container">
        {session ? (
          <Dashboard session={session} />
        ) : (
          slot.status === "error" ? (
            <div style={{ padding: 40, textAlign: "center", color: "#dc2626" }}>Ma&apos;lumotlarni yuklashda xatolik: {slot.error || ""}</div>
          ) : (
            <PageLoader />
          )
        )}
      </div>

      {/* LOTIN ALIFBOSI ESLATMASI */}
      <div id="latin-modal" className="modal-overlay" style={{ display: showLatin ? "flex" : "none" }}>
        <div className="modal-card" style={{ width: 380 }}>
          <div className="modal-icon" style={{ fontSize: 42 }}>ℹ️</div>
          <h4 style={{ color: "var(--primary-color)", marginBottom: 10 }}>Muhim eslatma!</h4>
          <p style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.5, marginBottom: 22 }}>
            Murojaatlarni ro&apos;yxatga olish jarayonida barcha ma&apos;lumotlarni (F.I.O, MFY, Kelishdan maqsad) <b>faqat Lotin alifbosida</b> kiritishingiz so&apos;raladi.
          </p>
          <div className="modal-buttons">
            <button onClick={() => setShowLatin(false)} className="btn-primary" style={{ width: "100%", padding: 10, borderRadius: 6 }}>Tushundim</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   DASHBOARD
   ========================================================================= */
function Dashboard({ session }: { session: AdviceSessionInfo }) {
  const slot = useSection("advice");
  const now = useClock();
  const isAdmin = isSuperAdmin(session.tuman);
  // Filial rahbari: o'z tumani bo'yicha analitika paneli + ro'yxat (faqat ko'rish, forma yo'q)
  const readOnly = !!session.analytics;
  const panel = isAdmin || readOnly;
  const reportRef = useRef<HTMLDivElement>(null);
  // Rasm / Chop etish — faqat Boshqarma analitika paneli (header + dashboard). Pechat — 2 sahifa, matnli
  // (dinamika va gavjum vaqtlar — data-print-skip, 2-sahifa — data-print-page="2"; styles/analytics.css → .print-mode)
  const cap = useReportCapture(reportRef, { fileName: () => `DKP_Namangan_Maslahat_burchagi_${fmtDate(new Date())}.png`, background: "#f1f5f9", windowWidth: 1400, pagedPrint: true });

  const all = useMemo(() => slot.data?.murojaatlar || [], [slot.data]);
  const mahallalar = useMemo(() => slot.data?.mahallalar || [], [slot.data]);
  const masullar = slot.data?.masullar || {};
  const tableLoading = !slot.data && (slot.status === "loading" || slot.refreshing);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [syncing, setSyncing] = useState(false);
  const [tableAlert, setTableAlert] = useState<string | null>(null);
  const [ketdiBusy, setKetdiBusy] = useState<number | null>(null);
  const [savingChora, setSavingChora] = useState<number | null>(null);
  const [pendingChora, setPendingChora] = useState<{ rowNum: number; natijaTuri: Natija } | null>(null);
  const [dateModal, setDateModal] = useState<{ open: boolean; start: string; end: string }>({ open: false, start: "", end: "" });
  // Analitika paneli (faqat admin): davr va tuman filtri
  const [period, setPeriod] = useState<Period>("30");
  const [range, setRange] = useState<DateRange>(EMPTY_RANGE);
  // Chip — sana oralig'i tozalanadi; sana tanlansa — "custom", ikkalasi bo'shatilsa — standart davr
  const choosePeriod = (p: Period) => {
    setPeriod(p);
    if (p !== "custom") setRange(EMPTY_RANGE);
  };
  const chooseRange = (r: DateRange) => {
    setRange(r);
    setPeriod(r.from || r.to ? "custom" : "30");
  };
  const [tumanFilter, setTumanFilter] = useState("");

  // Original applyCombinedFilters()
  const filtered = useMemo(() => {
    let result = getLatestDailyAppeals(all, false);
    if (statusFilter !== "all") {
      result = result.filter((i) => (statusFilter === "ijobiy" ? isIjobiy(i) : statusFilter === "filial" ? isFilial(i) : isVakolatsiz(i)));
    }
    const txt = search.trim().toLowerCase();
    if (txt) {
      result = result.filter((i) =>
        (i.fio && i.fio.toLowerCase().includes(txt)) ||
        (i.tel && i.tel.toLowerCase().includes(txt)) ||
        (i.tuman && i.tuman.toLowerCase().includes(txt)) ||
        (i.manzil && i.manzil.toLowerCase().includes(txt)) ||
        (i.maqsad && i.maqsad.toLowerCase().includes(txt))
      );
    }
    return result;
  }, [all, statusFilter, search]);

  useEffect(() => setPage(1), [statusFilter, search]);

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const curPage = Math.min(page, totalPages);
  const startIndex = (curPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
  const pageItems = filtered.slice(startIndex, endIndex);

  // Panel, hisobotlar: bir kunda takrorlangan fuqaro bir marta, davr va tuman bo'yicha
  const today = now ? dateKey(now) : "";
  const scoped = useMemo(() => {
    if (!panel || !today) return [];
    const daily = getLatestDailyAppeals(all, false);
    const byTuman = tumanFilter ? daily.filter((m) => sameBranch(m.tuman, tumanFilter)) : daily;
    return filterByPeriod(byTuman, period, today, range);
  }, [all, panel, today, tumanFilter, period, range]);

  const manualSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setSearch("");
    setStatusFilter("all");
    await slot.refresh(true);
    setSyncing(false);
  };

  const exportSource = () => (panel ? (scoped.length > 0 ? scoped : all) : filtered.length > 0 ? filtered : all);
  const excelCtx = { isAdmin, sessionTuman: session.tuman, masullar };

  const handleKetdi = async (rowNum: number) => {
    setKetdiBusy(rowNum);
    const res = await postAction({ action: "setKetdiVaqti", rowNum });
    setKetdiBusy(null);
    if (res.success) {
      slot.mutate((d) => ({ ...d, murojaatlar: d.murojaatlar.map((m) => (m.rowNum === rowNum ? { ...m, ketdi: res.vaqt } : m)) }));
    } else {
      alert("Xatolik yuz berdi: " + res.message);
    }
  };

  const confirmChora = async (yes: boolean) => {
    const p = pendingChora;
    setPendingChora(null);
    if (!yes || !p) return;
    setSavingChora(p.rowNum);
    const res = await postAction({ action: "updateNatija", rowNum: p.rowNum, natijaTuri: p.natijaTuri });
    setSavingChora(null);
    if (res.success) {
      const found = all.find((m) => m.rowNum === p.rowNum);
      slot.mutate((d) => ({
        ...d,
        murojaatlar: d.murojaatlar.map((m) =>
          m.rowNum === p.rowNum
            ? { ...m, natija: p.natijaTuri, ...(p.natijaTuri === "ijobiy" ? { ijobiy: 1 } : p.natijaTuri === "filial" ? { filial: 1 } : { vakolatsiz: 1 }) }
            : m
        ),
      }));
      setTableAlert(`№${found ? found.id : p.rowNum} murojaat chorasi muvaffaqiyatli saqlandi!`);
      setTimeout(() => setTableAlert(null), 3000);
    } else {
      alert("Xatolik yuz berdi: " + res.message);
    }
  };

  const openDateModal = () => {
    const t = new Date();
    const s = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    setDateModal({ open: true, start: s, end: s });
  };
  const confirmDateExport = () => {
    if (!dateModal.start || !dateModal.end) {
      alert("Iltimos, boshlanish va tugash sanalarini to'liq tanlang!");
      return;
    }
    const s = parseLocalDate(dateModal.start)!;
    const e = parseLocalDate(dateModal.end)!;
    if (s > e) {
      alert("Boshlanish sanasi tugash sanasidan katta bo'lishi mumkin emas!");
      return;
    }
    setDateModal((d) => ({ ...d, open: false }));
    generateExcelReportByDates(exportSource(), s, e, excelCtx);
  };

  const pagesList = useMemo(() => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      let start = Math.max(2, curPage - 1);
      let end = Math.min(totalPages - 1, curPage + 1);
      if (curPage <= 3) end = 4;
      else if (curPage >= totalPages - 2) start = totalPages - 3;
      if (start > 2) pages.push("...");
      for (let i = start; i <= end; i++) if (!pages.includes(i)) pages.push(i);
      if (end < totalPages - 1) pages.push("...");
      if (!pages.includes(totalPages)) pages.push(totalPages);
    }
    return pages;
  }, [totalPages, curPage]);

  const choraSelect = (item: Murojaat, idPrefix: string) => {
    const cls = item.natija ? `chora-${item.natija}` : "";
    const value = pendingChora?.rowNum === item.rowNum ? pendingChora.natijaTuri : item.natija || "";
    const saving = savingChora === item.rowNum;
    return (
      <select
        id={`${idPrefix}${item.rowNum}`}
        className={`chora-select ${cls}`}
        disabled={readOnly || !!item.natija || saving}
        style={saving ? { opacity: 0.5 } : undefined}
        data-current={item.natija || ""}
        value={value}
        onChange={(e) => setPendingChora({ rowNum: item.rowNum, natijaTuri: e.target.value as Natija })}
      >
        <option value="" disabled>{readOnly ? "Chora ko'rilmagan" : "Tanlang..."}</option>
        <option value="ijobiy">Ijobiy hal etildi</option>
        <option value="filial">Filialga yo&apos;naltirildi</option>
        <option value="vakolatsiz">Vakolati doirasiga kirmaydi</option>
      </select>
    );
  };

  const actionCell = (item: Murojaat) =>
    readOnly && !item.ketdi ? (
      <span style={{ color: "#d97706", fontWeight: "bold" }}>Jarayonda</span>
    ) : !item.ketdi ? (
      <button className={`btn btn-success${ketdiBusy === item.rowNum ? " btn-disabled" : ""}`} disabled={ketdiBusy === item.rowNum} onClick={() => handleKetdi(item.rowNum)}>
        <BtnLabel loading={ketdiBusy === item.rowNum} text={ketdiBusy === item.rowNum ? "..." : "Yakunlash"} />
      </button>
    ) : (
      <span style={{ color: "#6b7280", fontWeight: "bold" }}>Yakunlangan</span>
    );

  const choraText = pendingChora
    ? pendingChora.natijaTuri === "ijobiy"
      ? { icon: "✅", q: <>Haqiqatan ham ushbu murojaat <b>Ijobiy hal etildimi</b>?</> }
      : pendingChora.natijaTuri === "filial"
        ? { icon: "↪️", q: <>Haqiqatan ham ushbu murojaat <b>Filialga yo&apos;naltirildimi</b>?</> }
        : { icon: "⚠️", q: <>Haqiqatan ham ushbu murojaat <b>Vakolat doirasiga kirmaydimi</b>?</> }
    : { icon: "⚖️", q: <>Haqiqatan ham ushbu qarorni tasdiqlaysizmi?</> };

  const emptyMsg = search.trim() || statusFilter !== "all" ? "Qidiruv bo'yicha hech qanday ma'lumot topilmadi." : "Bazada hali birorta ham murojaat mavjud emas.";

  return (
    <div id="main-dashboard" style={{ display: "block" }}>
      <div ref={reportRef} className={panel ? `print-page rc-report${cap.capturing ? " capturing" : ""}` : undefined}>
      <div className="header-panel">
        <div>
          <h2 id="user-title" style={{ textAlign: "left", margin: 0, color: "var(--primary-color)" }}>Murojaatlar Monitoringi</h2>
          <span id="tuman-badge" style={{ fontWeight: "bold", color: "#4b5563", fontSize: 14, display: "inline-block", marginTop: 4 }}>
            {isAdmin ? `Boshqarma | ${session.fio || "Super Admin"}` : `${session.tuman} | ${session.fio}`}
          </span>
        </div>
        <div className="status-container">
          <button id="sync-btn" className={`btn-sync no-print${syncing ? " spinning" : ""}`} onClick={manualSync} data-html2canvas-ignore>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" /></svg>
            Sinxronizatsiya
          </button>
          <div className="realtime-indicator"><span className="dot" />Real vaqt</div>
          <div id="live-clock" className="live-clock">{now ? `${fmtDate(now)} ${fmtHM(now)}` : "--.--.---- --:--"}</div>
          {panel && (
            <ReportActions onImage={cap.saveImage} imageBusy={cap.busy} onPrint={cap.print} printBusy={cap.printing} disabled={!today} hidden={cap.capturing} />
          )}
        </div>
      </div>

      {panel && today && (
        <AdviceDashboard scoped={scoped} today={today} period={period} onPeriod={choosePeriod} range={range} onRange={chooseRange}
          tuman={tumanFilter} onTuman={setTumanFilter} fixedTuman={isAdmin ? undefined : session.tuman} totalAll={getLatestDailyAppeals(all, false).length}
          actions={
            <>
              <button className="btn-excel-date" onClick={openDateModal} title="Sana oralig'i bo'yicha Excel hisobot">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z" /></svg>
                Sana bo&apos;yicha
              </button>
              <button className="btn-excel" title="Joriy hafta (dushanba — juma) bo'yicha Excel hisobot" onClick={() => exportWeekly(exportSource(), excelCtx)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg>
                Haftalik
              </button>
              {isAdmin && (
                <button className="btn-excel-summary" onClick={() => exportRegionalSummary(all, masullar)} title="Butun baza bo'yicha viloyat yig'ma Excel hisoboti">
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
        <div className="dashboard-grid" style={readOnly ? { gridTemplateColumns: "1fr", marginTop: 18 } : undefined}>
          {!readOnly && <MurojaatForm session={session} mahallalar={mahallalar} onSaved={() => { setSearch(""); return slot.refresh(true); }} />}

          {/* JADVAL */}
          <div id="table-card" className="card">
            <div className="table-card-header">
              <h3 id="table-title">{isAdmin ? "Viloyat Bo'yicha Barcha Murojaatlar Ro'yxati" : "Murojaatlar Ro'yxati"}</h3>
              <div className="table-actions-wrapper">
                <div className="search-container">
                  <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.637 10.636Z" /></svg>
                  <input type="text" id="table-search" className="search-input" placeholder="F.I.O, telefon yoki maqsad..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
              </div>
            </div>

            {tableAlert && <div id="table-alert" className="table-alert alert-success" style={{ display: "block" }}>{tableAlert}</div>}

            <div className="table-wrapper">
              <div id="table-loader" className="table-loader-overlay" style={{ display: tableLoading ? "flex" : "none" }}>
                <div className="table-loader-circle" />
                <div className="table-loader-text">Murojaatlar yuklanmoqda...</div>
              </div>
              <table id="murojaat-table" className={isAdmin ? "is-admin" : undefined}>
                <thead>
                  <tr id="table-head-row">
                    <th style={{ width: 38, textAlign: "center" }}>№</th>
                    <th style={{ width: 85 }}>Sana</th>
                    {isAdmin && <th style={{ width: 140 }}>Filial (Tuman)</th>}
                    <th style={{ width: 175 }}>F.I.O</th>
                    <th style={{ width: 135 }}>Telefon raqam</th>
                    <th style={{ width: 105 }}>Keldi / Ketdi</th>
                    <th>Kelishdan Maqsad</th>
                    <th style={{ width: 165 }}>Murojaatga ko&apos;rilgan choralar</th>
                    <th style={{ width: 90, textAlign: "center" }}>Amal</th>
                  </tr>
                </thead>
                <tbody>
                  {slot.data && pageItems.length === 0 && (
                    <tr><td colSpan={isAdmin ? 9 : 8} style={{ textAlign: "center", fontWeight: 600, color: "#666", padding: 25 }}>{emptyMsg}</td></tr>
                  )}
                  {pageItems.map((item, index) => {
                    const v = rowView(item);
                    return (
                      <tr key={item.rowNum}>
                        <td>{startIndex + index + 1}</td>
                        <td style={{ whiteSpace: "nowrap", color: "#555" }}>{v.sana}</td>
                        {isAdmin && <td style={{ whiteSpace: "nowrap", fontWeight: 600, color: "var(--primary-color)" }}>{v.tuman}</td>}
                        <td style={{ fontWeight: 600 }}>{v.fio}</td>
                        <td style={{ whiteSpace: "nowrap", fontWeight: 500, color: "#1f2937" }}>📞 {v.tel}</td>
                        <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                          🕒 Keldi: <b>{v.keldi}</b><br />
                          🕒 Ketdi: <span id={`time-ketdi-${item.rowNum}`}><b>{v.ketdi}</b></span>
                        </td>
                        <td style={{ maxWidth: 250, wordBreak: "break-word" }}>{v.maqsad}</td>
                        <td>{choraSelect(item, "sel-chora-")}</td>
                        <td style={{ textAlign: "center" }}>{actionCell(item)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobil kartalar */}
            <div id="mobile-cards-container" className="mobile-cards-wrapper">
              {slot.data && pageItems.length === 0 && (
                <div style={{ textAlign: "center", fontWeight: 600, color: "#666", padding: 25, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>{emptyMsg}</div>
              )}
              {pageItems.map((item, index) => {
                const v = rowView(item);
                return (
                  <div key={item.rowNum} className="mobile-record-card">
                    <div className="m-card-header">
                      <span className="m-badge-id">№ {startIndex + index + 1}</span>
                      <span className="m-card-date">📅 {v.sana}</span>
                    </div>
                    <div className="m-card-body">
                      <div className="m-card-name">{v.fio}</div>
                      <div className="m-card-phone">📞 <a href={`tel:${v.tel}`}>{v.tel}</a></div>
                      {isAdmin && <div className="m-card-tuman">📍 Filial: <b>{v.tuman}</b></div>}
                      <div className="m-card-time-row">
                        <span>🕒 Keldi: <b>{v.keldi}</b></span>
                        <span>🕒 Ketdi: <b id={`m-time-ketdi-${item.rowNum}`}>{v.ketdi}</b></span>
                      </div>
                      <div className="m-card-purpose">
                        <label>Kelishdan maqsad:</label>
                        <p>{v.maqsad}</p>
                      </div>
                      <div className="m-card-actions">
                        <label>Murojaat chorasi:</label>
                        {choraSelect(item, "m-sel-chora-")}
                      </div>
                    </div>
                    <div className="m-card-footer">{actionCell(item)}</div>
                  </div>
                );
              })}
            </div>

            <div className="pagination-wrapper">
              <div id="pagination-info" className="pagination-info">
                {totalItems > 0 ? `${totalItems} tadan ${startIndex + 1}-${endIndex} qatorlar ko'rsatilmoqda` : ""}
              </div>
              <div id="pagination-buttons" className="pagination-buttons">
                {totalItems > 0 && totalPages > 1 && (
                  <>
                    <button className="page-btn" disabled={curPage === 1} onClick={() => setPage(curPage - 1)}>«</button>
                    {pagesList.map((p, i) =>
                      p === "..." ? (
                        <span key={`d${i}`} className="page-dots" style={{ padding: "0 6px", color: "#666" }}>...</span>
                      ) : (
                        <button key={p} className={`page-btn ${p === curPage ? "active" : ""}`} onClick={() => setPage(p)}>{p}</button>
                      )
                    )}
                    <button className="page-btn" disabled={curPage === totalPages} onClick={() => setPage(curPage + 1)}>»</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SANA BO'YICHA HISOBOT MODALI */}
      <div id="date-export-modal" className="modal-overlay" style={{ display: dateModal.open ? "flex" : "none" }}>
        <div className="modal-card" style={{ width: 380 }}>
          <div className="modal-icon">📅</div>
          <h4 style={{ marginBottom: 12 }}>Sana oralig&apos;i bo&apos;yicha hisobot</h4>
          <div style={{ textAlign: "left", marginBottom: 14 }}>
            <label htmlFor="export-start-date" style={{ fontSize: 13, fontWeight: 600, color: "#4b5563", display: "block", marginBottom: 4 }}>Boshlanish sanasi</label>
            <input type="date" id="export-start-date" className="form-control" style={{ padding: "9px 12px" }} value={dateModal.start} onChange={(e) => setDateModal((d) => ({ ...d, start: e.target.value }))} />
          </div>
          <div style={{ textAlign: "left", marginBottom: 20 }}>
            <label htmlFor="export-end-date" style={{ fontSize: 13, fontWeight: 600, color: "#4b5563", display: "block", marginBottom: 4 }}>Tugash sanasi</label>
            <input type="date" id="export-end-date" className="form-control" style={{ padding: "9px 12px" }} value={dateModal.end} onChange={(e) => setDateModal((d) => ({ ...d, end: e.target.value }))} />
          </div>
          <div className="modal-buttons">
            <button onClick={confirmDateExport} className="btn-modal-yes" style={{ backgroundColor: "#107c41" }}>Yuklab olish</button>
            <button onClick={() => setDateModal((d) => ({ ...d, open: false }))} className="btn-modal-no">Bekor qilish</button>
          </div>
        </div>
      </div>

      {/* CHORA TASDIQLASH MODALI */}
      <div id="chora-modal" className="modal-overlay" style={{ display: pendingChora ? "flex" : "none" }}>
        <div className="modal-card">
          <div className="modal-icon" id="chora-modal-icon">{choraText.icon}</div>
          <h4 id="chora-modal-title">Murojaat chorasini tasdiqlash</h4>
          <p id="chora-modal-text">
            {choraText.q}
            <br />
            <small style={{ color: "#ef4444", marginTop: 8, display: "inline-block" }}>Diqqat: Tasdiqlangandan so&apos;ng qayta o&apos;zgartirib bo&apos;lmaydi!</small>
          </p>
          <div className="modal-buttons">
            <button onClick={() => confirmChora(true)} className="btn-modal-yes" style={{ backgroundColor: "var(--primary-color)" }}>Ha, tasdiqlayman</button>
            <button onClick={() => confirmChora(false)} className="btn-modal-no">Bekor qilish</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function rowView(item: Murojaat) {
  return {
    sana: item.sana ? String(item.sana).trim() : "-",
    tuman: item.tuman ? String(item.tuman).trim() : "-",
    fio: item.fio ? formatFioTitleCase(String(item.fio).trim()) : "Mavjud emas",
    tel: item.tel ? String(item.tel).trim() : "-",
    maqsad: item.maqsad ? String(item.maqsad).trim() : "Mavjud emas",
    keldi: item.keldi ? String(item.keldi).trim() : "-",
    ketdi: item.ketdi ? String(item.ketdi).trim() : "-",
  };
}

/* =========================================================================
   YANGI MUROJAAT FORMASI (filial qabulxonasi)
   ========================================================================= */
function MurojaatForm({ session, mahallalar, onSaved }: { session: AdviceSessionInfo; mahallalar: string[]; onSaved: () => Promise<void> }) {
  const admin = isSuperAdmin(session.tuman);
  const defaultTuman = useMemo(() => {
    if (admin) return "";
    const clean = normalizeName(session.tuman);
    return TUMANLAR.find((t) => normalizeName(t) === clean) || "";
  }, [admin, session.tuman]);

  const [shaxsTuri, setShaxsTuri] = useState("2");
  const [tel, setTel] = useState("");
  const [fio, setFio] = useState("");
  const [tuman, setTuman] = useState(defaultTuman);
  const [manzil, setManzil] = useState("");
  const [maqsad, setMaqsad] = useState("");
  const [telState, setTelState] = useState<"none" | "ok" | "err">("none");
  const [manzilState, setManzilState] = useState<"none" | "ok" | "err">("none");
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<Alert>(null);
  const alertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const telRef = useRef<HTMLInputElement>(null);
  const manzilRef = useRef<HTMLInputElement>(null);

  useEffect(() => setTuman(defaultTuman), [defaultTuman]);

  const uniqueMahalla = useMemo(() => [...new Set(mahallalar)].filter(Boolean), [mahallalar]);

  const showAlert = (text: string, type: "success" | "danger") => {
    setAlert({ text, type });
    if (alertTimer.current) clearTimeout(alertTimer.current);
    if (type === "success") alertTimer.current = setTimeout(() => setAlert(null), 5000);
  };

  const onTelInput = (raw: string) => {
    let val = raw.trim();
    val = !val.startsWith("+998") ? "+998" + val.replace(/\D/g, "") : "+998" + val.substring(4).replace(/\D/g, "");
    val = val.substring(0, 13);
    setTel(val);
    if (val.length === 13 && /^\+998\d{9}$/.test(val)) setTelState("ok");
    else setTelState(val.length >= 4 ? "err" : "err");
  };

  const onManzilInput = (v: string) => {
    setManzil(v);
    const n = normalizeName(v);
    if (!n) return setManzilState("none");
    setManzilState(mahallalar.some((m) => normalizeName(m) === n) ? "ok" : "err");
  };

  const borderOf = (s: "none" | "ok" | "err") => (s === "ok" ? "var(--success-color)" : s === "err" ? "var(--danger-color)" : undefined);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\+998\d{9}$/.test(tel.trim())) {
      setTelState("err");
      telRef.current?.focus();
      showAlert("Xatolik: Telefon raqami namunadagidek bo'lishi shart! (+998934216372)", "danger");
      return;
    }
    const matched = mahallalar.find((m) => normalizeName(m) === normalizeName(manzil.trim()));
    if (!matched) {
      setManzilState("err");
      manzilRef.current?.focus();
      showAlert("Xatolik: Faqat ro'yxatda (bazada) mavjud bo'lgan MFY nomini tanlashingiz mumkin!", "danger");
      return;
    }
    setManzilState("ok");

    const formData = {
      shaxsTuri: Number(shaxsTuri),
      tel: tel.trim(),
      fio: formatFioTitleCase(cyrillicToLatin(fio.trim())),
      tuman,
      manzil: matched,
      maqsad: cyrillicToLatin(maqsad.trim()),
    };
    if (!shaxsTuri || !formData.fio || !formData.tuman || !formData.manzil || !formData.maqsad) {
      showAlert("Xatolik: Barcha maydonlarni to'ldirish majburiy!", "danger");
      return;
    }

    setSaving(true);
    const res = await postAction({ action: "saveMurojaat", formData });
    setSaving(false);
    if (res.success) {
      showAlert(res.message, "success");
      setShaxsTuri("2");
      setTel("");
      setFio("");
      setManzil("");
      setMaqsad("");
      setTelState("none");
      setManzilState("none");
      setTuman(defaultTuman);
      await onSaved();
    } else {
      showAlert(res.message, "danger");
    }
  };

  return (
    <div className="card" id="form-card" style={{ display: "block" }}>
      <h3>Yangi Murojaat Qo&apos;shish</h3>
      {alert && <div id="form-alert" className={`alert alert-${alert.type}`} style={{ display: "block" }}>{alert.text}</div>}

      <form id="murojaat-form" onSubmit={submit}>
        <div className="form-group">
          <label htmlFor="shaxsTuri">Shaxs turi</label>
          <select id="shaxsTuri" className="form-control" required value={shaxsTuri} onChange={(e) => setShaxsTuri(e.target.value)}>
            <option value="2">Jismoniy shaxs</option>
            <option value="1">Yuridik shaxs</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="tel">Telefon raqami</label>
          <input type="text" id="tel" ref={telRef} className="form-control" required placeholder="+998934216372" maxLength={13}
            value={tel} onFocus={() => !tel.trim() && setTel("+998")} onChange={(e) => onTelInput(e.target.value)} style={{ borderColor: borderOf(telState) }} />
          <small id="tel-error" style={{ color: "var(--danger-color)", display: telState === "err" && tel.length >= 4 ? "block" : "none", fontSize: 12, marginTop: 4, fontWeight: 600 }}>
            Format noto&apos;g&apos;ri! Namunadagidek kiriting: +998934216372
          </small>
        </div>

        <div className="form-group">
          <label htmlFor="fio">Fuqaro F.I.O</label>
          <input type="text" id="fio" className="form-control" required placeholder="Fuqaro F.I.O ni kiriting" value={fio} onChange={(e) => setFio(e.target.value)} />
        </div>

        <div className="form-group">
          <label htmlFor="tuman">Tumani</label>
          <select id="tuman" className="form-control" required value={tuman} onChange={(e) => setTuman(e.target.value)} disabled={!admin}
            style={admin ? { background: "white" } : { background: "#e9ecef", color: "#4b5563" }}>
            <option value="" disabled>Tumanni tanlang</option>
            {TUMANLAR.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="manzil">MFY</label>
          <input type="text" id="manzil" ref={manzilRef} list="mahalla-datalist" className="form-control" required placeholder="MFY nomini tanlang yoki yozing..."
            value={manzil} onChange={(e) => onManzilInput(e.target.value)} style={{ borderColor: borderOf(manzilState) }} />
          <datalist id="mahalla-datalist">
            {uniqueMahalla.map((m) => <option key={m} value={m.trim()} />)}
          </datalist>
          <small id="manzil-error" style={{ color: "var(--danger-color)", display: manzilState === "err" ? "block" : "none", fontSize: 12, marginTop: 4, fontWeight: 600 }}>
            Xatolik: Faqat ro&apos;yxatda mavjud bo&apos;lgan MFY nomini tanlashingiz shart!
          </small>
        </div>

        <div className="form-group">
          <label htmlFor="maqsad">Kelishdan Maqsad</label>
          <textarea id="maqsad" className="form-control" style={{ resize: "vertical", minHeight: 75 }} required placeholder="Kelish sababi / masalasi" value={maqsad} onChange={(e) => setMaqsad(e.target.value)} />
        </div>

        <button type="submit" id="save-btn" className={`btn btn-primary${saving ? " btn-disabled" : ""}`} disabled={saving}>
          <BtnLabel loading={saving} text={saving ? "Saqlanmoqda..." : "Saqlash"} />
        </button>
      </form>
    </div>
  );
}
