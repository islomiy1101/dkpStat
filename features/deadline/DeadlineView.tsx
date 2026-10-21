"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSection } from "@/components/DataProvider";
import { useClock, fmtDate, fmtTime, downloadBlob } from "@/lib/useClock";
import { useReportCapture } from "@/lib/useReportCapture";
import ReportActions from "@/components/ReportActions";
import PageLoader from "@/components/PageLoader";
import {
  ROWS, SECTIONS, SUB_COLS, computeTable, getCell, fmtNum, roleDisplayName, slugify,
  type DrillCtx, type RowCells,
} from "./model";
import { downloadSectionPDF } from "./pdf";
import { DEADLINE_LISTS, type DeadlineList } from "./source";

const GROUP_KEY = "dkp_group_states";
const DEFAULT_GROUPS: Record<string, boolean> = { manba: true, filial: true, boshqarma: true, dkp: true, agentlik: true };
const API_DETAILS = "/api/deadline/details";
/** Telefon kartalaridagi bo'lim nomlari (qisqa) va kunlar ustuni sarlavhalari */
const SEC_SHORT: Record<string, string> = { manba: "Manba", filial: "Filial", boshqarma: "Boshqarma", dkp: "DKP", agentlik: "Agentlik" };
const SUB_SHORT = ["Jami", "1", "2", "3", "4", "5", "6–10", "11+"];

const PdfIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
);

const KPI = [
  { id: "manba", cls: "kpi-manba", icon: "fa-solid fa-database", title: "Manbalar jami" },
  { id: "filial", cls: "kpi-filial", icon: "fa-solid fa-building", title: "Filial jami" },
  { id: "boshqarma", cls: "kpi-boshqarma", icon: "fa-solid fa-sitemap", title: "Boshqarma jami" },
  { id: "dkp", cls: "kpi-dkp", icon: "fa-solid fa-landmark", title: "DKP jami" },
  { id: "agentlik", cls: "kpi-agentlik", icon: "fa-solid fa-shield-halved", title: "FMMI / Agentlik" },
];

type Drill = {
  open: boolean;
  loading: boolean;
  title: string;
  headers: string[];
  data: unknown[][];
  message: { text: string; error?: boolean; preparing?: boolean } | null;
};

