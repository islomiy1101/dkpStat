"use client";

import { useMemo, type ReactNode } from "react";
import type { Murojaat } from "@/lib/types";
import { PERIODS, WEEKDAYS, periodBounds, periodLabel as rangeLabel, type DateRange, type Period } from "@/lib/analytics";
import RangeFilter from "@/components/analytics/RangeFilter";
import {
  AreaTrend, BarList, ChartCard, Heatmap, SegmentLegend, ShareBar, StackedBarList, StatTile, fmtMin, fmtPct,
} from "@/components/analytics/charts";
import { NATIJA_SEGMENTS, SHAXS_SEGMENTS, buildAdviceStats } from "./analytics";
import { TUMANLAR } from "./utils";

/**
 * "Maslahat burchagi" — viloyat analitika paneli (headOfDepartment, superadmin).
 * Hamma ko'rsatkich davr va tuman filtridan o'tgan murojaatlardan hisoblanadi (bir kunda takrorlangan
 * fuqaro bir marta — getLatestDailyAppeals); hisobot tugmalari (actions, AdviceView'dan) ham shu filtrga bo'ysunadi.
 */
export default function AdviceDashboard({ scoped, today, period, onPeriod, range, onRange, tuman, onTuman, totalAll, actions }: {
  scoped: Murojaat[];
  today: string;
  period: Period;
  onPeriod: (p: Period) => void;
  /** Ixtiyoriy sana oralig'i (period === "custom" bo'lganda) */
  range: DateRange;
  onRange: (r: DateRange) => void;
  tuman: string;
  onTuman: (t: string) => void;
  totalAll: number;
  /** Hisobot tugmalari — filtr qatorining o'ng tomonida */
  actions?: ReactNode;
}) {
  const { start, end } = periodBounds(period, today, range);
  const s = useMemo(() => buildAdviceStats(scoped, today, start, end), [scoped, today, start, end]);
  const spark = s.daily.slice(-14).map((d) => d.count);
  const dayDelta = s.today - s.yesterday;
  const pickTuman = (t: string) => onTuman(tuman === t ? "" : t);
  const peak = s.heat.peak;
  const periodLabel = rangeLabel(period, range);
  const pct = (n: number) => (s.total ? fmtPct(n / s.total) : "—");

  return (
    <div className="rc-dash">
      {/* Pechat: filtrlar o'rniga qisqa ma'lumot qatori */}
      <div className="rc-print-only rc-print-meta">
        <span>Davr: <b>{periodLabel}</b></span>
        <span>Hudud: <b>{tuman || "Viloyat bo'yicha"}</b></span>
        <span>Murojaatlar: <b>{s.total}</b> / {totalAll}</span>
      </div>
      {/* FILTRLAR */}
      <div className="rc-filters">
        <div className="rc-chips" role="group" aria-label="Davr">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" className={`rc-chip${period === p.id ? " active" : ""}`} onClick={() => onPeriod(p.id)}>
              {period === p.id && <i className="fa-solid fa-check" aria-hidden />} {p.label}
            </button>
          ))}
        </div>
        <RangeFilter range={range} onRange={onRange} today={today} active={period === "custom"} />
        <select className="rc-select" value={tuman} onChange={(e) => onTuman(e.target.value)} aria-label="Tuman">
          <option value="">Barcha tumanlar</option>
          {TUMANLAR.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        {(tuman || period !== "30") && (
          <button type="button" className="rc-clear no-print" data-html2canvas-ignore onClick={() => { onTuman(""); onPeriod("30"); }}>
            <i className="fa-solid fa-xmark" aria-hidden /> Tozalash
          </button>
        )}
        <span className="rc-filters-info" title={`${tuman || "Viloyat bo'yicha"} · ${periodLabel.toLowerCase()}`}>
          <b>{s.total}</b> / {totalAll} ta murojaat
        </span>
        {actions && (
          <div className="rc-actions no-print" data-html2canvas-ignore>
            <span className="rc-actions-label"><i className="fa-solid fa-file-excel" aria-hidden /> Hisobot:</span>
            {actions}
          </div>
        )}
      </div>

      {/* KPI */}
      <div className="rc-kpis">
        <StatTile icon="fa-solid fa-users" label="Jami murojaat" value={String(s.total)} note={`${s.activeDays} faol kunda`} spark={spark} />
        <StatTile icon="fa-solid fa-calendar-day" label="Bugun" value={String(s.today)}
          delta={{ value: dayDelta, label: `${dayDelta > 0 ? "+" : ""}${dayDelta} kechaga nisbatan` }} />
        <StatTile icon="fa-solid fa-circle-check" label="Ijobiy hal etildi" value={String(s.natija.ijobiy)} note={`${pct(s.natija.ijobiy)} murojaatlar`} />
        <StatTile icon="fa-solid fa-share-from-square" label="Filialga yo'naltirildi" value={String(s.natija.filial)} note={`${pct(s.natija.filial)} murojaatlar`} />
        <StatTile icon="fa-solid fa-ban" label="Vakolatiga kirmaydi" value={String(s.natija.vakolatsiz)}
          note={s.natija.kutilmoqda ? `${pct(s.natija.vakolatsiz)} · ${s.natija.kutilmoqda} ta chora ko'rilmagan` : `${pct(s.natija.vakolatsiz)} murojaatlar`} />
        <StatTile icon="fa-solid fa-stopwatch" label="O'rtacha qabul vaqti" value={s.avgMin === null ? "—" : String(Math.round(s.avgMin))} unit={s.avgMin === null ? undefined : "daq"} note="keldi → ketdi" />
      </div>

      {/* DINAMIKA — pechatga tushmaydi */}
      <div className="rc-row rc-row-trend" data-print-skip>
        <ChartCard title="Kunlik murojaatlar dinamikasi" sub={`${s.daily.length} kun · eng ko'p: ${Math.max(0, ...s.daily.map((d) => d.count))} ta bir kunda`}>
          <AreaTrend points={s.daily} />
        </ChartCard>
        <ChartCard title="Eng gavjum vaqtlar" sub={peak ? <>Eng ko&apos;p: <b>{WEEKDAYS[peak.day]}, {peak.hour}:00–{peak.hour + 1}:00</b> ({peak.count} ta)</> : "Keldi vaqti bo'yicha"}>
          <Heatmap hours={s.heat.hours} cells={s.heat.cells} max={s.heat.max} />
        </ChartCard>
      </div>

      {/* NATIJALAR */}
      <div className="rc-row rc-row-staff">
        <ChartCard title="Tumanlar kesimida ko'rilgan choralar" sub="Bosing — barcha ko'rsatkichlar shu tuman bo'yicha"
          right={tuman ? <button type="button" className="rc-mini-btn" onClick={() => onTuman("")}>Barchasi</button> : undefined}>
          <SegmentLegend segments={NATIJA_SEGMENTS} />
          <StackedBarList rows={s.tumanNatija} segments={NATIJA_SEGMENTS} onPick={pickTuman} active={tuman || undefined} />
        </ChartCard>

        <ChartCard title="Natijalar taqsimoti" sub={tuman || "Viloyat bo'yicha"}>
          <ShareBar segments={NATIJA_SEGMENTS} values={s.natija} />
          <div className="rc-subsection">
            <h5>Murojaatchi turi</h5>
            <ShareBar segments={SHAXS_SEGMENTS} values={s.shaxs} />
          </div>
          <div className="rc-subsection">
            <h5>Tumanlar bo&apos;yicha o&apos;rtacha qabul vaqti</h5>
            <BarList
              rows={s.tumanlar.filter((t) => t.avgMin !== null).sort((a, b) => (b.avgMin || 0) - (a.avgMin || 0)).slice(0, 6).map((t) => ({
                key: t.name, label: t.name, value: Math.round(t.avgMin || 0), right: fmtMin(t.avgMin),
              }))}
              shade={false}
            />
            {s.ketdiYoq > 0 && (
              <div className="rc-quality-note" style={{ marginTop: 10 }}>
                <i className="fa-solid fa-circle-info" aria-hidden />
                <span><b>{s.ketdiYoq}</b> ta murojaatda ketish vaqti belgilanmagan</span>
              </div>
            )}
          </div>
        </ChartCard>
      </div>

      {/* TURLAR · MAHALLALAR — pechatda 2-sahifa */}
      <div className="rc-print-page" data-print-page="2">
      <div className="rc-print-only rc-print-cont">
        <b>Maslahat burchagi</b> — hisobot davomi · {tuman || "Viloyat bo'yicha"} · {periodLabel}
        <span>2 / 2</span>
      </div>
      <div className="rc-row rc-row-2">
        <ChartCard title="Murojaat turlari" sub="Kelishdan maqsad matni bo'yicha turkumlangan">
          <BarList
            rows={s.turlar.map((t) => ({
              key: t.name, label: t.name, value: t.count,
              right: <><b>{t.count}</b> <small>{fmtPct(t.share)}</small></>,
              tipExtra: <span>Ulushi: <b>{fmtPct(t.share)}</b></span>,
            }))}
          />
          {s.topMaqsad.length > 0 && (
            <div className="rc-subsection">
              <h5>Eng ko&apos;p yozilgan maqsadlar</h5>
              <ol className="rc-toplist">
                {s.topMaqsad.map((m) => (
                  <li key={m.name}><span title={m.name}>{m.name}</span><b>{m.count}</b></li>
                ))}
              </ol>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Mahallalar kesimida — top 15" sub={<>Jami <b>{s.mahallaCount}</b> ta mahalladan murojaat kelgan</>}>
          <BarList
            rows={s.mahallalar.map((m) => ({
              key: `${m.tuman}|${m.name}`, label: m.name, tag: tuman ? undefined : m.tuman.replace(/ tumani$/, ""), value: m.count,
              tipExtra: <span>Ulushi: <b>{fmtPct(m.share)}</b></span>,
            }))}
            emptyText="Manzil (MFY) kiritilmagan"
          />
        </ChartCard>
      </div>
      </div>
    </div>
  );
}
