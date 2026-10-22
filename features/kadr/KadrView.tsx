"use client";

import { Fragment, useCallback, useMemo, useRef, useState } from "react";
import { useSection } from "@/components/DataProvider";
import ReportActions from "@/components/ReportActions";
import PageLoader from "@/components/PageLoader";
import { fmtDate } from "@/lib/useClock";
import { useReportCapture } from "@/lib/useReportCapture";
import { buildKadrStats, fmtKadr, fmtRate, rateTone, type KadrAgg, type KadrFilial } from "./model";
import { exportKadrExcel } from "./excel";

/**
 * "Kadrlar statistikasi" — kirgandan keyin ochiladigan sahifa (superadmin, bo'lim boshlig'i, filial rahbari).
 * Viloyat doirasida: KPI, filiallar jadvali (vakant lavozimlar ustunlari; bosilsa — bo'limlar → lavozimlar), toifalar.
 * Filial rahbari — faqat o'z filiali. Ma'lumot: Bazaga yuklash → "Shtat" varag'i (features/kadr/model.ts).
 */
type SortKey = "name" | "shtat" | "band" | "vakant" | "rate";

const shortName = (s: string) => s.replace(/\s+filiali$/i, "");

function RateBar({ rate }: { rate: number }) {
  return (
    <span className={`kd-rate tone-${rateTone(rate)}`}>
      <span className="kd-rate-track"><i style={{ width: `${Math.min(100, rate * 100)}%` }} /></span>
      <b>{fmtRate(rate)}</b>
    </span>
  );
}

function Kpis({ a }: { a: KadrAgg }) {
  return (
    <section className="kd-kpis">
      <div className="kd-kpi c-blue">
        <span className="kd-kpi-icon"><i className="fa-solid fa-sitemap" /></span>
        <span><small>Shtat birligi</small><b>{fmtKadr(a.shtat)}</b></span>
      </div>
      <div className="kd-kpi c-green">
        <span className="kd-kpi-icon"><i className="fa-solid fa-user-check" /></span>
        <span><small>Band (xodimlar)</small><b>{fmtKadr(a.band)}</b></span>
      </div>
      <div className="kd-kpi c-red">
        <span className="kd-kpi-icon"><i className="fa-solid fa-user-plus" /></span>
        <span><small>Vakant</small><b>{fmtKadr(a.vakant)}</b></span>
      </div>
      <div className={`kd-kpi c-rate tone-${rateTone(a.rate)}`}>
        <span className="kd-kpi-icon"><i className="fa-solid fa-chart-pie" /></span>
        <span className="kd-kpi-rate">
          <small>To&apos;lganlik</small>
          <b>{fmtRate(a.rate)}</b>
          <span className="kd-progress"><i style={{ width: `${Math.min(100, a.rate * 100)}%` }} /></span>
        </span>
      </div>
    </section>
  );
}

/** Jadvalning oxirgi o'zgarish vaqti (Google Sheets versiyalar tarixi) — karta sarlavhasining o'ng tomonida */
function Updated({ at }: { at?: string }) {
  if (!at) return null;
  return <span className="kd-updated"><i className="fa-solid fa-clock-rotate-left" /> Oxirgi o&apos;zgarish: <b>{at}</b></span>;
}

