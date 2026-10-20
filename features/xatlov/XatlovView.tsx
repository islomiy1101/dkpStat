"use client";

import { useCallback, useMemo, useRef } from "react";
import { useSection } from "@/components/DataProvider";
import { fmtDate, fmtHM } from "@/lib/useClock";
import { useReportCapture } from "@/lib/useReportCapture";
import ReportActions from "@/components/ReportActions";
import { parseNum } from "@/features/etirof/config";
import { BLOCK_IDS, dmy, pctScale, type BlockId, type XatlovBlock, type XatlovRow } from "./config";

/**
 * "Xatlov+Faol" — ЎРҚ-937 ШТАБ маълумоти (sheet'dagi ko'rinishda).
 * Kunlik qiymat 1 kunlik rejadan kam bo'lsa — qizil; foizlar — 3 rangli shkala (≥100% yashil).
 * "Rasm" — hisobot kartasi PNG, "Chop etish" — A4 albom (styles/xatlov.css → @media print).
 * Telefonda (≤ 768 px) jadval o'rniga har bir hudud — alohida karta (RowCard); rasm va pechat — baribir jadval.
 */
const BLOCK_TITLE: Record<BlockId, string> = { xatlov: "Хатлов", faol: "Фаол" };
const JAMI_LABEL: Record<BlockId, string> = { xatlov: "Хатлов ўтказилган объектлар", faol: "Жами фаол" };
const BLOCK_ICON: Record<BlockId, string> = { xatlov: "fa-solid fa-map-location-dot", faol: "fa-solid fa-bolt" };
/** Blok kataklari klassi; `start` — blokning birinchi ustuni (chap tomonda qalin chegara) */
const blk = (b: BlockId, cls = "", start = false) => `blk-${b}${start ? " blk-start" : ""}${cls ? ` ${cls}` : ""}`;

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const pctText = (v: number | null) => (v == null ? "–" : `${Math.round(v * 100)}%`);
/** Sheet'dagi "97%" → 0.97 */
const pctVal = (s: string) => (s.trim() ? parseNum(s) / 100 : null);

