"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useSection } from "@/components/DataProvider";
import { useClock, fmtDate, fmtTime } from "@/lib/useClock";
import { useReportCapture } from "@/lib/useReportCapture";
import ReportActions from "@/components/ReportActions";
import {
  buildView, fmtMoney, formatDateStr, getInitials, processPayment, zeroCounts, zeroMoney,
  type Counts, type PaidApp, type WaitingApp,
} from "./model";

const Pill = ({ v }: { v: number }) => (v > 0 ? <span className="num-pill">{v}</span> : null);

function PercentBadge({ income, plan }: { income: number; plan: number }) {
  if (!plan) return <span>—</span>;
  const pct = Math.round((income / plan) * 100);
  const cls = pct >= 100 ? "p-green" : pct >= 51 ? "p-yellow" : "p-red";
  return <span className={`percent-badge ${cls}`}>{pct}%</span>;
}

function SourceBadge({ src }: { src: string }) {
  const s = (src || "").toUpperCase();
  if (s.includes("DXM")) return <span className="badge badge-dxm">DXM</span>;
  if (s.includes("YAIDXP") || s.includes("YAID")) return <span className="badge badge-yaidxp">YaIDXP</span>;
  if (s.includes("NOTARIUS")) return <span className="badge badge-notarius">Notarius</span>;
  if (s.includes("AGRO")) return <span className="badge badge-agro">Agroportal</span>;
  return <span className="badge">{src || "—"}</span>;
}

function PhoneButton({ phone }: { phone: string }) {
  const [copied, setCopied] = useState(false);
  const raw = String(phone || "").trim();
  const formatted = raw ? (raw.startsWith("+") ? raw : "+" + raw) : "";
  if (!formatted) return <>—</>;
  return (
    <button
      className={`phone-copy-btn${copied ? " copied" : ""}`}
      data-phone={formatted}
      title="Nusxalash uchun bosing"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(formatted).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      <span className="phone-text">{copied ? "✓ Nusxalandi" : formatted}</span>
      <svg className="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
    </button>
  );
}

type Modal =
  | { mode: "waiting"; district: string; engineer: string; apps: WaitingApp[] }
  | { mode: "paid"; district: string; engineer: string; month: string; apps: PaidApp[]; total: number };

