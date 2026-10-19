"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { useSection } from "@/components/DataProvider";
import { downloadBlob, fmtDate, fmtHM } from "@/lib/useClock";
import {
  ETIROF_PAGES, flatCols, isGroup, parseNum,
  type EtirofCol, type EtirofPage, type EtirofRow, type EtirofSvod,
} from "./config";

/**
 * "E'tirof" bo'limchasi: SVOD jadvali (sheet'dagi ko'rinishda, data-bar'lar bilan).
 * Tuman nomi bosilsa — o'sha tumanning xom qatorlari Excel'da; "Rasm" — hisobot kartasi PNG;
 * "Chop etish" — A4 albom, faqat hisobot kartasi (styles/etirof.css → @media print).
 */
export default function EtirofView({ page }: { page: EtirofPage }) {
  const slot = useSection("etirof");
  const def = ETIROF_PAGES[page];
  const entry = slot.data?.[page];
  const svod = entry && !("error" in entry) ? entry : null;
  const error = (entry && "error" in entry ? entry.error : null) || (!svod ? slot.error : null);

  const reportRef = useRef<HTMLDivElement>(null);
  const [capturing, setCapturing] = useState(false);
  const [busyImg, setBusyImg] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const saveImage = async () => {
    const el = reportRef.current;
    if (!el) return;
    setBusyImg(true);
    setCapturing(true);
    // Sticky va gorizontal scroll o'chirilgan holat chizilishini kutish
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(el, { scale: 3, backgroundColor: "#ffffff", useCORS: true, logging: false, windowWidth: 1400 });
      canvas.toBlob((b) => b && downloadBlob(b, `Etirof_${page}_${fmtDate(new Date())}.png`), "image/png");
    } catch (e) {
      console.error("Rasm xatolik:", e);
      setNotice("Rasmni saqlab bo'lmadi.");
    } finally {
      setCapturing(false);
      setBusyImg(false);
    }
  };

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
    <div className="sec-etirof" style={accentVars(def.accent)}>
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
        <div className="et-actions">
          <button className="et-btn" onClick={() => slot.refresh(true)} disabled={slot.refreshing} title="Google Sheets'dan qayta o'qish">
            <i className={`fa-solid fa-rotate${slot.refreshing ? " fa-spin" : ""}`} /> <span>Yangilash</span>
          </button>
          <button className="et-btn" onClick={saveImage} disabled={!svod || busyImg} title="Jadvalni rasm (PNG) sifatida yuklab olish">
            <i className={`fa-solid ${busyImg ? "fa-spinner fa-spin" : "fa-image"}`} /> <span>Rasm</span>
          </button>
          <button className="et-btn et-btn-primary" onClick={() => window.print()} disabled={!svod} title="Chop etish (A4 albom)">
            <i className="fa-solid fa-print" /> <span>Chop etish</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="et-alert" role="alert">
          <i className="fa-solid fa-circle-exclamation" /> Ma&apos;lumotni olib bo&apos;lmadi: {error}
        </div>
      )}
      {notice && (
        <div className="et-alert" role="status" onClick={() => setNotice(null)}>
          <i className="fa-solid fa-circle-info" /> {notice}
        </div>
      )}

      {!svod && !error && (
        <div className="et-loading"><i className="fa-solid fa-spinner fa-spin" /> Yuklanmoqda…</div>
      )}

      {svod && (
        <>
          <p className="et-hint"><i className="fa-solid fa-file-excel" /> Tuman nomini bosing — o&apos;sha tuman bo&apos;yicha ro&apos;yxat Excel faylda yuklanadi.</p>
          <div ref={reportRef} className={`et-report${capturing ? " capturing" : ""}`}>
            <div className="et-report-head">
              <h1><Rich text={def.heading} /></h1>
              <h2>МАЪЛУМОТ</h2>
              {svod.asOf && <div className="et-asof">{svod.asOf}</div>}
            </div>
            <div className="et-table-wrap">
              <SvodTable page={page} svod={svod} exporting={exporting} onExport={exportTuman} />
            </div>
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
  return { "--et-accent": hex, "--et-soft": `rgba(${rgb}, 0.07)`, "--et-soft2": `rgba(${rgb}, 0.14)` } as React.CSSProperties;
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

function SvodTable({ page, svod, exporting, onExport }: {
  page: EtirofPage;
  svod: EtirofSvod;
  exporting: string | null;
  onExport: (name: string) => void;
}) {
  const def = ETIROF_PAGES[page];
  const cols = useMemo(() => flatCols(def.head), [def]);
  // Bar uzunligi: ustundagi eng katta mutlaq qiymatga nisbatan (jami qatorisiz)
  const max = useMemo(
    () => cols.map((c, i) => (c.bar ? Math.max(1, ...svod.rows.map((r) => Math.abs(parseNum(r.cells[i])))) : 1)),
    [cols, svod]
  );
  const hasGroups = def.head.some(isGroup);
  const rs = hasGroups ? 2 : 1;

  const cell = (c: EtirofCol, i: number, r: EtirofRow, total: boolean) => {
    const raw = r.cells[i];
    const v = parseNum(raw);
    const cls = ["et-num", c.tone && `tone-${c.tone}`, c.bold && "is-bold", v === 0 && /^0([.,]0+)?%?$/.test(raw.trim()) && "is-zero"]
      .filter(Boolean)
      .join(" ");
    // Kamida 2% (CSS da min-width) — html2canvas 0 px kenglikdagi gradientda yiqiladi
    const w = c.bar && !total && raw && v !== 0 ? Math.max(2, Math.min(100, (Math.abs(v) / max[i]) * 100)) : 0;
    return (
      <td key={c.col} className={cls}>
        {w > 0 && <span className={`et-bar bar-${v < 0 ? "neg" : c.bar}`} style={{ width: `${w}%` }} aria-hidden />}
        <span className="et-val">{fmtCell(raw)}</span>
      </td>
    );
  };

  // Eksport lotincha nom bo'yicha (xom varaqlarda tumanlar lotincha), ko'rinishda — kirillcha
  const nameBtn = (r: EtirofRow) => {
    const key = r.latin || r.name;
    return (
      <button type="button" className="et-tuman" onClick={() => onExport(key)} disabled={!!exporting} title={`${r.name} bo'yicha Excel yuklab olish`}>
        <span>{r.name}</span>
        <i className={`fa-solid ${exporting === key ? "fa-spinner fa-spin" : "fa-file-excel"}`} aria-hidden />
      </button>
    );
  };

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
