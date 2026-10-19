"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * Qabulxona analitikasi uchun yengil SVG/HTML diagrammalar (tashqi kutubxonasiz).
 * Ranglar: bitta ko'k sequential ramp (kattalik), urg'u — #2a78d6, kontekst — kulrang.
 * Har bir diagrammada hover tooltip bor; qiymatlar matn rangida yoziladi.
 */

export const SEQ = ["#e8f1fd", "#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];
export const ACCENT = "#2a78d6";

const fmtInt = (n: number) => Math.round(n).toLocaleString("ru-RU").replace(/,/g, " ");
export const fmtPct = (x: number) => `${(x * 100).toFixed(x > 0 && x < 0.1 ? 1 : 0)}%`;
export const fmtMin = (m: number | null) => (m === null ? "—" : `${Math.round(m)} daq`);
const ddmm = (k: string) => `${k.slice(8, 10)}.${k.slice(5, 7)}`;
const WD = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];
const wdOf = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
};

/* ---------- tooltip ---------- */
type Tip = { x: number; y: number; content: ReactNode } | null;
function useTip() {
  const [tip, setTip] = useState<Tip>(null);
  const ref = useRef<HTMLDivElement>(null);
  const show = (e: { clientX: number; clientY: number }, content: ReactNode) => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setTip({ x: e.clientX - r.left, y: e.clientY - r.top, content });
  };
  const node = tip && (
    <div className="rc-tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
      {tip.content}
    </div>
  );
  return { ref, show, hide: () => setTip(null), node };
}