const SOURCE_CARDS = [
  { key: "dxm", cls: "card-dxm", label: "DXM", statKey: "dxm" as const, icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg> },
  { key: "yaidxp", cls: "card-yaidxp", label: "YaIDXP", statKey: "yaidxp" as const, icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="m4.93 4.93 4.24 4.24M14.83 14.83l4.24 4.24M14.83 9.17l4.24-4.24M4.93 19.07l4.24-4.24" /></svg> },
  { key: "notarius", cls: "card-notarius", label: "Notarius", statKey: "notarius" as const, icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg> },
  { key: "agroportal", cls: "card-agro", label: "Agroportal", statKey: "agroportal" as const, icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" /></svg> },
];

const PERIOD_CARDS = [
  { key: "m1", cls: "card-p1", label: "1-OYGACHA", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg> },
  { key: "m3", cls: "card-p2", label: "1-3 OYGACHA", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 8 14" /></svg> },
  { key: "m6", cls: "card-p3", label: "3-6 OYGACHA", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="6" x2="12" y2="12" /><line x1="12" y1="12" x2="16" y2="16" /></svg> },
  { key: "m12", cls: "card-p4", label: "6-12 OYGACHA", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M16 12h-4V8" /></svg> },
  { key: "y1", cls: "card-p5", label: "1-YILDAN ORTIQ", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg> },
] as const;

const paymentFileName = () => `DKP_Namangan_Tolov_${fmtDate(new Date())}.png`;

export default function PaymentView() {
  const slot = useSection("payment");
  const now = useClock();

  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [selectedPeriods, setSelectedPeriods] = useState<Set<string>>(new Set());
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [engOpenCards, setEngOpenCards] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<Modal | null>(null);
  const [query, setQuery] = useState("");
  const [userRefreshing, setUserRefreshing] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Rasmga olishda ochiq tumanlar yig'iladi (pastda: isExp)
  // "Chop etish" — butun hisobot rasm sifatida bitta A4 albom sahifaga sig'diriladi
  const cap = useReportCapture(wrapperRef, { fileName: paymentFileName, background: "#f8fafc", windowWidth: 1400, printPages: 1 });
  const capturing = cap.capturing;

  const processed = useMemo(() => processPayment(slot.data), [slot.data]);
  const view = useMemo(() => buildView(processed, selectedSources, selectedPeriods), [processed, selectedSources, selectedPeriods]);
  const months = processed.months;
  const loaderActive = (slot.status === "loading" && !slot.data) || userRefreshing;

  useEffect(() => {
    if (slot.status === "error" && !slot.data) alert("Jadvalni yuklab bo'lmadi.");
  }, [slot.status, slot.data]);

  // Modal ochiqligida body scroll bloklanadi, Escape bilan yopiladi
  useEffect(() => {
    if (!modal) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setModal(null);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [modal]);

  const toggleIn = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };

  const refresh = async () => {
    setUserRefreshing(true);
    await slot.refresh(true);
    setUserRefreshing(false);
  };

  const openWaiting = (district: string, engineer: string, apps: WaitingApp[]) => {
    setQuery("");
    setModal({ mode: "waiting", district, engineer, apps });
  };
  const openPaid = (district: string, engineer: string, month: string) => {
    const e = processed.paid[month]?.[district]?.engineers?.[engineer];
    if (e && e.apps.length > 0) {
      setQuery("");
      setModal({ mode: "paid", district, engineer, month, apps: e.apps, total: e.total });
    }
  };

  const modalRows = useMemo(() => {
    if (!modal) return [];
    const q = query.toLowerCase().trim();
    if (!q) return modal.apps as (WaitingApp | PaidApp)[];
    return (modal.apps as (WaitingApp | PaidApp)[]).filter((app) => {
      const dateField = modal.mode === "waiting" ? (app as WaitingApp).issueDate : (app as PaidApp).paidDate;
      return (
        (app.appNumber && app.appNumber.toLowerCase().includes(q)) ||
        (app.trx && app.trx.toLowerCase().includes(q)) ||
        (app.client && app.client.toLowerCase().includes(q)) ||
        (app.phone && app.phone.toString().includes(q)) ||
        (app.source && app.source.toLowerCase().includes(q)) ||
        (dateField && String(dateField).toLowerCase().includes(q))
      );
    });
  }, [modal, query]);

  const exportExcel = async () => {
    if (!modal || modal.apps.length === 0) {
      alert("Eksport qilish uchun arizalar mavjud emas!");
      return;
    }
    const XLSX = await import("xlsx");
    const safeEngName = modal.engineer.replace(/[^a-zA-Z0-9а-яА-ЯёЁ]/g, "_");
    let rows: Record<string, unknown>[];
    let cols: { wch: number }[];
    let fileName: string;
    if (modal.mode === "waiting") {
      rows = modal.apps.map((app, i) => ({
        "№": i + 1, Tuman: modal.district, "Ijrochi muhandis": modal.engineer, "Ariza raqami": app.appNumber,
        "Tranzaksiya raqami": app.trx, Buyurtmachi: app.client, "Arizachi tel raqami": app.phone,
        "To'lovga chiqqan sana": formatDateStr(app.issueDate), "Ariza manbasi": app.source,
      }));
      cols = [6, 22, 28, 16, 20, 35, 18, 20, 15].map((wch) => ({ wch }));
      fileName = `${safeEngName}_${modal.district}_Kutilayotgan_Arizalar.xlsx`;
    } else {
      rows = modal.apps.map((app, i) => ({
        "№": i + 1, Tuman: modal.district, "Ijrochi muhandis": modal.engineer, "Ariza raqami": app.appNumber,
        "Tranzaksiya raqami": app.trx, Buyurtmachi: app.client, "Arizachi tel raqami": app.phone,
        "To'langan sana": formatDateStr(app.paidDate), "Ariza manbasi": app.source,
        "Kadastr uchun (mln.so'm)": app.kadastr, "Registratsiya uchun (mln.so'm)": app.registratsiya,
        "Manzil uchun (mln.so'm)": app.manzil, "Jami to'langan summa (mln.so'm)": app.totalPaid,
      }));
      cols = [6, 20, 26, 16, 20, 32, 18, 18, 15, 18, 18, 16, 22].map((wch) => ({ wch }));
      fileName = `${safeEngName}_${modal.district}_${modal.month}_Tolangan_Arizalar.xlsx`;
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = cols;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, modal.mode === "waiting" ? "Kutilayotganlar" : "Tolanganlar");
    XLSX.writeFile(wb, fileName);
  };

  const muted = (k: string) => (selectedSources.size > 0 && !selectedSources.has(k) ? { opacity: 0.3 } : undefined);
  const statText = (n: number) => (slot.data ? `${n.toLocaleString()} ta` : "—");

  return (
    <div className="sec-payment print-page">
      <div className="dashboard-wrapper" ref={wrapperRef}>
        <header className="dashboard-header">
          <div className="header-title">
            <h1>DKP Namangan viloyati | To&apos;lov Kutilayotgan Arizalar va Tushum Tahlili</h1>
            <p className="subtitle">Hududlar, muhandislar, manbalar, muddatlar va oylik tushum rejalari monitoringi</p>
          </div>

          <div className="header-right-panel">
            <div className="live-clock-card">
              <div className="clock-date">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                <span id="currentDateText">{now ? fmtDate(now) : "--.--.----"}</span>
              </div>
              <div className="clock-time">
                <span className="live-dot" />
                <span id="currentTimeText">{now ? fmtTime(now) : "--:--:--"}</span>
              </div>
            </div>

            <ReportActions
              onRefresh={refresh} refreshing={loaderActive}
              onImage={cap.saveImage} imageBusy={cap.busy} onPrint={cap.print} printBusy={cap.printing} disabled={!slot.data} hidden={capturing}
            />
          </div>
        </header>

        {/* 1-QATOR: Manba KPI */}
        <div className={`stats-grid${selectedSources.size > 0 ? " has-filter" : ""}`} id="statsGrid">
          <div className={`stat-card card-total${selectedSources.size === 0 ? " active" : ""}`} onClick={() => setSelectedSources(new Set())}>
            <div className="stat-icon-wrapper">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
            </div>
            <div className="stat-info">
              <span className="stat-label">Jami kutilmoqda</span>
              <h3 id="statTotal" className="stat-val">{statText(view.totalStats.jami)}</h3>
            </div>
          </div>
          {SOURCE_CARDS.map((c) => (
            <div key={c.key} className={`stat-card ${c.cls}${selectedSources.has(c.key) ? " active" : ""}`} onClick={() => setSelectedSources((s) => toggleIn(s, c.key))}>
              <div className="stat-icon-wrapper">{c.icon}</div>
              <div className="stat-info">
                <span className="stat-label">{c.label}</span>
                <h3 className="stat-val">{statText(view.totalStats[c.statKey])}</h3>
              </div>
            </div>
          ))}
        </div>

        {/* 2-QATOR: Muddat KPI */}
        <div className={`stats-grid period-grid${selectedPeriods.size > 0 ? " has-filter" : ""}`} id="periodGrid">
          {PERIOD_CARDS.map((c) => (
            <div key={c.key} className={`stat-card card-period ${c.cls}${selectedPeriods.has(c.key) ? " active" : ""}`} data-period={c.key}
              onClick={() => setSelectedPeriods((s) => toggleIn(s, c.key))}>
              <div className="stat-icon-wrapper period-icon">{c.icon}</div>
              <div className="stat-info">
                <span className="stat-label">{c.label}</span>
                <h3 className="stat-val">{statText(view.periodStats[c.key])}</h3>
              </div>
            </div>
          ))}
        </div>

        <div className="dashboard-card">
          <div id="loader" className={`loader-overlay${loaderActive ? " active" : ""}`}>
            <div className="spinner" />
            <span>Ma&apos;lumotlar yangilanmoqda...</span>
          </div>

          {/* Desktop jadval */}
          <div className="table-container desktop-table-view">
            <table className="modern-table" id="reportTable">
              <thead id="tableHead">
                {slot.data && (
                  <>
                    <tr>
                      <th rowSpan={2} className="th-name">Hudud / Ijrochi muhandis</th>
                      <th rowSpan={2} className="th-num th-total">Jami</th>
                      <th colSpan={4} className="th-group">Arizalar manbasi</th>
                      <th rowSpan={2} className="th-num plan-th section-divider-left">Bir oylik tushum<br />rejasi mln.soʻm</th>
                      {months.map((m) => {
                        const isOpen = openMonths.has(m);
                        return (
                          <Fragment key={m}>
                            <th rowSpan={2} className={`th-num month-col-th ${isOpen ? "open" : ""}`} data-month={m} onClick={() => setOpenMonths((s) => toggleIn(s, m))}>
                              <div className="month-clean-header"><span>{m} oyida<br />undirilgan mln.soʻm</span></div>
                            </th>
                            <th rowSpan={2} className="th-num th-percent">%</th>
                            <th colSpan={3} className={`th-group col-shundan-detail ${isOpen ? "open" : ""}`} data-month-detail={m}>Shundan</th>
                          </Fragment>
                        );
                      })}
                    </tr>
                    <tr className="sub-headers">
                      <th className="th-num col-src col-dxm"><span className="badge badge-dxm" style={muted("dxm")}>DXM</span></th>
                      <th className="th-num col-src col-yaidxp"><span className="badge badge-yaidxp" style={muted("yaidxp")}>YaIDXP</span></th>
                      <th className="th-num col-src col-notarius"><span className="badge badge-notarius" style={muted("notarius")}>Notarius</span></th>
                      <th className="th-num col-src col-agroportal"><span className="badge badge-agro" style={muted("agroportal")}>Agroportal</span></th>
                      {months.map((m) => {
                        const o = openMonths.has(m) ? "open" : "";
                        return (
                          <Fragment key={m}>
                            <th className={`th-num col-shundan-detail ${o}`} data-month-detail={m}><span className="badge badge-kadastr">Kadastr uchun</span></th>
                            <th className={`th-num col-shundan-detail ${o}`} data-month-detail={m}><span className="badge badge-registratsiya">Registratsiya uchun</span></th>
                            <th className={`th-num col-shundan-detail ${o}`} data-month-detail={m}><span className="badge badge-manzil">Manzil uchun</span></th>
                          </Fragment>
                        );
                      })}
                    </tr>
                  </>
                )}
              </thead>
              <tbody id="tableBody">
                {slot.data && (
                  <>
                    <tr className="grand-total-row">
                      <td>
                        <div className="grand-total-label">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                          <span>Viloyat bo&apos;yicha jami</span>
                        </div>
                      </td>
                      <td className="col-bold col-total-style">{view.grandWaiting.jami}</td>
                      <SourceCells t={view.grandWaiting} />
                      <td className="plan-cell section-divider-left">{fmtMoney(view.grandPlan)}</td>
                      {months.map((m) => <MonthCells key={m} m={m} isOpen={openMonths.has(m)} money={view.grandMonth[m]} plan={view.grandPlan} />)}
                    </tr>

                    {view.districtNames.map((districtName, idx) => {
                      const dW = view.waitingSummary[districtName] || { totals: zeroCounts(), engineers: {} };
                      const planVal = processed.plan[districtName] || 0;
                      const groupId = `group-${idx}`;
                      const isExp = expanded.has(districtName) && !capturing;
                      return (
                        <Fragment key={districtName}>
                          <tr className={`district-row${isExp ? " expanded" : ""}`} data-target={groupId} onClick={() => setExpanded((s) => toggleIn(s, districtName))}>
                            <td>
                              <div className="district-name-cell">
                                <span className="chevron-icon">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                                </span>
                                <svg className="district-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                                <span>{districtName}</span>
                              </div>
                            </td>
                            <td className="col-bold col-total-style"><Pill v={dW.totals.jami} /></td>
                            <SourceCells t={dW.totals} />
                            <td className="plan-cell section-divider-left">{fmtMoney(planVal)}</td>
                            {months.map((m) => <MonthCells key={m} m={m} isOpen={openMonths.has(m)} money={processed.paid[m]?.[districtName] || zeroMoney()} plan={planVal} />)}
                          </tr>

                          {view.engineerNamesFor(districtName).map((engName) => {
                            const eW = dW.engineers[engName] || { totals: zeroCounts(), apps: [] };
                            const hasW = eW.apps.length > 0;
                            const wc = hasW ? " waiting-clickable" : "";
                            const onW = (e: React.MouseEvent) => {
                              e.stopPropagation();
                              if (hasW) openWaiting(districtName, engName, eW.apps);
                            };
                            return (
                              <tr key={engName} className={`engineer-row ${groupId}${isExp ? " show" : ""}`}>
                                <td className="waiting-clickable" title="To'lov kutilayotgan arizalarni ko'rish" onClick={onW}>
                                  <div className="engineer-name-cell">
                                    <span className="engineer-avatar">{getInitials(engName)}</span>
                                    <span>{engName}</span>
                                    <span className="hint-text">(kutilayotganlar)</span>
                                  </div>
                                </td>
                                <td className={`col-bold col-total-style${wc}`} title="Kutilayotgan jami arizalar" onClick={hasW ? onW : undefined}><Pill v={eW.totals.jami} /></td>
                                <td className={`col-source col-dxm${wc}`} title="DXM kutilayotganlar" onClick={hasW ? onW : undefined}><Pill v={eW.totals.dxm} /></td>
                                <td className={`col-source col-yaidxp${wc}`} title="YaIDXP kutilayotganlar" onClick={hasW ? onW : undefined}><Pill v={eW.totals.yaidxp} /></td>
                                <td className={`col-source col-notarius${wc}`} title="Notarius kutilayotganlar" onClick={hasW ? onW : undefined}><Pill v={eW.totals.notarius} /></td>
                                <td className={`col-source col-agroportal${wc}`} title="Agroportal kutilayotganlar" onClick={hasW ? onW : undefined}><Pill v={eW.totals.agroportal} /></td>
                                <td className="plan-cell section-divider-left">—</td>
                                {months.map((m) => {
                                  const eP = processed.paid[m]?.[districtName]?.engineers?.[engName];
                                  return (
                                    <MonthCells key={m} m={m} isOpen={openMonths.has(m)} money={eP || zeroMoney()} plan={null} engineerMode
                                      onPaid={eP && eP.apps.length > 0 ? () => openPaid(districtName, engName, m) : undefined} />
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobil kartalar */}
          <div id="mobileCardsContainer" className="mobile-cards-container">
            {slot.data && (
              <>
                <div className="m-district-card m-grand-card">
                  <div className="m-card-header">
                    <div className="m-card-title">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                      <span>Viloyat bo&apos;yicha jami</span>
                    </div>
                    <div className="m-card-total-badge">{view.grandWaiting.jami} ta</div>
                  </div>
                  <MobileSources t={view.grandWaiting} />
                  <div className="m-plan-bar"><span>Bir oylik reja:</span><b>{fmtMoney(view.grandPlan)} mln.so&apos;m</b></div>
                  {months.map((m) => <MobileFinance key={m} label={`${m} tushumi:`} money={view.grandMonth[m]} plan={view.grandPlan} />)}
                </div>

                {view.districtNames.map((districtName) => {
                  const dW = view.waitingSummary[districtName] || { totals: zeroCounts(), engineers: {} };
                  const planVal = processed.plan[districtName] || 0;
                  const engs = view.engineerNamesFor(districtName);
                  return (
                    <div key={districtName} className={`m-district-card${engOpenCards.has(districtName) ? " eng-open" : ""}`}>
                      <div className="m-card-header">
                        <div className="m-card-title">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                          <span>{districtName}</span>
                        </div>
                        <div className="m-card-total-badge">{dW.totals.jami} ta</div>
                      </div>
                      <MobileSources t={dW.totals} />
                      <div className="m-plan-bar"><span>Bir oylik tushum rejasi:</span><b>{fmtMoney(planVal)} mln.so&apos;m</b></div>
                      {months.map((m) => (
                        <MobileFinance key={m} label={`${m} undirildi:`} money={processed.paid[m]?.[districtName] || zeroMoney()} plan={planVal} />
                      ))}
                      <button type="button" className="m-eng-toggle-btn" onClick={() => setEngOpenCards((s) => toggleIn(s, districtName))}>
                        <span>Muhandislar kesimida ({engs.length} nafar)</span>
                        <span className="m-eng-arrow">▼</span>
                      </button>
                      <div className="m-eng-list">
                        {engs.map((engName) => {
                          const eW = dW.engineers[engName] || { totals: zeroCounts(), apps: [] };
                          return (
                            <div key={engName} className="m-eng-item">
                              <div className="m-eng-info">
                                <span className="engineer-avatar">{getInitials(engName)}</span>
                                <span className="m-eng-name">{engName}</span>
                              </div>
                              <div className="m-eng-actions">
                                <button type="button" className="m-eng-wait-btn" disabled={eW.totals.jami === 0}
                                  onClick={() => eW.apps.length > 0 && openWaiting(districtName, engName, eW.apps)}>
                                  Kutilmoqda: <b>{eW.totals.jami} ta</b>
                                </button>
                                {months.map((m) => {
                                  const eP = processed.paid[m]?.[districtName]?.engineers?.[engName];
                                  if (!eP || eP.total <= 0) return null;
                                  return (
                                    <button key={m} type="button" className="m-eng-paid-btn" data-month={m} onClick={() => openPaid(districtName, engName, m)}>
                                      {m}: {fmtMoney(eP.total)} mln
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>

      {/* MODAL */}
      <div className={`modal-backdrop${modal ? " open" : ""}`} id="modalBackdrop" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
        <div className="modal-card">
          <div className="modal-header">
            <div className="modal-user-info">
              <div className="modal-avatar" id="modalAvatar">{modal ? getInitials(modal.engineer) : "AB"}</div>
              <div>
                <h3 id="modalEngineerName">
                  {modal ? modal.engineer : "Xodim Ismi"}{" "}
                  {modal?.mode === "waiting" && <span className="modal-type-badge badge-mode-waiting">To&apos;lov kutilmoqda</span>}
                  {modal?.mode === "paid" && <span className="modal-type-badge badge-mode-paid">{modal.month} oyida to&apos;langan</span>}
                </h3>
                <p id="modalDistrictName" className="modal-sub">
                  {!modal
                    ? "Hudud • 0 ta ariza"
                    : modal.mode === "waiting"
                      ? `${modal.district} • ${modal.apps.length} ta kutilayotgan ariza`
                      : `${modal.district} • ${modal.apps.length} ta ariza • Jami: ${fmtMoney(modal.total)} mln.so'm`}
                </p>
              </div>
            </div>
            <div className="modal-header-actions">
              <button id="exportExcelBtn" className="btn-excel" onClick={exportExcel}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                <span>Excelda yuklab olish</span>
              </button>
              <button id="modalCloseBtn" className="modal-close-btn" onClick={() => setModal(null)}>&times;</button>
            </div>
          </div>

          <div className="modal-search-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input type="text" id="modalSearchInput" placeholder="Tranzaksiya, buyurtmachi, telefon yoki sana bo'yicha qidirish..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          <div className="modal-body">
            <div className="modal-table-wrapper">
              <table className="modal-table">
                <thead id="modalTableHead">
                  {modal?.mode === "waiting" && (
                    <tr>
                      <th style={{ width: 40 }}>№</th><th style={{ width: 105 }}>Ariza raqami</th><th style={{ width: 120 }}>Tranzaksiya</th>
                      <th>Buyurtmachi</th><th style={{ width: 125 }}>Telefon raqami</th><th style={{ width: 105 }}>To&apos;lovga chiqqan</th><th style={{ width: 95 }}>Manbasi</th>
                    </tr>
                  )}
                  {modal?.mode === "paid" && (
                    <tr>
                      <th style={{ width: 35 }}>№</th><th style={{ width: 100 }}>Ariza raqami</th><th style={{ width: 110 }}>Tranzaksiya</th>
                      <th>Buyurtmachi</th><th style={{ width: 120 }}>Telefon</th><th style={{ width: 95 }}>To&apos;langan sana</th><th style={{ width: 80 }}>Manbasi</th>
                      <th style={{ width: 95 }}>Kadastr</th><th style={{ width: 95 }}>Registratsiya</th><th style={{ width: 80 }}>Manzil</th><th style={{ width: 95 }}>Jami to&apos;langan</th>
                    </tr>
                  )}
                </thead>
                <tbody id="modalTableBody">
                  {modal && modalRows.length === 0 && (
                    <tr><td colSpan={modal.mode === "paid" ? 11 : 7} style={{ textAlign: "center", padding: 30, color: "#94a3b8" }}>Arizalar mavjud emas</td></tr>
                  )}
                  {modal && modalRows.map((app, index) =>
                    modal.mode === "waiting" ? (
                      <tr key={index}>
                        <td data-label="№" className="td-index">{index + 1}</td>
                        <td data-label="Ariza raqami"><span className="app-num-code">{app.appNumber || "—"}</span></td>
                        <td data-label="Tranzaksiya"><span className="trx-code">{app.trx || "—"}</span></td>
                        <td data-label="Buyurtmachi" className="client-name">{app.client || "—"}</td>
                        <td data-label="Telefon"><PhoneButton phone={app.phone} /></td>
                        <td data-label="To'lov sanasi"><span className="date-tag">{formatDateStr((app as WaitingApp).issueDate)}</span></td>
                        <td data-label="Manbasi"><SourceBadge src={app.source} /></td>
                      </tr>
                    ) : (
                      <tr key={index}>
                        <td data-label="№" className="td-index">{index + 1}</td>
                        <td data-label="Ariza raqami"><span className="app-num-code">{app.appNumber || "—"}</span></td>
                        <td data-label="Tranzaksiya"><span className="trx-code">{app.trx || "—"}</span></td>
                        <td data-label="Buyurtmachi" className="client-name">{app.client || "—"}</td>
                        <td data-label="Telefon"><PhoneButton phone={app.phone} /></td>
                        <td data-label="To'langan sana"><span className="date-tag">{formatDateStr((app as PaidApp).paidDate)}</span></td>
                        <td data-label="Manbasi"><SourceBadge src={app.source} /></td>
                        <td data-label="Kadastr">{fmtMoney((app as PaidApp).kadastr)}</td>
                        <td data-label="Registratsiya">{fmtMoney((app as PaidApp).registratsiya)}</td>
                        <td data-label="Manzil">{fmtMoney((app as PaidApp).manzil)}</td>
                        <td data-label="Jami to'langan"><span className="paid-amount-tag">{fmtMoney((app as PaidApp).totalPaid)}</span></td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type MoneyT = { total: number; kadastr: number; registratsiya: number; manzil: number };
function MonthCells({ m, money, plan, isOpen, engineerMode, onPaid }: { m: string; money: MoneyT; plan: number | null; isOpen: boolean; engineerMode?: boolean; onPaid?: () => void }) {
  const clickable = engineerMode && !!onPaid;
  return (
    <>
      <td className={`income-cell col-total-style${clickable ? " income-clickable" : ""}`} data-month={engineerMode ? m : undefined}
        title={clickable ? `${m} oyidagi to'langan arizalarni ochish` : engineerMode ? "" : undefined}
        onClick={clickable ? (e) => { e.stopPropagation(); onPaid!(); } : undefined}>
        {fmtMoney(money.total)}
      </td>
      <td>{plan === null ? "—" : <PercentBadge income={money.total} plan={plan} />}</td>
      <td className={`col-shundan-detail col-shundan-kadastr ${isOpen ? "open" : ""}`}>{fmtMoney(money.kadastr)}</td>
      <td className={`col-shundan-detail col-shundan-registratsiya ${isOpen ? "open" : ""}`}>{fmtMoney(money.registratsiya)}</td>
      <td className={`col-shundan-detail col-shundan-manzil ${isOpen ? "open" : ""}`}>{fmtMoney(money.manzil)}</td>
    </>
  );
}

function SourceCells({ t }: { t: Counts }) {
  return (
    <>
      <td className="col-source col-dxm"><Pill v={t.dxm} /></td>
      <td className="col-source col-yaidxp"><Pill v={t.yaidxp} /></td>
      <td className="col-source col-notarius"><Pill v={t.notarius} /></td>
      <td className="col-source col-agroportal"><Pill v={t.agroportal} /></td>
    </>
  );
}

function MobileSources({ t }: { t: Counts }) {
  return (
    <div className="m-sources-grid">
      <div className="m-src-item"><span className="badge badge-dxm">DXM</span><b>{t.dxm || 0}</b></div>
      <div className="m-src-item"><span className="badge badge-yaidxp">YaIDXP</span><b>{t.yaidxp || 0}</b></div>
      <div className="m-src-item"><span className="badge badge-notarius">Notarius</span><b>{t.notarius || 0}</b></div>
      <div className="m-src-item"><span className="badge badge-agro">Agro</span><b>{t.agroportal || 0}</b></div>
    </div>
  );
}

function MobileFinance({ label, money, plan }: { label: string; money: { total: number; kadastr: number; registratsiya: number; manzil: number }; plan: number }) {
  return (
    <div className="m-finance-box">
      <div className="m-finance-top">
        <span className="m-month-title">{label} <b>{fmtMoney(money.total)}</b> mln</span>
        <PercentBadge income={money.total} plan={plan} />
      </div>
      <div className="m-shundan-grid">
        <div className="m-sh-item kadastr"><span>Kadastr</span><b>{fmtMoney(money.kadastr)}</b></div>
        <div className="m-sh-item reg"><span>Registr.</span><b>{fmtMoney(money.registratsiya)}</b></div>
        <div className="m-sh-item manzil"><span>Manzil</span><b>{fmtMoney(money.manzil)}</b></div>
      </div>
    </div>
  );
}