/** Eski usulda yuklangan ma'lumot avtomatik tartiblanayotganda (API → 202) qayta so'rash oralig'i va soni */
const PREPARE_RETRY_MS = 8000;
const PREPARE_RETRIES = 12;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** canUpload — xato "qayta yuklang" bo'lsa, modalda "Bazaga yuklash" havolasi (faqat superadmin) */
export default function DeadlineView({ list, canUpload = false }: { list: DeadlineList; canUpload?: boolean }) {
  const slot = useSection("deadline");
  // Ikkala ro'yxat bitta slotda; eski keshda (bitta ro'yxatli format) bu kalit bo'lmaydi
  const summary = slot.data?.[list] ?? null;
  const listInfo = DEADLINE_LISTS[list];
  const now = useClock();

  const [groupStates, setGroupStates] = useState<Record<string, boolean>>(DEFAULT_GROUPS);
  const [manbaFilters, setManbaFilters] = useState<string[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [drill, setDrill] = useState<Drill>({ open: false, loading: false, title: "", headers: [], data: [], message: null });
  const reportRef = useRef<HTMLDivElement>(null);
  const drillRun = useRef(0);
  const fileName = useCallback(() => `${listInfo.sheet}_${fmtDate(new Date())}.png`, [listInfo.sheet]);
  // Rasm/pechat — faqat ochiq guruhlar; keng jadval canvas va sahifa kengligiga moslanadi
  const cap = useReportCapture(reportRef, { fileName });

  // Xom varaq (modal va Excel uchun) fonda keshga yuklab qo'yiladi — birinchi katak bosilganda kutish kamayadi
  useEffect(() => {
    fetch(`${API_DETAILS}?${new URLSearchParams({ list, warm: "1" })}`, { cache: "no-store" }).catch(() => {});
  }, [list]);

  // localStorage'dagi ochiq/yopiq guruhlar (original bilan bir xil kalit)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(GROUP_KEY);
      if (saved) setGroupStates(JSON.parse(saved));
    } catch {}
  }, []);

  // Originaldagi o'ng tugma taqiqi — faqat shu bo'limda
  useEffect(() => {
    const h = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", h);
    return () => document.removeEventListener("contextmenu", h);
  }, []);

  const { result: table, hasData } = useMemo(() => computeTable(summary, manbaFilters), [summary, manbaFilters]);

  const toggleSection = (id: string) => {
    setGroupStates((g) => {
      const next = { ...g, [id]: !g[id] };
      try {
        localStorage.setItem(GROUP_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const toggleManbaFilter = (slug: string) => {
    if (!summary) return;
    setManbaFilters((f) => (f.includes(slug) ? f.filter((x) => x !== slug) : [...f, slug]));
  };

  const refreshPageData = async () => {
    setLocalLoading(true);
    await slot.refresh(true);
    setLocalLoading(false);
  };

  const openDrilldownModal = async (ctx: DrillCtx) => {
    const run = ++drillRun.current; // yangi katak bosilsa yoki modal yopilsa — eski qayta so'rov to'xtaydi
    setDrill({ open: true, loading: true, title: `${ctx.tuman} arizalari (Yuklanmoqda...)`, headers: [], data: [], message: null });
    try {
      const p = new URLSearchParams({ list, tuman: ctx.tuman });
      if (ctx.manba) p.set("manba", ctx.manba);
      if (ctx.role) p.set("role", ctx.role);
      if (ctx.day) p.set("day", ctx.day);
      let json: { status?: string; message?: string; headers?: string[]; data?: unknown[][] } = {};
      for (let attempt = 0; ; attempt++) {
        p.set("_t", String(Date.now()));
        const res = await fetch(`${API_DETAILS}?${p}`);
        json = await res.json();
        if (json.status !== "preparing" || attempt >= PREPARE_RETRIES) break;
        if (run !== drillRun.current) return;
        setDrill((d) => ({ ...d, loading: false, title: `${ctx.tuman} arizalari`, message: { text: json.message || "Ma'lumot tayyorlanmoqda...", preparing: true } }));
        await sleep(PREPARE_RETRY_MS);
        if (run !== drillRun.current) return;
      }
      if (run !== drillRun.current) return;
      if (json.status === "success" && json.data && json.data.length > 0) {
        setDrill({
          open: true, loading: false, message: null,
          title: `${ctx.tuman} | Jami to'liq yuklandi: ${json.data.length} ta ariza`,
          headers: json.headers || [], data: json.data,
        });
      } else {
        // Server xatosi (masalan, jamlanma eskirgan yoki ro'yxat juda katta) — sababi ko'rsatiladi
        const failed = json.status === "error" || json.status === "preparing";
        const text = failed && json.message ? json.message : "Hozircha ma'lumot topilmadi!";
        setDrill((d) => ({ ...d, loading: false, title: `${ctx.tuman} arizalari`, message: { text, error: failed } }));
      }
    } catch {
      if (run !== drillRun.current) return;
      setDrill((d) => ({ ...d, loading: false, title: `${ctx.tuman} arizalari`, message: { text: "Tarmoq uzildi!", error: true } }));
    }
  };

  const exportDrilldownExcel = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([drill.headers, ...drill.data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tafsilot");
    XLSX.writeFile(wb, `${listInfo.sheet}_Batafsil.xlsx`);
  };

  const downloadTumanExcel = async (tumanName: string) => {
    setExporting(tumanName);
    try {
      const p = new URLSearchParams({ list, action: "export", tuman: tumanName });
      let res: Response;
      // 202 — ma'lumot avtomatik tartiblanmoqda: biroz kutib qayta so'raladi
      for (let attempt = 0; ; attempt++) {
        p.set("_t", String(Date.now()));
        res = await fetch(`${API_DETAILS}?${p}`);
        if (res.status !== 202 || attempt >= PREPARE_RETRIES) break;
        await sleep(PREPARE_RETRY_MS);
      }
      if (!res.ok || res.status === 202) throw new Error((await res.json().catch(() => null))?.message || "Server xatosi");
      downloadBlob(await res.blob(), `${tumanName.replace(/\s+/g, "_")}_${listInfo.sheet}.xlsx`);
    } catch (e) {
      alert(`Excel yuklab olishda xatolik: ${(e as Error).message}`);
    } finally {
      setExporting(null);
    }
  };

  const onPdf = (secId: string) => {
    downloadSectionPDF(secId, table).catch(() => alert("PDF kutubxonasi yuklanmagan!"));
  };

  const jami = table["Viloyat jami"] || {};
  const showMainLoader = !summary && (slot.status === "loading" || slot.refreshing);
  const hidden = (secId: string) => (groupStates[secId] === false ? { display: "none" as const } : undefined);

  const renderCell = (cells: RowCells, key: string, cls: string, secId: string) => {
    const c = getCell(cells, key);
    const clickable = c.value > 0 && !!c.ctx;
    return (
      <td
        key={key}
        className={`${cls}${c.expired ? " expired-cell" : ""}${clickable ? " drilldown-cell" : ""}`}
        style={hidden(secId)}
        onClick={clickable ? () => openDrilldownModal(c.ctx!) : undefined}
      >
        {fmtNum(c.value)}
      </td>
    );
  };

  return (
    <div className="sec-deadline print-page">
      {showMainLoader && <PageLoader overlay fixed text="Ma'lumotlar yuklanmoqda" />}

      {/* ASOSIY HEADER */}
      <header className="top-header-panel">
        <div className="header-title-box">
          <div className="header-icon-badge"><i className="fa-solid fa-chart-line" /></div>
          <div>
            <h2>Рўллар кесмида тахлил («Свод») — {listInfo.title}</h2>
            <span>Har bir bo‘lim alohida asosiy ustunda va bo‘limchalaridan oldinda turadi (FinTech Dashboard).</span>
          </div>
        </div>

        <div className="header-right-actions">
          <div className="datetime-badge">
            <i className="fa-regular fa-calendar" style={{ color: "#64748b" }} />
            <span id="current-date">{now ? fmtDate(now) : "--.--.----"}</span>
            <span className="datetime-divider">|</span>
            <span className="live-dot" />
            <span id="current-time" style={{ fontWeight: 700, color: "#0f172a" }}>{now ? fmtTime(now) : "--:--:--"}</span>
          </div>

          <ReportActions
            onRefresh={refreshPageData} refreshing={localLoading || slot.refreshing}
            onImage={cap.saveImage} imageBusy={cap.busy} onPrint={cap.print} disabled={!summary}
          />
        </div>
      </header>

      {cap.error && (
        <div role="status" className="no-print" onClick={cap.clearError} style={{ margin: "0 0 10px", padding: "8px 14px", borderRadius: 10, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e3a8a", fontSize: 12.5, cursor: "pointer" }}>
          <i className="fa-solid fa-circle-info" style={{ marginRight: 8 }} />{cap.error}
        </div>
      )}

      <div ref={reportRef} className={`dashboard-content-wrapper print-fit${cap.capturing ? " capturing" : ""}`}>
        <div id="local-loader" className="local-loader no-print" data-html2canvas-ignore style={{ display: localLoading ? "flex" : "none" }}>
          <div className="spinner-sm" />
          <span style={{ color: "#0284c7", marginTop: 10, fontWeight: 600, fontSize: 13 }}>Ma&apos;lumotlar yangilanmoqda...</span>
        </div>

        {slot.error && (
          <div role="alert" style={{ margin: "0 0 12px", padding: "10px 14px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: 13, fontWeight: 600 }}>
            <i className="fa-solid fa-circle-exclamation" style={{ marginRight: 8 }} />
            Ma&apos;lumotni yuklab bo&apos;lmadi: {slot.error}
          </div>
        )}

        {/* KPI KARTALARI */}
        <section className="kpi-cards-grid">
          {KPI.map((k) => (
            <div key={k.id} className={`kpi-card ${k.cls}`}>
              <div className="kpi-content-box">
                <div className="kpi-icon"><i className={k.icon} /></div>
                <div className="kpi-info">
                  <span className="kpi-title">{k.title}</span>
                  <h3>{fmtNum(getCell(jami, `cell-sec-total-${k.id}`).value)}</h3>
                </div>
              </div>
              <button onClick={() => onPdf(k.id)} className="kpi-pdf-btn no-print" title="PDF yuklash" data-html2canvas-ignore>
                <PdfIcon />
                <span>PDF</span>
              </button>
            </div>
          ))}
        </section>

        {/* JADVAL */}
        <div className="sheet-viewport">
          <table className="excel-table" id="svodTable">
            <thead>
              <tr>
                <th colSpan={320} className="banner-row-1">
                  <i className="fa-solid fa-file-invoice" style={{ marginRight: 8 }} /> Davlat kadastrlari palatasi Namangan viloyati filiallariga Uzkad dasturiga kelib tushgan, ichki va tashqi manbalardan kelgan {list === "yakunlangan" ? "va yakunlangan" : "va jarayonda turgan"} arizalar toʻgʻrisida
                </th>
              </tr>
              <tr>
                <th colSpan={320} className="banner-row-2">MAʼLUMOT</th>
              </tr>
              <tr className="header-row-roles" id="rolesHeaderRow">
                <th className="freeze-no" rowSpan={2}>№</th>
                <th className="freeze-name" rowSpan={2}>Hudud nomi</th>
                {SECTIONS.map((sec) => (
                  <Fragment key={sec.id}>
                    <th rowSpan={2} className={`group-parent-th ${sec.themeClass}`} style={{ verticalAlign: "middle" }}>
                      <div className="group-btn-box">
                        <span onClick={() => toggleSection(sec.id)} style={{ cursor: "pointer", flexGrow: 1, textAlign: "left" }}>{sec.title}</span>
                        <button onClick={() => toggleSection(sec.id)} className="btn-toggle-modern" title="Ochish/Yopish">
                          <i className={groupStates[sec.id] === false ? "fa-solid fa-chevron-right" : "fa-solid fa-chevron-down"} id={`icon-${sec.id}`} />
                        </button>
                      </div>
                    </th>
                    {sec.roles.map((role) => {
                      const rSlug = slugify(role);
                      const isJami = role.toLowerCase().includes("jami");
                      if (sec.isSingleCol) {
                        if (sec.id === "manba") {
                          const active = manbaFilters.includes(rSlug);
                          const style: React.CSSProperties = {
                            cursor: "pointer",
                            transition: "0.2s",
                            ...(manbaFilters.length > 0 ? { opacity: active ? 1 : 0.4, borderBottom: active ? "4px solid #0284c7" : undefined } : {}),
                            ...hidden(sec.id),
                          };
                          return (
                            <th key={rSlug} rowSpan={2} id={`manba-header-${rSlug}`}
                              className={`${sec.themeClass} col-sec-${sec.id} col-subtotal filter-header`}
                              onClick={() => toggleManbaFilter(rSlug)} style={style} title="Ko'p tanlab filterlash uchun bosing">
                              <i className="fa-solid fa-tag" style={{ fontSize: 9, marginRight: 3 }} />{role}
                            </th>
                          );
                        }
                        return <th key={rSlug} rowSpan={2} className={`${sec.themeClass} col-sec-${sec.id} col-subtotal`} style={hidden(sec.id)}>{role}</th>;
                      }
                      return (
                        <th key={rSlug} colSpan={SUB_COLS.length} className={`${sec.themeClass} col-sec-${sec.id}`}
                          style={{ ...(isJami ? { fontWeight: 700, borderLeft: "2px solid #cbd5e1" } : {}), ...hidden(sec.id) }}>
                          {roleDisplayName(role, sec.id)}
                        </th>
                      );
                    })}
                  </Fragment>
                ))}
              </tr>
              <tr className="header-row-days" id="daysHeaderRow">
                {SECTIONS.filter((s) => !s.isSingleCol).flatMap((sec) =>
                  sec.roles.flatMap((role) =>
                    SUB_COLS.map((colName, cIdx) => (
                      <th key={`${sec.id}-${role}-${cIdx}`} className={`${sec.themeClass} col-sec-${sec.id}${cIdx === 0 ? " col-subtotal" : ""}`} style={hidden(sec.id)}>
                        {colName}
                      </th>
                    ))
                  )
                )}
              </tr>
            </thead>
            <tbody id="tableBody">
              {ROWS.map((r) => {
                const cells = table[r.name] || {};
                return (
                  <tr key={r.name} className={r.isJami ? "row-jami" : undefined} data-region={r.name}>
                    <td className="freeze-no">{r.no}</td>
                    <td className="freeze-name">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                        <span>{r.name}</span>
                        <button onClick={() => downloadTumanExcel(r.name)} title="Excel yuklash" className="no-print" data-html2canvas-ignore
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#0284c7", pointerEvents: exporting === r.name ? "none" : "auto" }}>
                          <i className={exporting === r.name ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-file-excel"} style={{ fontSize: 13 }} />
                        </button>
                      </div>
                    </td>
                    {SECTIONS.map((sec) => (
                      <Fragment key={sec.id}>
                        <td className={`group-parent-cell ${sec.themeClass} cell-sec-total-${sec.id}`}
                          style={hasData[r.name] ? { fontWeight: 700, color: "#0284c7" } : undefined}>
                          {fmtNum(getCell(cells, `cell-sec-total-${sec.id}`).value)}
                        </td>
                        {sec.roles.map((role) => {
                          const slug = slugify(role);
                          if (sec.isSingleCol) return renderCell(cells, `cell-${slug}-0`, `num-cell col-sec-${sec.id} cell-${slug}-0 col-subtotal`, sec.id);
                          return SUB_COLS.map((_, i) =>
                            renderCell(cells, `cell-${slug}-${i}`, `num-cell col-sec-${sec.id} cell-${slug}-${i}${i === 0 ? " col-subtotal" : ""}`, sec.id)
                          );
                        })}
                      </Fragment>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* TELEFON: jadval o'rniga hudud kartalari (rasm va pechat — baribir jadval) */}
        <div className="m-cards dl-cards">
          <div className="dl-manba-filter" role="group" aria-label="Manba filtri">
            {SECTIONS[0].roles.map((role) => {
              const slug = slugify(role);
              return (
                <button key={slug} type="button" className={`dl-filter-chip${manbaFilters.includes(slug) ? " active" : ""}`} onClick={() => toggleManbaFilter(slug)}>
                  {role}
                </button>
              );
            })}
          </div>
          {ROWS.map((r) => {
            const cells = table[r.name] || {};
            const secs = SECTIONS.filter((sec) => groupStates[sec.id] !== false);
            return (
              <details key={r.name} className={`dl-card${r.isJami ? " is-total" : ""}`} open={r.isJami || undefined}>
                <summary>
                  <div className="dl-card-title">
                    <span className="dl-card-n">{r.no}</span>
                    <b>{r.name}</b>
                    <button type="button" className="dl-card-excel" title="Excel yuklash" disabled={exporting === r.name}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); downloadTumanExcel(r.name); }}>
                      <i className={exporting === r.name ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-file-excel"} />
                    </button>
                    <i className="fa-solid fa-chevron-down dl-card-chev" aria-hidden />
                  </div>
                  <div className="dl-card-totals">
                    {secs.map((sec) => (
                      <span key={sec.id} className={`dl-pill ${sec.themeClass}`}>
                        {SEC_SHORT[sec.id]} <b>{fmtNum(getCell(cells, `cell-sec-total-${sec.id}`).value)}</b>
                      </span>
                    ))}
                  </div>
                </summary>
                {secs.map((sec) => (
                  <section key={sec.id} className="dl-sec">
                    <h4 className={sec.themeClass}>
                      <span>{sec.title}</span>
                      <b>{fmtNum(getCell(cells, `cell-sec-total-${sec.id}`).value)}</b>
                    </h4>
                    {sec.isSingleCol ? (
                      <div className="dl-chips">
                        {sec.roles.map((role) => {
                          const c = getCell(cells, `cell-${slugify(role)}-0`);
                          const clickable = c.value > 0 && !!c.ctx;
                          return (
                            <button key={role} type="button" disabled={!clickable}
                              className={`dl-chip${c.value ? "" : " is-zero"}${c.expired ? " expired-cell" : ""}`}
                              onClick={clickable ? () => openDrilldownModal(c.ctx!) : undefined}>
                              <span>{role}</span> <b>{fmtNum(c.value)}</b>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="dl-roles">
                        <div className="dl-days dl-days-head">{SUB_SHORT.map((h) => <span key={h}>{h}</span>)}</div>
                        {sec.roles.map((role) => {
                          const slug = slugify(role);
                          const isJami = role.toLowerCase().includes("jami");
                          return (
                            <div key={slug} className={`dl-role${isJami ? " is-jami" : ""}`}>
                              <div className="dl-role-name">{roleDisplayName(role, sec.id)}</div>
                              <div className="dl-days">
                                {SUB_COLS.map((_, i) => {
                                  const c = getCell(cells, `cell-${slug}-${i}`);
                                  const clickable = c.value > 0 && !!c.ctx;
                                  return (
                                    <button key={i} type="button" disabled={!clickable}
                                      className={`dl-day${i === 0 ? " is-sum" : ""}${c.value ? "" : " is-zero"}${c.expired ? " expired-cell" : ""}`}
                                      onClick={clickable ? () => openDrilldownModal(c.ctx!) : undefined}>
                                      {fmtNum(c.value)}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                ))}
              </details>
            );
          })}
        </div>
      </div>

      {/* DRILLDOWN MODAL */}
      <div id="drilldown-modal" className="modal-overlay no-print" style={{ display: drill.open ? "flex" : "none" }}>
        <div className="modal-content">
          <div className="modal-header">
            <h3 id="drilldown-title" style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
              {drill.title || (<><i className="fa-solid fa-circle-info" style={{ marginRight: 6 }} />Batafsil ma&apos;lumot</>)}
            </h3>
            <button onClick={() => { drillRun.current++; setDrill((d) => ({ ...d, open: false })); }} style={{ background: "none", border: "none", color: "white", fontSize: 20, cursor: "pointer" }}>
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
          <div className="modal-toolbar">
            <span id="drilldown-loading" style={{ color: "#0284c7", fontWeight: 600, display: drill.loading ? "block" : "none" }}>
              <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} />Yuklanmoqda...
            </span>
            <button id="drilldown-export-btn" className="btn-upload"
              style={{ display: !drill.loading && drill.data.length > 0 ? "inline-block" : "none", background: "#10b981" }}
              onClick={exportDrilldownExcel}>
              <i className="fa-solid fa-file-excel" style={{ marginRight: 6 }} /> Excel yuklash
            </button>
          </div>
          <div className="modal-body">
            <table className="excel-table drill-table" id="drilldown-table">
              <thead>
                <tr id="drilldown-thead">
                  {drill.headers.map((k, i) => (
                    <th key={i} style={{ padding: "6px 8px", background: "#f1f5f9", border: "1px solid #cbd5e1", position: "sticky", top: 0, zIndex: 10, whiteSpace: "nowrap", fontWeight: 700 }}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody id="drilldown-tbody">
                {drill.message ? (
                  <tr>
                    <td style={{ padding: 15, border: 0 }}>
                      {drill.message.preparing ? (
                        <div className="drill-error is-preparing">
                          <i className="fa-solid fa-spinner fa-spin" />
                          <div>{drill.message.text} Oyna o&apos;zi yangilanadi.</div>
                        </div>
                      ) : drill.message.error ? (
                        <div className="drill-error">
                          <i className="fa-solid fa-triangle-exclamation" />
                          <div>
                            {drill.message.text}
                            {canUpload && /yuklang/i.test(drill.message.text) && (
                              <a href="/upload" className="drill-error-link"><i className="fa-solid fa-file-arrow-up" /> Bazaga yuklash sahifasiga o&apos;tish</a>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div style={{ textAlign: "center", color: "#64748b" }}>{drill.message.text}</div>
                      )}
                    </td>
                  </tr>
                ) : (
                  drill.data.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((val, ci) => (
                        <td key={ci} style={{ padding: "5px 8px", border: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{val ? String(val) : ""}</td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
