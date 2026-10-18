"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useSection } from "@/components/DataProvider";
import { useClock, fmtDate, fmtTime, downloadBlob } from "@/lib/useClock";
import {
  ROWS, SECTIONS, SUB_COLS, computeTable, getCell, fmtNum, roleDisplayName, slugify,
  type DrillCtx, type RowCells,
} from "./model";
import { downloadSectionPDF } from "./pdf";

const GROUP_KEY = "dkp_group_states";
const DEFAULT_GROUPS: Record<string, boolean> = { manba: true, filial: true, boshqarma: true, dkp: true, agentlik: true };
const API_DETAILS = "/api/deadline/details";

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
  message: { text: string; error?: boolean } | null;
};

export default function DeadlineView() {
  const slot = useSection("deadline");
  const now = useClock();

  const [groupStates, setGroupStates] = useState<Record<string, boolean>>(DEFAULT_GROUPS);
  const [manbaFilters, setManbaFilters] = useState<string[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [drill, setDrill] = useState<Drill>({ open: false, loading: false, title: "", headers: [], data: [], message: null });

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

  const { result: table, hasData } = useMemo(() => computeTable(slot.data, manbaFilters), [slot.data, manbaFilters]);

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
    if (!slot.data) return;
    setManbaFilters((f) => (f.includes(slug) ? f.filter((x) => x !== slug) : [...f, slug]));
  };

  const refreshPageData = async () => {
    setLocalLoading(true);
    await slot.refresh(true);
    setLocalLoading(false);
  };

  const openDrilldownModal = async (ctx: DrillCtx) => {
    setDrill({ open: true, loading: true, title: `${ctx.tuman} arizalari (Yuklanmoqda...)`, headers: [], data: [], message: null });
    try {
      const p = new URLSearchParams({ tuman: ctx.tuman, _t: String(Date.now()) });
      if (ctx.manba) p.set("manba", ctx.manba);
      if (ctx.role) p.set("role", ctx.role);
      if (ctx.day) p.set("day", ctx.day);
      const res = await fetch(`${API_DETAILS}?${p}`);
      const json = await res.json();
      if (json.status === "success" && json.data && json.data.length > 0) {
        setDrill({
          open: true, loading: false, message: null,
          title: `${ctx.tuman} | Jami to'liq yuklandi: ${json.data.length} ta ariza`,
          headers: json.headers || [], data: json.data,
        });
      } else {
        setDrill((d) => ({ ...d, loading: false, message: { text: "Hozircha ma'lumot topilmadi!" } }));
      }
    } catch {
      setDrill((d) => ({ ...d, loading: false, message: { text: "Tarmoq uzildi!", error: true } }));
    }
  };

  const exportDrilldownExcel = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([drill.headers, ...drill.data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tafsilot");
    XLSX.writeFile(wb, "Arizalar_Batafsil.xlsx");
  };

  const downloadTumanExcel = async (tumanName: string) => {
    setExporting(tumanName);
    try {
      const p = new URLSearchParams({ action: "export", tuman: tumanName, _t: String(Date.now()) });
      const res = await fetch(`${API_DETAILS}?${p}`);
      if (!res.ok) throw new Error("Server xatosi");
      downloadBlob(await res.blob(), `${tumanName.replace(/\s+/g, "_")}_Arizalar.xlsx`);
    } catch {
      alert("Excel yuklab olishda xatolik yuz berdi!");
    } finally {
      setExporting(null);
    }
  };

  const onPdf = (secId: string) => {
    downloadSectionPDF(secId, table).catch(() => alert("PDF kutubxonasi yuklanmagan!"));
  };

  const jami = table["Viloyat jami"] || {};
  const showMainLoader = slot.status === "loading" && !slot.data;
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
    <div className="sec-deadline">
      {showMainLoader && (
        <div id="main-loader">
          <div className="spinner" />
          <h3 style={{ color: "#0284c7", marginTop: 10, fontWeight: 600, fontSize: 13 }}>
            Ma&apos;lumotlar yuklanmoqda...
          </h3>
        </div>
      )}

      {/* ASOSIY HEADER */}
      <header className="top-header-panel">
        <div className="header-title-box">
          <div className="header-icon-badge"><i className="fa-solid fa-chart-line" /></div>
          <div>
            <h2>Рўллар кесмида тахлил («Свод»)</h2>
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

          <button onClick={refreshPageData} className="btn-action-panel" title="Ma'lumotlarni yangilash">
            <i className="fa-solid fa-rotate" /> Yangilash
          </button>
        </div>
      </header>

      <div className="dashboard-content-wrapper">
        <div id="local-loader" className="local-loader" style={{ display: localLoading ? "flex" : "none" }}>
          <div className="spinner-sm" />
          <span style={{ color: "#0284c7", marginTop: 10, fontWeight: 600, fontSize: 13 }}>Ma&apos;lumotlar yangilanmoqda...</span>
        </div>

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
              <button onClick={() => onPdf(k.id)} className="kpi-pdf-btn" title="PDF yuklash">
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
                  <i className="fa-solid fa-file-invoice" style={{ marginRight: 8 }} /> Davlat kadastrlari palatasi Namangan viloyati filiallariga Uzkad dasturiga kelib tushgan, ichki va tashqi manbalardan kelgan va jarayonda turgan arizalar toʻgʻrisida
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
                        <button onClick={() => downloadTumanExcel(r.name)} title="Excel yuklash"
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
      </div>

      {/* DRILLDOWN MODAL */}
      <div id="drilldown-modal" className="modal-overlay" style={{ display: drill.open ? "flex" : "none" }}>
        <div className="modal-content">
          <div className="modal-header">
            <h3 id="drilldown-title" style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
              {drill.title || (<><i className="fa-solid fa-circle-info" style={{ marginRight: 6 }} />Batafsil ma&apos;lumot</>)}
            </h3>
            <button onClick={() => setDrill((d) => ({ ...d, open: false }))} style={{ background: "none", border: "none", color: "white", fontSize: 20, cursor: "pointer" }}>
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
          <div style={{ padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
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
            <table className="excel-table" style={{ width: "100%", borderCollapse: "collapse" }} id="drilldown-table">
              <thead>
                <tr id="drilldown-thead">
                  {drill.headers.map((k, i) => (
                    <th key={i} style={{ padding: "6px 8px", background: "#f1f5f9", border: "1px solid #cbd5e1", position: "sticky", top: 0, zIndex: 10, whiteSpace: "nowrap", fontWeight: 700 }}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody id="drilldown-tbody">
                {drill.message ? (
                  <tr><td style={{ textAlign: "center", padding: 15, color: drill.message.error ? "red" : undefined }}>{drill.message.text}</td></tr>
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
