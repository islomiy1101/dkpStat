"use client";

import { useMemo, useRef, useState } from "react";
import { useSection } from "@/components/DataProvider";
import { downloadBlob, fmtDate, fmtHM } from "@/lib/useClock";
import { parseNum } from "@/features/etirof/config";
import { BLOCK_IDS, dmy, pctScale, type BlockId, type XatlovBlock, type XatlovRow } from "./config";

/**
 * "Xatlov+Faol" — ЎРҚ-937 ШТАБ маълумоти (sheet'dagi ko'rinishda).
 * Kunlik qiymat 1 kunlik rejadan kam bo'lsa — qizil; foizlar — 3 rangli shkala (≥100% yashil).
 * "Rasm" — hisobot kartasi PNG, "Chop etish" — A4 albom (styles/xatlov.css → @media print).
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
  const [capturing, setCapturing] = useState(false);
  const [busyImg, setBusyImg] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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

  const saveImage = async () => {
    const el = reportRef.current;
    if (!el) return;
    setBusyImg(true);
    setCapturing(true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false, windowWidth: 2100 });
      canvas.toBlob((b) => b && downloadBlob(b, `Xatlov_Faol_${fmtDate(new Date())}.png`), "image/png");
    } catch (e) {
      console.error("Rasm xatolik:", e);
      setNotice("Rasmni saqlab bo'lmadi.");
    } finally {
      setCapturing(false);
      setBusyImg(false);
    }
  };

  const error = !data ? slot.error : null;

  return (
    <div className="sec-xatlov">
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
        <div className="xt-actions">
          <button className="xt-btn" onClick={() => slot.refresh(true)} disabled={slot.refreshing} title="Google Sheets'dan qayta o'qish">
            <i className={`fa-solid fa-rotate${slot.refreshing ? " fa-spin" : ""}`} /> <span>Yangilash</span>
          </button>
          <button className="xt-btn" onClick={saveImage} disabled={!data || busyImg} title="Jadvalni rasm (PNG) sifatida yuklab olish">
            <i className={`fa-solid ${busyImg ? "fa-spinner fa-spin" : "fa-image"}`} /> <span>Rasm</span>
          </button>
          <button className="xt-btn xt-btn-primary" onClick={() => window.print()} disabled={!data} title="Chop etish (A4 albom)">
            <i className="fa-solid fa-print" /> <span>Chop etish</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="xt-alert" role="alert">
          <i className="fa-solid fa-circle-exclamation" /> Ma&apos;lumotni olib bo&apos;lmadi: {error}
        </div>
      )}
      {notice && (
        <div className="xt-alert is-info" role="status" onClick={() => setNotice(null)}>
          <i className="fa-solid fa-circle-info" /> {notice}
        </div>
      )}
      {!data && !error && <div className="xt-loading"><i className="fa-solid fa-spinner fa-spin" /> Yuklanmoqda…</div>}

      {data && (
        <div ref={reportRef} className={`xt-report${capturing ? " capturing" : ""}`}>
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
