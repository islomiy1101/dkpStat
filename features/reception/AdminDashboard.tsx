"use client";

import { useMemo, type ReactNode } from "react";
import { TUMANLAR } from "@/features/advice/utils";
import type { ReceptionMurojaat } from "@/lib/types";
import { AreaTrend, BarList, ChartCard, Heatmap, Meter, StatTile, ACCENT, fmtMin, fmtPct } from "@/components/analytics/charts";
import { PERIODS, WEEKDAYS, buildStats, periodBounds, periodLabel as rangeLabel, type DateRange, type Period } from "./stats";
import RangeFilter from "@/components/analytics/RangeFilter";

/**
 * "Filial qabulxonasi" — viloyat analitika paneli (headOfDepartment, superadmin).
 * Hamma ko'rsatkich davr va tuman filtridan o'tgan murojaatlardan hisoblanadi;
 * hisobot tugmalari (actions, ReceptionView'dan) ham xuddi shu filtrga bo'ysunadi.
 * fixedTuman — filial rahbari: ma'lumot faqat o'z tumani, tuman tanlash va tumanlar kesimi yo'q.
 */
export default function AdminDashboard({ scoped, today, period, onPeriod, range, onRange, tuman, onTuman, fixedTuman, totalAll, actions }: {
  scoped: ReceptionMurojaat[];
  today: string;
  period: Period;
  onPeriod: (p: Period) => void;
  /** Ixtiyoriy sana oralig'i (period === "custom" bo'lganda) */
  range: DateRange;
  onRange: (r: DateRange) => void;
  tuman: string;
  onTuman: (t: string) => void;
  fixedTuman?: string;
  totalAll: number;
  /** Hisobot tugmalari — filtr qatorining o'ng tomonida */
  actions?: ReactNode;
}) {
  const { start, end } = periodBounds(period, today, range);
  const s = useMemo(() => buildStats(scoped, today, start, end), [scoped, today, start, end]);
  const spark = s.daily.slice(-14).map((d) => d.count);
  const dayDelta = s.today - s.yesterday;
  const pickTuman = (t: string) => onTuman(tuman === t ? "" : t);
  const peak = s.heat.peak;
  const periodLabel = rangeLabel(period, range);
  const hudud = fixedTuman || tuman || "Viloyat bo'yicha";

  return (
    <div className="rc-dash">
      {/* Pechat: filtrlar o'rniga qisqa ma'lumot qatori */}
      <div className="rc-print-only rc-print-meta">
        <span>Davr: <b>{periodLabel}</b></span>
        <span>Hudud: <b>{hudud}</b></span>
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
        {!fixedTuman && (
          <select className="rc-select" value={tuman} onChange={(e) => onTuman(e.target.value)} aria-label="Tuman">
            <option value="">Barcha tumanlar</option>
            {TUMANLAR.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {(tuman || period !== "30") && (
          <button type="button" className="rc-clear no-print" data-html2canvas-ignore onClick={() => { onTuman(""); onPeriod("30"); }}>
            <i className="fa-solid fa-xmark" aria-hidden /> Tozalash
          </button>
        )}
        <span className="rc-filters-info" title={`${hudud} · ${periodLabel.toLowerCase()}`}>
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
        <StatTile icon="fa-solid fa-chart-simple" label="O'rtacha kunlik" value={s.avgDaily.toFixed(1)} note="murojaat / faol kun" />
        <StatTile icon="fa-solid fa-stopwatch" label="O'rtacha qabul vaqti" value={s.avgMin === null ? "—" : String(Math.round(s.avgMin))} unit={s.avgMin === null ? undefined : "daq"} note="keldi → ketdi" />
        <StatTile icon="fa-solid fa-person-walking-arrow-right" label="Hozir qabulda" value={String(s.qabulda)} note="bugun kelib, ketmagan" />
        <StatTile icon="fa-solid fa-rotate-left" label="Qayta murojaat" value={String(s.qayta)} note={s.total ? `${fmtPct(s.qayta / s.total)} murojaatlar` : undefined} />
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

      {/* TUMANLAR · TURLAR · MAHALLALAR */}
      <div className={fixedTuman ? "rc-row rc-row-2" : "rc-row rc-row-3"}>
        {!fixedTuman && (
          <ChartCard title="Tumanlar kesimida" sub="Bosing — barcha ko'rsatkichlar shu tuman bo'yicha"
            right={tuman ? <button type="button" className="rc-mini-btn" onClick={() => onTuman("")}>Barchasi</button> : undefined}>
            <BarList
              rows={s.tumanlar.map((t) => ({
                key: t.name, label: t.name, value: t.count,
                right: <><b>{t.count}</b> <small>{fmtPct(t.share)}</small></>,
                tipExtra: <><span>Ulushi: <b>{fmtPct(t.share)}</b></span><span>O&apos;rtacha qabul: <b>{fmtMin(t.avgMin)}</b></span></>,
              }))}
              onPick={pickTuman}
              active={tuman || undefined}
            />
          </ChartCard>
        )}

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
                  <li key={m.name}><span>{m.name}</span><b>{m.count}</b></li>
                ))}
              </ol>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Mahallalar kesimida — top 15" sub={<>Jami <b>{s.mahallaCount}</b> ta mahalladan murojaat kelgan</>}>
          <BarList
            rows={s.mahallalar.map((m) => ({
              key: `${m.tuman}|${m.name}`, label: m.name, tag: tuman || fixedTuman ? undefined : m.tuman.replace(/ tumani$/, ""), value: m.count,
              tipExtra: <span>Ulushi: <b>{fmtPct(m.share)}</b></span>,
            }))}
            emptyText="Manzil (MFY) kiritilmagan"
          />
        </ChartCard>
      </div>

      {/* XODIMLAR · SIFAT — pechatda 2-sahifa */}
      <div className="rc-print-page" data-print-page="2">
      <div className="rc-print-only rc-print-cont">
        <b>Filial qabulxonasi</b> — hisobot davomi · {hudud} · {periodLabel}
        <span>2 / 2</span>
      </div>
      <div className="rc-row rc-row-staff">
        <ChartCard title="Xodimlar reytingi — top 10" sub="Eng ko'p fuqaro qabul qilgan xodimlar">
          {s.xodimlar.length === 0 ? (
            <div className="rc-empty">Ma&apos;lumot yo&apos;q</div>
          ) : (
            <div className="rc-staff-wrap">
              <table className="rc-staff">
                <thead>
                  <tr><th>#</th><th>Xodim</th>{!fixedTuman && <th>Tuman</th>}<th className="num">Qabul</th><th className="num">O&apos;rtacha vaqt</th></tr>
                </thead>
                <tbody>
                  {s.xodimlar.map((x, i) => (
                    <tr key={`${x.tuman}|${x.fio}`}>
                      <td className="rc-rank">{i + 1}</td>
                      <td><b>{x.fio}</b><small>{x.lavozim}</small></td>
                      {!fixedTuman && <td>{x.tuman}</td>}
                      <td className="num">
                        <span className="rc-inline-meter"><span style={{ width: `${(x.count / s.xodimlar[0].count) * 100}%` }} /></span>
                        <b>{x.count}</b>
                      </td>
                      <td className="num">{fmtMin(x.avgMin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Ma'lumot sifati" sub="Qabulxonada to'ldirilgan maydonlar">
          <div className="rc-quality">
            <Meter label="Passport kiritilgan" value={s.sifat.passport} tone={ACCENT} />
            <Meter label="Passport o'rniga telefon" value={s.sifat.telefon} tone="#86b6ef" />
            <Meter label="Passport kiritilmagan" value={s.sifat.bosh} tone="#c3c2b7" />
            <div className="rc-quality-note">
              <i className="fa-solid fa-circle-info" aria-hidden />
              <span><b>{s.sifat.ketdiYoq}</b> ta murojaatda ketish vaqti belgilanmagan</span>
            </div>
          </div>
        </ChartCard>
      </div>
      </div>
    </div>
  );
}