export default function XatlovView() {
  const slot = useSection("xatlov");
  const data = slot.data;
  const reportRef = useRef<HTMLDivElement>(null);
  const fileName = useCallback(() => `Xatlov_Faol_${fmtDate(new Date())}.png`, []);
  const cap = useReportCapture(reportRef, { fileName, windowWidth: 2100 });

  // Foiz ustunlari shkalasi — tumanlar bo'yicha (viloyat qatori ham shu shkalada bo'yaladi)
  const scales = useMemo(() => {
    const rows = data?.rows ?? [];
    return Object.fromEntries(
      BLOCK_IDS.map((b) => [
        b,
        {
          oy: pctScale(rows.map((r) => pctVal(r[b].pct) ?? NaN)),
          hafta: pctScale(rows.map((r) => r[b].haftaPct ?? NaN)),
        },
      ])
    ) as Record<BlockId, { oy: ReturnType<typeof pctScale>; hafta: ReturnType<typeof pctScale> }>;
  }, [data]);

  const error = !data ? slot.error : null;

  return (
    <div className="sec-xatlov print-page">
      <header className="xt-toolbar">
        <div className="xt-toolbar-title">
          <div className="xt-badge"><i className="fa-solid fa-map-location-dot" /></div>
          <div>
            <h2>Xatlov+Faol</h2>
            <span>
              ЎРҚ-937 · ШТАБ маълумоти
              {data ? ` · hafta ${dmy(data.week[0])} – ${dmy(data.week[5])}` : ""}
              {slot.updatedAt ? ` · yangilandi ${fmtHM(new Date(slot.updatedAt))}` : ""}
            </span>
          </div>
        </div>
        <ReportActions
          onRefresh={() => slot.refresh(true)} refreshing={slot.refreshing}
          onImage={cap.saveImage} imageBusy={cap.busy} onPrint={cap.print} disabled={!data}
        />
      </header>

      {error && (
        <div className="xt-alert" role="alert">
          <i className="fa-solid fa-circle-exclamation" /> Ma&apos;lumotni olib bo&apos;lmadi: {error}
        </div>
      )}
      {cap.error && (
        <div className="xt-alert is-info" role="status" onClick={cap.clearError}>
          <i className="fa-solid fa-circle-info" /> {cap.error}
        </div>
      )}
      {!data && !error && <div className="xt-loading"><i className="fa-solid fa-spinner fa-spin" /> Yuklanmoqda…</div>}

      {data && (
        <div ref={reportRef} className={`xt-report${cap.capturing ? " capturing" : ""}`}>
          <div className="xt-report-head">
            <h1>Ўзбекистон Республикасининг ЎРҚ-937-сон Қонуни ижроси бўйича ШТАБ маълумоти</h1>
            {data.asOf && <div className="xt-asof">{data.asOf}</div>}
          </div>
          <div className="xt-table-wrap">
            <table className="xt-table">
              <thead>
                <tr>
                  <th rowSpan={3} className="sticky-n">Т/р</th>
                  <th rowSpan={3} className="sticky-name">Ҳудудлар номи</th>
                  {BLOCK_IDS.map((b) => (
                    <th key={b} colSpan={16} className={blk(b, "h-block", true)}>
                      <i className={BLOCK_ICON[b]} /> {BLOCK_TITLE[b]}
                    </th>
                  ))}
                  <th colSpan={2} rowSpan={2} className="h-block blk-other blk-start">Жараён</th>
                  <th rowSpan={3} className="h-vert is-2l blk-other"><span>Кадастр муҳандиси<br />сони</span></th>
                </tr>
                <tr>
                  {BLOCK_IDS.map((b) => [
                    <th key={`${b}-j`} rowSpan={2} className={blk(b, "h-sm", true)}>{JAMI_LABEL[b]}</th>,
                    <th key={`${b}-m`} colSpan={5} className={blk(b, "h-month")}>{data.month}</th>,
                    <th key={`${b}-hr`} rowSpan={2} className={blk(b, "h-vert t-red")}><span>Ҳафталик режа</span></th>,
                    <th key={`${b}-h`} rowSpan={2} className={blk(b, "h-vert is-2l t-red")}><span>шундан<br />1 ҳафтада</span></th>,
                    <th key={`${b}-k`} colSpan={8} className={blk(b, "h-kun")}>шундан кунлик</th>,
                  ])}
                </tr>
                <tr>
                  {BLOCK_IDS.map((b) => [
                    <th key={`${b}-1`} className={blk(b, "h-vert h-reja t-red")}><span>Режа</span></th>,
                    <th key={`${b}-2`} className={blk(b, "h-vert h-bajar t-blue")}><span>Бажарилиши</span></th>,
                    <th key={`${b}-3`} className={blk(b, "h-pct")}>%</th>,
                    <th key={`${b}-4`} className={blk(b, "h-vert h-farq")}><span>Фарқи</span></th>,
                    <th key={`${b}-5`} className={blk(b, "h-vert h-ort")}><span>Ўртача кунлик</span></th>,
                    <th key={`${b}-6`} className={blk(b, "h-vert h-kunreja t-red")}><span>1 кунлик режа</span></th>,
                    ...data.week.map((d) => (
                      <th key={`${b}-${d}`} className={blk(b, "h-vert h-day t-red")}><span>{dmy(d)}</span></th>
                    )),
                    <th key={`${b}-7`} className={blk(b, "h-pct")}>%</th>,
                  ])}
                  <th className="h-vert blk-other blk-start"><span>Жараёнда</span></th>
                  <th className="h-vert blk-other"><span>Рад этилган</span></th>
                </tr>
              </thead>
              <tbody>
                {data.total && <Row row={data.total} total scales={scales} />}
                {data.rows.map((r) => <Row key={r.n} row={r} scales={scales} />)}
              </tbody>
            </table>
          </div>
          <div className="m-cards xt-cards">
            {data.total && <RowCard row={data.total} total week={data.week} month={data.month} scales={scales} />}
            {data.rows.map((r) => <RowCard key={r.n} row={r} week={data.week} month={data.month} scales={scales} />)}
          </div>
        </div>
      )}
    </div>
  );
}

type Scales = Record<BlockId, { oy: ReturnType<typeof pctScale>; hafta: ReturnType<typeof pctScale> }>;

function Row({ row, total, scales }: { row: XatlovRow; total?: boolean; scales: Scales }) {
  return (
    <tr className={total ? "xt-total" : undefined}>
      <td className="sticky-n">{total ? "" : row.n}</td>
      <td className="sticky-name">{row.name}</td>
      {BLOCK_IDS.map((b) => <BlockCells key={b} b={b} k={row[b]} scale={scales[b]} />)}
      <td className="c-soft blk-start">{row.jarayon}</td>
      <td className="c-soft">{row.rad}</td>
      <td>{row.muhandis}</td>
    </tr>
  );
}

