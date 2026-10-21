"use client";

import { Fragment, useCallback, useMemo, useRef, useState } from "react";
import { useSection } from "@/components/DataProvider";
import { downloadBlob, fmtDate, fmtHM } from "@/lib/useClock";
import { useReportCapture } from "@/lib/useReportCapture";
import ReportActions from "@/components/ReportActions";
import PageLoader from "@/components/PageLoader";
import {
  ETIROF_PAGES, flatCols, isGroup, parseNum,
  type EtirofCol, type EtirofPage, type EtirofRow, type EtirofSvod,
} from "./config";

/**
 * "E'tirof" bo'limchasi: SVOD jadvali (sheet'dagi ko'rinishda, data-bar'lar bilan).
 * Tuman nomi bosilsa — o'sha tumanning xom qatorlari Excel'da; "Rasm" — hisobot kartasi PNG;
 * "Chop etish" — A4 albom, faqat hisobot kartasi (styles/etirof.css → @media print).
 * Telefonda (≤ 768 px) jadval o'rniga har bir hudud — alohida karta (SvodCards); rasm va pechat — baribir jadval.
 */
export default function EtirofView({ page }: { page: EtirofPage }) {
  const slot = useSection("etirof");
  const def = ETIROF_PAGES[page];
  const entry = slot.data?.[page];
  const svod = entry && !("error" in entry) ? entry : null;
  const error = (entry && "error" in entry ? entry.error : null) || (!svod ? slot.error : null);

  const reportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileName = useCallback(() => `Etirof_${page}_${fmtDate(new Date())}.png`, [page]);
  const cap = useReportCapture(reportRef, { fileName, windowWidth: 1400, maxScale: 3 });

  const exportTuman = async (name: string) => {
    if (exporting) return;
    setExporting(name);
    setNotice(null);
    try {
      const res = await fetch(`/api/etirof/${page}/export?tuman=${encodeURIComponent(name)}`, { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      const cd = res.headers.get("Content-Disposition") || "";
      const file = decodeURIComponent(cd.match(/filename\*=UTF-8''([^;]+)/)?.[1] || `${name}.xlsx`);
      downloadBlob(await res.blob(), file);
    } catch (e) {
      setNotice(`Excel: ${(e as Error).message}`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="sec-etirof print-page" style={accentVars(def.accent)}>
      <header className="et-toolbar">
        <div className="et-toolbar-title">
          <div className="et-badge"><i className={def.icon} /></div>
          <div>
            <h2>{def.title}</h2>
            <span>
              Эътироф · Свод{svod?.asOf ? ` · ${svod.asOf}` : ""}
              {slot.updatedAt ? ` · yangilandi ${fmtHM(new Date(slot.updatedAt))}` : ""}
            </span>
          </div>
        </div>
        <ReportActions
          onRefresh={() => slot.refresh(true)} refreshing={slot.refreshing}
          onImage={cap.saveImage} imageBusy={cap.busy} onPrint={cap.print} disabled={!svod}
        />
      </header>

      {error && (
        <div className="et-alert" role="alert">
          <i className="fa-solid fa-circle-exclamation" /> Ma&apos;lumotni olib bo&apos;lmadi: {error}
        </div>
      )}
      {(notice || cap.error) && (
        <div className="et-alert" role="status" onClick={() => (setNotice(null), cap.clearError())}>
          <i className="fa-solid fa-circle-info" /> {notice || cap.error}
        </div>
      )}

      {!svod && !error && (
        <PageLoader />
      )}

      {svod && (
        <>
          <p className="et-hint"><i className="fa-solid fa-file-excel" /> Tuman nomini bosing — o&apos;sha tuman bo&apos;yicha ro&apos;yxat Excel faylda yuklanadi.</p>
          <div ref={reportRef} className={`et-report${cap.capturing ? " capturing" : ""}`}>
            <div className="et-report-head">
              <h1><Rich text={def.heading} /></h1>
              <h2>МАЪЛУМОТ</h2>
              {svod.asOf && <div className="et-asof">{svod.asOf}</div>}
            </div>
            <div className="et-table-wrap">
              <SvodTable page={page} svod={svod} exporting={exporting} onExport={exportTuman} />
            </div>
            <SvodCards page={page} svod={svod} exporting={exporting} onExport={exportTuman} />
          </div>
        </>
      )}
    </div>
  );
}

/** Aksent rangidan och fonlar (html2canvas color-mix()'ni tushunmaydi — rgba bilan) */
function accentVars(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const rgb = `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  return { "--et-accent": hex, "--rpt-accent": hex, "--et-soft": `rgba(${rgb}, 0.07)`, "--et-soft2": `rgba(${rgb}, 0.14)` } as React.CSSProperties;
}

/** "{r:qizil} oddiy {b:ko'k}" → rangli bo'laklar */
function Rich({ text, date }: { text: string; date?: string }) {
  const parts = text.replace(/\{date\}/g, date || "…").split(/(\{[rbco]:[^}]*\})/);
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\{([rbco]):([^}]*)\}$/);
        return m ? <span key={i} className={`t-${m[1]}`}>{m[2]}</span> : <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

const fmtCell = (s: string) => s || "–";

type SvodProps = {
  page: EtirofPage;
  svod: EtirofSvod;
  exporting: string | null;
  onExport: (name: string) => void;
};

/** Jadval va kartalar uchun umumiy: ustunlar, qiymat klassi va data-bar uzunligi */
function useSvodCells(page: EtirofPage, svod: EtirofSvod) {
  const def = ETIROF_PAGES[page];
  const cols = useMemo(() => flatCols(def.head), [def]);
  // Bar uzunligi: ustundagi eng katta mutlaq qiymatga nisbatan (jami qatorisiz)
  const max = useMemo(
    () => cols.map((c, i) => (c.bar ? Math.max(1, ...svod.rows.map((r) => Math.abs(parseNum(r.cells[i])))) : 1)),
    [cols, svod]
  );
  const value = (c: EtirofCol, i: number, r: EtirofRow, total: boolean) => {
    const raw = r.cells[i];
    const v = parseNum(raw);
    const tone = [c.tone && `tone-${c.tone}`, c.bold && "is-bold", v === 0 && /^0([.,]0+)?%?$/.test(raw.trim()) && "is-zero"]
      .filter(Boolean)
      .join(" ");
    // Kamida 2% (CSS da min-width) — html2canvas 0 px kenglikdagi gradientda yiqiladi
    const w = c.bar && !total && raw && v !== 0 ? Math.max(2, Math.min(100, (Math.abs(v) / max[i]) * 100)) : 0;
    const bar = w > 0 ? `bar-${v < 0 ? "neg" : c.bar}` : "";
    return { text: fmtCell(raw), tone, w, bar };
  };
  return { def, cols, value };
}

/** Tuman nomi — bosilsa Excel. Eksport lotincha nom bo'yicha (xom varaqlarda tumanlar lotincha), ko'rinishda — kirillcha */
function TumanButton({ r, exporting, onExport }: { r: EtirofRow; exporting: string | null; onExport: (name: string) => void }) {
  const key = r.latin || r.name;
  return (
    <button type="button" className="et-tuman" onClick={() => onExport(key)} disabled={!!exporting} title={`${r.name} bo'yicha Excel yuklab olish`}>
      <span>{r.name}</span>
      <i className={`fa-solid ${exporting === key ? "fa-spinner fa-spin" : "fa-file-excel"}`} aria-hidden />
    </button>
  );
}

function SvodTable({ page, svod, exporting, onExport }: SvodProps) {
  const { def, cols, value } = useSvodCells(page, svod);
  const hasGroups = def.head.some(isGroup);
  const rs = hasGroups ? 2 : 1;

  const cell = (c: EtirofCol, i: number, r: EtirofRow, total: boolean) => {
    const v = value(c, i, r, total);
    return (
      <td key={c.col} className={`et-num${v.tone ? ` ${v.tone}` : ""}`}>
        {v.w > 0 && <span className={`et-bar ${v.bar}`} style={{ width: `${v.w}%` }} aria-hidden />}
        <span className="et-val">{v.text}</span>
      </td>
    );
  };
  const nameBtn = (r: EtirofRow) => <TumanButton r={r} exporting={exporting} onExport={onExport} />;

  return (
    <table className="et-table">
      <colgroup>
        <col className="c-n" />
        <col className="c-name" />
        {cols.map((c) => <col key={c.col} />)}
      </colgroup>
      <thead>
        <tr>
          <th rowSpan={rs} className="h-n">№</th>
          <th rowSpan={rs} className="h-name">Ҳудуд номи</th>
          {def.head.map((h, gi) =>
            isGroup(h) ? (
              <th key={gi} colSpan={h.cols.length} className="h-group"><Rich text={h.group} /></th>
            ) : (
              <th key={h.col} rowSpan={rs} className={h.headTone ? `head-${h.headTone}` : undefined}>
                <Rich text={h.label} date={svod.headDates[h.col]} />
              </th>
            )
          )}
        </tr>
        {hasGroups && (
          <tr>
            {def.head.filter(isGroup).flatMap((g) => g.cols).map((c) => (
              <th key={c.col} className={c.headTone ? `head-${c.headTone}` : undefined}>
                <Rich text={c.label} date={svod.headDates[c.col]} />
              </th>
            ))}
          </tr>
        )}
        {svod.total && (
          <tr className="et-total">
            <td className="et-n" />
            <td className="et-name">{nameBtn(svod.total)}</td>
            {cols.map((c, i) => cell(c, i, svod.total!, true))}
          </tr>
        )}
      </thead>
      <tbody>
        {svod.rows.map((r) => (
          <tr key={r.n}>
            <td className="et-n">{r.n}</td>
            <td className="et-name">{nameBtn(r)}</td>
            {cols.map((c, i) => cell(c, i, r, false))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Telefon ko'rinishi: har bir hudud — karta, ichida guruhlar va "ko'rsatkich — qiymat" qatorlari */
function SvodCards({ page, svod, exporting, onExport }: SvodProps) {
  const { def, cols, value } = useSvodCells(page, svod);
  const idx = useMemo(() => new Map(cols.map((c, i) => [c.col, i])), [cols]);

  const item = (c: EtirofCol, r: EtirofRow, total: boolean) => {
    const v = value(c, idx.get(c.col)!, r, total);
    return (
      <div key={c.col} className="et-kv">
        <span className={`et-kv-label${c.headTone ? ` head-${c.headTone}` : ""}`}><Rich text={c.label} date={svod.headDates[c.col]} /></span>
        <b className={`et-kv-val${v.tone ? ` ${v.tone}` : ""}`}>{v.text}</b>
        {v.w > 0 && <span className="et-kv-bar" aria-hidden><i className={v.bar} style={{ width: `${v.w}%` }} /></span>}
      </div>
    );
  };

  const card = (r: EtirofRow, total: boolean) => (
    <article key={total ? "total" : r.n} className={`et-card${total ? " is-total" : ""}`}>
      <header className="et-card-head">
        {!total && <span className="et-card-n">{r.n}</span>}
        <TumanButton r={r} exporting={exporting} onExport={onExport} />
      </header>
      {def.head.map((h, gi) =>
        isGroup(h) ? (
          <section key={gi} className="et-card-group">
            <h4><Rich text={h.group} /></h4>
            {h.cols.map((c) => item(c, r, total))}
          </section>
        ) : (
          item(h, r, total)
        )
      )}
    </article>
  );

  return (
    <div className="m-cards et-cards">
      {svod.total && card(svod.total, true)}
      {svod.rows.map((r) => card(r, false))}
    </div>
  );
}