/** Konteyner kengligini kuzatish (SVG'ni moslashuvchan chizish uchun) */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    setW(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

/* ---------- karta ---------- */
export function ChartCard({ title, sub, children, className = "", right }: { title: string; sub?: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`rc-chart-card ${className}`}>
      <header className="rc-chart-head">
        <div>
          <h4>{title}</h4>
          {sub && <p>{sub}</p>}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

/* ---------- KPI ---------- */
export function StatTile({ label, value, unit, note, icon, spark, delta }: {
  label: string; value: string; unit?: string; note?: ReactNode; icon: string; spark?: number[];
  delta?: { value: number; label: string } | null;
}) {
  return (
    <div className="rc-tile">
      <div className="rc-tile-top">
        <span className="rc-tile-icon"><i className={icon} aria-hidden /></span>
        <span className="rc-tile-label">{label}</span>
      </div>
      <div className="rc-tile-value">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      <div className="rc-tile-foot">
        {delta && (
          <span className={`rc-delta ${delta.value > 0 ? "up" : delta.value < 0 ? "down" : "flat"}`}>
            {delta.value > 0 ? "▲" : delta.value < 0 ? "▼" : "■"} {delta.label}
          </span>
        )}
        {note && <span className="rc-tile-note">{note}</span>}
        {spark && spark.length > 1 && <Sparkline values={spark} />}
      </div>
    </div>
  );
}

export function Sparkline({ values, w = 96, h = 28 }: { values: number[]; w?: number; h?: number }) {
  const max = Math.max(...values, 1);
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 2 - (v / max) * (h - 4)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const last = pts[pts.length - 1];
  return (
    <svg className="rc-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={`${line}L${w},${h}L0,${h}Z`} fill={ACCENT} opacity={0.12} />
      <path d={line} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={3} fill={ACCENT} stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
}

/* ---------- kunlik dinamika ---------- */
export function AreaTrend({ points, height = 230 }: { points: { date: string; count: number; avg7: number }[]; height?: number }) {
  const { ref: wRef, w } = useWidth<HTMLDivElement>();
  const tip = useTip();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 34, r: 12, t: 12, b: 26 };
  const iw = Math.max(0, w - pad.l - pad.r), ih = height - pad.t - pad.b;

  const max = useMemo(() => {
    // 4 ta butun "chiroyli" qadam: 1 / 2 / 5 × 10^n (murojaatlar soni — kasr qadam bo'lmasin)
    const raw = Math.max(...points.map((p) => p.count), 1) / 4;
    const pow = Math.max(1, Math.pow(10, Math.floor(Math.log10(raw))));
    const step = [1, 2, 5, 10].map((k) => k * pow).find((k) => k >= raw) || raw;
    return step * 4;
  }, [points]);

  if (points.length === 0) return <div className="rc-empty">Ma&apos;lumot yo&apos;q</div>;
  const n = points.length;
  const x = (i: number) => pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.count).toFixed(1)}`).join("");
  const avgLine = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.avg7).toFixed(1)}`).join("");
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 56))));
  const band = n > 1 ? iw / (n - 1) : iw;

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1))));
    setHover(i);
    const p = points[i];
    tip.show(e, (
      <>
        <b>{ddmm(p.date)} · {WD[wdOf(p.date)]}</b>
        <span><i className="rc-key" style={{ background: ACCENT }} />Murojaatlar: <b>{p.count}</b></span>
        <span><i className="rc-key dash" />7 kunlik o&apos;rtacha: <b>{p.avg7.toFixed(1)}</b></span>
      </>
    ));
  };

  return (
    <div className="rc-plot" ref={(el) => { (wRef as React.MutableRefObject<HTMLDivElement | null>).current = el; (tip.ref as React.MutableRefObject<HTMLDivElement | null>).current = el; }}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label="Kunlik murojaatlar dinamikasi">
          {/* dam olish kunlari */}
          {points.map((p, i) => (wdOf(p.date) >= 5 ? <rect key={`we${i}`} x={x(i) - band / 2} y={pad.t} width={band} height={ih} fill="#f3f4f6" /> : null))}
          {[0, 1, 2, 3, 4].map((k) => {
            const v = (max / 4) * k;
            return (
              <g key={k}>
                <line x1={pad.l} x2={pad.l + iw} y1={y(v)} y2={y(v)} stroke={k === 0 ? "#c3c2b7" : "#e1e0d9"} strokeWidth={1} />
                <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="rc-axis">{fmtInt(v)}</text>
              </g>
            );
          })}
          {points.map((p, i) => (i % labelEvery === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= labelEvery / 2) ? (
            <text key={`xl${i}`} x={x(i)} y={height - 8} textAnchor="middle" className="rc-axis">{ddmm(p.date)}</text>
          ) : null)}
          <path d={`${line}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={ACCENT} opacity={0.14} />
          <path d={avgLine} fill="none" stroke="#898781" strokeWidth={1.5} strokeDasharray="4 3" />
          <path d={line} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hover !== null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="#52514e" strokeWidth={1} strokeDasharray="2 2" />
              <circle cx={x(hover)} cy={y(points[hover].count)} r={4.5} fill={ACCENT} stroke="#fff" strokeWidth={2} />
            </g>
          )}
          <rect x={pad.l} y={pad.t} width={iw} height={ih} fill="transparent" onMouseMove={onMove} onMouseLeave={() => { setHover(null); tip.hide(); }} />
        </svg>
      )}
      {tip.node}
      <div className="rc-legend">
        <span><i className="rc-key" style={{ background: ACCENT }} />Kunlik murojaatlar</span>
        <span><i className="rc-key dash" />7 kunlik o&apos;rtacha</span>
        <span><i className="rc-key" style={{ background: "#f3f4f6", border: "1px solid #e1e0d9" }} />Dam olish kunlari</span>
      </div>
    </div>
  );
}

/* ---------- hafta kuni × soat ---------- */
export function Heatmap({ hours, cells, max }: { hours: number[]; cells: number[][]; max: number }) {
  const tip = useTip();
  const color = (v: number) => (v === 0 ? "#f3f4f6" : SEQ[Math.min(SEQ.length - 1, 1 + Math.floor((v / Math.max(max, 1)) * (SEQ.length - 2)))]);
  return (
    <div className="rc-heat" ref={tip.ref}>
      <div className="rc-heat-grid" style={{ gridTemplateColumns: `28px repeat(${hours.length}, minmax(0, 1fr))` }}>
        <span />
        {hours.map((h) => <span key={`h${h}`} className="rc-axis rc-heat-h">{h}</span>)}
        {cells.map((row, d) => [
          <span key={`d${d}`} className="rc-axis rc-heat-d">{WD[d]}</span>,
          ...row.map((v, i) => (
            <span key={`${d}-${i}`} className="rc-heat-cell" style={{ background: color(v) }}
              onMouseMove={(e) => tip.show(e, <><b>{WD[d]}, {hours[i]}:00–{hours[i] + 1}:00</b><span>Murojaatlar: <b>{v}</b></span></>)}
              onMouseLeave={tip.hide} />
          )),
        ])}
      </div>
      <div className="rc-heat-scale">
        <span className="rc-axis">Kam</span>
        {SEQ.slice(1, 12).filter((_, i) => i % 2 === 0).map((c) => <i key={c} style={{ background: c }} />)}
        <span className="rc-axis">Ko&apos;p ({max})</span>
      </div>
      {tip.node}
    </div>
  );
}

/* ---------- gorizontal bar ro'yxati ---------- */
export type BarRow = { key: string; label: string; value: number; tag?: string; right?: ReactNode; tipExtra?: ReactNode };

export function BarList({ rows, onPick, active, emptyText = "Ma'lumot yo'q", maxRows, shade = true }: {
  rows: BarRow[]; onPick?: (key: string) => void; active?: string; emptyText?: string; maxRows?: number; shade?: boolean;
}) {
  const tip = useTip();
  const list = maxRows ? rows.slice(0, maxRows) : rows;
  const max = Math.max(...list.map((r) => r.value), 1);
  if (list.length === 0 || max === 0) return <div className="rc-empty">{emptyText}</div>;
  return (
    <div className="rc-bars" ref={tip.ref}>
      {list.map((r, i) => {
        const pct = (r.value / max) * 100;
        // Kattaroq qiymat — to'qroq (bitta ko'k ramp); faol filtr — urg'u rangi
        const fill = active ? (active === r.key ? ACCENT : "#c3cfdf") : shade ? SEQ[Math.max(4, 11 - Math.floor((i / Math.max(list.length - 1, 1)) * 7))] : ACCENT;
        const Row = onPick ? "button" : "div";
        return (
          <Row key={r.key} type={onPick ? "button" : undefined} className={`rc-bar-row${onPick ? " clickable" : ""}${active === r.key ? " active" : ""}`}
            onClick={onPick ? () => onPick(r.key) : undefined}
            onMouseMove={(e: React.MouseEvent) => tip.show(e, <><b>{r.label}{r.tag ? ` · ${r.tag}` : ""}</b><span>Murojaatlar: <b>{r.value}</b></span>{r.tipExtra}</>)}
            onMouseLeave={tip.hide}>
            <span className="rc-bar-label">
              <span className="rc-bar-name">{r.label}</span>
              {r.tag && <span className="rc-bar-tag">{r.tag}</span>}
            </span>
            <span className="rc-bar-track">
              <span className="rc-bar-fill" style={{ width: `${r.value > 0 ? Math.max(pct, 2) : 0}%`, background: fill }} />
            </span>
            <span className="rc-bar-value">{r.right ?? r.value}</span>
          </Row>
        );
      })}
      {tip.node}
    </div>
  );
}

/* ---------- ulush chizig'i (ma'lumot sifati) ---------- */
export function Meter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rc-meter">
      <div className="rc-meter-top"><span>{label}</span><b>{fmtPct(value)}</b></div>
      <div className="rc-meter-track"><span style={{ width: `${Math.min(100, value * 100)}%`, background: tone }} /></div>
    </div>
  );
}

/* ---------- bo'lingan (stacked) barlar: har bir qator — qismlar yig'indisi ---------- */
export type Segment = { key: string; label: string; color: string };

/** Ranglar legendasi (2 va undan ko'p seriya — legend doim bor) */
export function SegmentLegend({ segments, values, total }: { segments: Segment[]; values?: Record<string, number>; total?: number }) {
  return (
    <div className="rc-seg-legend">
      {segments.map((s) => (
        <span key={s.key}>
          <i className="rc-key sq" style={{ background: s.color }} />
          {s.label}
          {values && <b>{values[s.key] || 0}</b>}
          {values && total ? <small>{fmtPct((values[s.key] || 0) / total)}</small> : null}
        </span>
      ))}
    </div>
  );
}

export function StackedBarList({ rows, segments, onPick, active }: {
  rows: { key: string; label: string; parts: Record<string, number> }[];
  segments: Segment[];
  onPick?: (key: string) => void;
  active?: string;
}) {
  const tip = useTip();
  const totals = rows.map((r) => segments.reduce((a, s) => a + (r.parts[s.key] || 0), 0));
  const max = Math.max(...totals, 1);
  if (rows.length === 0 || totals.every((t) => t === 0)) return <div className="rc-empty">Ma&apos;lumot yo&apos;q</div>;
  return (
    <div className="rc-bars" ref={tip.ref}>
      {rows.map((r, i) => {
        const total = totals[i];
        const Row = onPick ? "button" : "div";
        return (
          <Row key={r.key} type={onPick ? "button" : undefined} className={`rc-bar-row${onPick ? " clickable" : ""}${active === r.key ? " active" : ""}${active && active !== r.key ? " dim" : ""}`}
            onClick={onPick ? () => onPick(r.key) : undefined}
            onMouseMove={(e: React.MouseEvent) => tip.show(e, (
              <>
                <b>{r.label} · {total} ta</b>
                {segments.map((s) => (
                  <span key={s.key}><i className="rc-key sq" style={{ background: s.color }} />{s.label}: <b>{r.parts[s.key] || 0}</b>{total ? ` (${fmtPct((r.parts[s.key] || 0) / total)})` : ""}</span>
                ))}
              </>
            ))}
            onMouseLeave={tip.hide}>
            <span className="rc-bar-label"><span className="rc-bar-name">{r.label}</span></span>
            <span className="rc-bar-track rc-stack" style={{ width: `${(total / max) * 100}%` }}>
              {segments.map((s) => {
                const v = r.parts[s.key] || 0;
                return v > 0 ? <span key={s.key} style={{ flexGrow: v, background: s.color }} /> : null;
              })}
            </span>
            <span className="rc-bar-value"><b>{total}</b></span>
          </Row>
        );
      })}
      {tip.node}
    </div>
  );
}

/** Bitta 100% chiziq — umumiy taqsimot (natijalar, shaxs turi) */
export function ShareBar({ segments, values }: { segments: Segment[]; values: Record<string, number> }) {
  const tip = useTip();
  const total = segments.reduce((a, s) => a + (values[s.key] || 0), 0);
  return (
    <div className="rc-share" ref={tip.ref}>
      <div className="rc-share-bar">
        {total === 0 ? <span style={{ flexGrow: 1, background: "#eef2f7" }} /> : segments.map((s) => {
          const v = values[s.key] || 0;
          return v > 0 ? (
            <span key={s.key} style={{ flexGrow: v, background: s.color }}
              onMouseMove={(e) => tip.show(e, <><b>{s.label}</b><span>{v} ta · {fmtPct(v / total)}</span></>)} onMouseLeave={tip.hide} />
          ) : null;
        })}
      </div>
      <SegmentLegend segments={segments} values={values} total={total} />
      {tip.node}
    </div>
  );
}