function BlockCells({ b, k, scale }: { b: BlockId; k: XatlovBlock; scale: Scales[BlockId] }) {
  const kunReja = k.kunRejaNum;
  const farq = parseNum(k.farq);
  return (
    <>
      <td className={blk(b, "c-jami", true)}>{k.jami}</td>
      <td className={blk(b, "c-reja")}>{k.reja}</td>
      <td className={blk(b, "c-bajar")}>{k.bajar}</td>
      <td className={blk(b, "c-pct")} style={{ background: scale.oy(pctVal(k.pct)) }}>{k.pct || "–"}</td>
      <td className={blk(b, `c-farq${farq < 0 ? " is-neg" : ""}`)}>{k.farq}</td>
      <td className={blk(b, "c-ort")}>{k.ortacha}</td>
      <td className={blk(b, "c-reja")}>{k.haftaReja}</td>
      <td className={blk(b, "c-hafta")}>{fmt(k.hafta)}</td>
      <td className={blk(b, "c-kunreja")}>{k.kunReja}</td>
      {k.days.map((v, i) => (
        // Kunlik reja bajarilmagan — qizil
        <td key={i} className={blk(b, `c-day${v != null && v < kunReja ? " is-low" : ""}${v == null ? " is-empty" : ""}`)}>{v == null ? "–" : fmt(v)}</td>
      ))}
      <td className={blk(b, "c-pct")} style={{ background: scale.hafta(k.haftaPct) }}>{pctText(k.haftaPct)}</td>
    </>
  );
}

/** Telefon ko'rinishi: hudud kartasi — har bir blok (oy · hafta · kunlar) va jarayon ko'rsatkichlari */
function RowCard({ row, total, week, month, scales }: { row: XatlovRow; total?: boolean; week: string[]; month: string; scales: Scales }) {
  return (
    <article className={`xt-card${total ? " is-total" : ""}`}>
      <header className="xt-card-head">
        {!total && <span className="xt-card-n">{row.n}</span>}
        <h3>{row.name}</h3>
      </header>
      {BLOCK_IDS.map((b) => {
        const k = row[b];
        const farq = parseNum(k.farq);
        return (
          <section key={b} className={`xt-card-block blk-${b}`}>
            <h4>
              <span><i className={BLOCK_ICON[b]} /> {BLOCK_TITLE[b]}</span>
              <small>{JAMI_LABEL[b]}: <b>{k.jami || "–"}</b></small>
            </h4>
            <div className="xt-card-label">{month}</div>
            <div className="xt-stats">
              <div><span>Режа</span><b className="t-red">{k.reja || "–"}</b></div>
              <div><span>Бажарилиши</span><b className="t-blue">{k.bajar || "–"}</b></div>
              <div className="is-pct" style={{ background: scales[b].oy(pctVal(k.pct)) }}><span>%</span><b>{k.pct || "–"}</b></div>
              <div><span>Фарқи</span><b className={farq < 0 ? "t-red" : undefined}>{k.farq || "–"}</b></div>
              <div><span>Ўртача кунлик</span><b>{k.ortacha || "–"}</b></div>
            </div>
            <div className="xt-card-label">Ҳафта</div>
            <div className="xt-stats">
              <div><span>Ҳафталик режа</span><b className="t-red">{k.haftaReja || "–"}</b></div>
              <div><span>1 ҳафтада</span><b>{fmt(k.hafta)}</b></div>
              <div><span>1 кунлик режа</span><b className="t-red">{k.kunReja || "–"}</b></div>
              <div className="is-pct" style={{ background: scales[b].hafta(k.haftaPct) }}><span>%</span><b>{pctText(k.haftaPct)}</b></div>
            </div>
            <div className="xt-days">
              {k.days.map((v, i) => (
                <div key={i} className={v != null && v < k.kunRejaNum ? "is-low" : v == null ? "is-empty" : undefined}>
                  <span>{dmy(week[i]).slice(0, 5)}</span>
                  <b>{v == null ? "–" : fmt(v)}</b>
                </div>
              ))}
            </div>
          </section>
        );
      })}
      <footer className="xt-card-foot">
        <div><span>Жараёнда</span><b>{row.jarayon || "–"}</b></div>
        <div><span>Рад этилган</span><b>{row.rad || "–"}</b></div>
        <div><span>Кадастр муҳандиси</span><b>{row.muhandis || "–"}</b></div>
      </footer>
    </article>
  );
}