/** Filialning bo'limlari va lavozimlari; onlyVakant — faqat vakanti bor bo'lim va lavozimlar */
function FilialDetail({ f, onClose, onlyVakant, updated }: { f: KadrFilial; onClose?: () => void; onlyVakant?: boolean; updated?: string }) {
  const bolimlar = onlyVakant
    ? f.bolimlar.filter((b) => b.vakant > 0).map((b) => ({ ...b, positions: b.positions.filter((p) => p.vakant > 0) }))
    : f.bolimlar;
  return (
    <section className="kd-card">
      <div className="kd-card-head">
        <div>
          <h3><i className="fa-solid fa-building" /> {f.name}</h3>
          <span>
            {onlyVakant ? "Vakant lavozimlar" : "Bo'limlar va lavozimlar kesimida"} · shtat {fmtKadr(f.shtat)}, band {fmtKadr(f.band)}, vakant {fmtKadr(f.vakant)}
          </span>
        </div>
        <Updated at={updated} />
        {onClose && <button type="button" className="kd-x" onClick={onClose} aria-label="Yopish" data-html2canvas-ignore><i className="fa-solid fa-xmark" /></button>}
      </div>
      {!bolimlar.length ? (
        <p className="kd-muted">Vakant o&apos;rinlar yo&apos;q</p>
      ) : (
        <div className="kd-table-wrap">
          <table className="kd-table kd-detail">
            <thead>
              <tr><th>Bo&apos;lim / lavozim</th><th className="num">Shtat</th><th className="num">Band</th><th className="num">Vakant</th><th>To&apos;lganlik</th></tr>
            </thead>
            <tbody>
              {bolimlar.map((b) => (
                <Fragment key={b.name}>
                  <tr className="kd-bolim">
                    <td data-label=""><i className="fa-solid fa-folder-open" /> {b.name}</td>
                    <td className="num" data-label="Shtat">{fmtKadr(b.shtat)}</td>
                    <td className="num" data-label="Band">{fmtKadr(b.band)}</td>
                    <td className={`num${b.vakant ? " is-vakant" : ""}`} data-label="Vakant">{fmtKadr(b.vakant)}</td>
                    <td data-label="To'lganlik"><RateBar rate={b.rate} /></td>
                  </tr>
                  {b.positions.map((p, i) => (
                    <tr key={i} className="kd-pos">
                      <td data-label="">{p.lavozim}{p.toifa && <small>{p.toifa}</small>}</td>
                      <td className="num" data-label="Shtat">{fmtKadr(p.shtat)}</td>
                      <td className="num" data-label="Band">{fmtKadr(p.band)}</td>
                      <td className={`num${p.vakant ? " is-vakant" : ""}`} data-label="Vakant">{fmtKadr(p.vakant)}</td>
                      <td data-label="To'lganlik"><RateBar rate={p.shtat ? p.band / p.shtat : 0} /></td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function KadrView({ canUpload }: { canUpload: boolean }) {
  const slot = useSection("kadr");
  const data = slot.data;
  const stats = useMemo(() => (data && data.rows.length ? buildKadrStats(data.rows) : null), [data]);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [picked, setPicked] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const fileName = useCallback(() => `Kadrlar_statistikasi_${fmtDate(new Date())}.png`, []);
  const cap = useReportCapture(reportRef, { fileName, windowWidth: 1400, background: "#f1f5f9" });
  const [excelBusy, setExcelBusy] = useState(false);

  const regional = data?.scope === "region";
  // Ma'lumot holati — jadvalning oxirgi o'zgarishi (sahifa, karta va Excel'da bir xil)
  const holat = data?.updatedAt || data?.uploadedAt || "";
  const filials = useMemo(() => {
    if (!stats) return [];
    const list = [...stats.filials];
    const key = sort.key;
    if (key !== "name") list.sort((a, b) => (a[key] - b[key]) * sort.dir);
    else if (sort.dir === -1) list.reverse();
    return list;
  }, [stats, sort]);
  const pickedFilial = stats?.filials.find((f) => f.name === picked) ?? null;
  const sortBy = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "name" ? 1 : -1 }));
  /** Jadval Excel'ga — sahifadagi saralash tartibida */
  const saveExcel = async () => {
    if (!stats || !data) return;
    setExcelBusy(true);
    try {
      await exportKadrExcel(stats, { filials, regional, branch: data.branch, uploadedAt: holat });
    } catch (e) {
      alert("Excel faylni tayyorlab bo'lmadi: " + (e as Error).message);
    } finally {
      setExcelBusy(false);
    }
  };
  const arrow = (key: SortKey) => (sort.key === key ? <i className={`fa-solid fa-arrow-${sort.dir === 1 ? "up" : "down"}`} /> : null);

  return (
    <div className="sec-kadr print-page">
      <header className="kd-header">
        <div className="kd-title">
          <div className="kd-badge"><i className="fa-solid fa-people-group" /></div>
          <div>
            <h2>Kadrlar statistikasi</h2>
            <span>
              {regional ? "Viloyat bo'yicha" : data?.branch || "Filial"} · shtat, xodimlar va vakantlar
              {holat ? ` · ma'lumot holati: ${holat}` : ""}
            </span>
          </div>
        </div>
        <ReportActions onRefresh={() => slot.refresh(true)} refreshing={slot.refreshing} onExcel={saveExcel} excelBusy={excelBusy}
          onImage={cap.saveImage} imageBusy={cap.busy} onPrint={cap.print} disabled={!stats} hidden={cap.capturing} />
      </header>

      {slot.error && !data && (
        <div className="kd-alert"><i className="fa-solid fa-circle-exclamation" /> Ma&apos;lumotni olib bo&apos;lmadi: {slot.error}</div>
      )}
      {!data && !slot.error && <PageLoader />}

      {data && !stats && (
        <div className="kd-empty">
          <i className="fa-solid fa-people-group" />
          <h3>{regional ? "Kadrlar ma'lumoti hali yuklanmagan" : "Filialingiz bo'yicha kadrlar ma'lumoti topilmadi"}</h3>
          <p>
            {regional
              ? "Kadrlar bo'limi tayyorlagan shtat jadvali (Excel) \"Bazaga yuklash\" sahifasidan yuklangach, statistika shu yerda chiqadi."
              : `Shtat jadvalida "${data.branch}" filiali uchun qatorlar yo'q. Kadrlar bo'limiga murojaat qiling.`}
          </p>
          {canUpload && <a href="/upload" className="kd-btn"><i className="fa-solid fa-file-arrow-up" /> Bazaga yuklash</a>}
        </div>
      )}

      {stats && (
        <div ref={reportRef} className={`kd-report print-fit${cap.capturing ? " capturing" : ""}`}>
          <Kpis a={stats.total} />

          {regional ? (
            <>
              <section className="kd-card">
                <div className="kd-card-head">
                  <div>
                    <h3><i className="fa-solid fa-table-list" /> Filiallar kesimida</h3>
                    <span>Vakant ustunidan keyin — qaysi lavozimga nechta xodim kerak · filial nomini bosing — vakant lavozimlar ochiladi</span>
                  </div>
                  <Updated at={holat} />
                </div>
                <div className="kd-table-wrap">
                  <table className="kd-table kd-filials">
                    <thead>
                      <tr>
                        <th className="sortable" onClick={() => sortBy("name")}>Filial {arrow("name")}</th>
                        <th className="num sortable" onClick={() => sortBy("shtat")}>Shtat {arrow("shtat")}</th>
                        <th className="num sortable" onClick={() => sortBy("band")}>Band {arrow("band")}</th>
                        <th className="num sortable" onClick={() => sortBy("vakant")}>Vakant {arrow("vakant")}</th>
                        {stats.vakantLavozimlar.map((l) => <th key={l} className="num kd-lav" title={l}>{l}</th>)}
                        <th className="sortable" onClick={() => sortBy("rate")}>To&apos;lganlik {arrow("rate")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="kd-total">
                        <td data-label="">Viloyat jami</td>
                        <td className="num" data-label="Shtat">{fmtKadr(stats.total.shtat)}</td>
                        <td className="num" data-label="Band">{fmtKadr(stats.total.band)}</td>
                        <td className="num" data-label="Vakant">{fmtKadr(stats.total.vakant)}</td>
                        {stats.vakantLavozimlar.map((l) => <td key={l} className="num kd-lav" data-label={l}>{fmtKadr(stats.vakantBy[l])}</td>)}
                        <td data-label="To'lganlik"><RateBar rate={stats.total.rate} /></td>
                      </tr>
                      {filials.map((f) => (
                        <tr key={f.name} className={`kd-row${picked === f.name ? " active" : ""}`} onClick={() => setPicked(picked === f.name ? null : f.name)}>
                          <td data-label=""><button type="button" className="kd-link">{f.name}</button></td>
                          <td className="num" data-label="Shtat">{fmtKadr(f.shtat)}</td>
                          <td className="num" data-label="Band">{fmtKadr(f.band)}</td>
                          <td className={`num${f.vakant ? " is-vakant" : ""}`} data-label="Vakant">{fmtKadr(f.vakant)}</td>
                          {stats.vakantLavozimlar.map((l) => (
                            <td key={l} className="num kd-lav is-vakant" data-label={l}>{f.vakantBy[l] ? fmtKadr(f.vakantBy[l]) : ""}</td>
                          ))}
                          <td data-label="To'lganlik"><RateBar rate={f.rate} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {pickedFilial && <FilialDetail f={pickedFilial} onClose={() => setPicked(null)} onlyVakant />}
            </>
          ) : (
            stats.filials.map((f) => <FilialDetail key={f.name} f={f} updated={holat} />)
          )}

          <div className="kd-pair">
            {stats.topVakant.length > 0 && (
              <section className="kd-card">
                <div className="kd-card-head"><div><h3><i className="fa-solid fa-briefcase" /> Eng ko&apos;p vakant lavozimlar</h3></div></div>
                <div className="kd-top">
                  {stats.topVakant.map((t, i) => (
                    <div key={t.lavozim} className="kd-top-row">
                      <span className="kd-top-n">{i + 1}</span>
                      <span className="kd-top-name">
                        <b>{t.lavozim}</b>
                        <small>{t.filials.map(shortName).join(", ")}</small>
                      </span>
                      <span className="kd-top-val">{fmtKadr(t.vakant)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {regional && stats.toifalar.length > 0 && (
              <section className="kd-card">
                <div className="kd-card-head"><div><h3><i className="fa-solid fa-layer-group" /> Toifalar kesimida</h3></div></div>
                <div className="kd-mini">
                  {stats.toifalar.map((t) => (
                    <div key={t.name} className="kd-mini-row">
                      <span>{t.name}</span>
                      <small>{fmtKadr(t.band)} / {fmtKadr(t.shtat)}{t.vakant ? ` · vakant ${fmtKadr(t.vakant)}` : ""}</small>
                      <RateBar rate={t.rate} />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
