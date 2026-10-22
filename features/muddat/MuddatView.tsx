"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useClock, fmtDate, fmtTime } from "@/lib/useClock";
import { useReportCapture } from "@/lib/useReportCapture";
import ReportActions from "@/components/ReportActions";
import PageLoader from "@/components/PageLoader";
import { useData } from "@/components/DataProvider";
import { ROWS, fmtNum } from "@/features/deadline/model";
import { BIRIKTIRILMAGAN, BOSQICHLAR, QOLGAN, VILOYAT, type MuddatCol, type MuddatRowStats, type MuddatSvod } from "./rules";

/**
 * "Muddat buzilish" — UZKAD arizalari bazasidan tumanlar kesimidagi SVOD (Google Sheets'dagi SVOD varag'i ko'rinishida).
 * Hisob serverda (lib/muddat-server.ts → features/muddat/rules.ts), bugungi sana bo'yicha.
 * Stillar Rollar kesimidan (.sec-deadline, styles/deadline.css → .muddat-page).
 */
/**
 * width — <colgroup> dagi qat'iy kenglik (bo'lmasa qolgan joyni teng bo'ladi); vertical — sarlavha 90° buriladi;
 * red — sarlavha matni qizil; head — jadval sarlavhasidagi qisqa nom (guruh nomi takrorlanmasin; drilldown'da — title)
 */
type Col = { id: MuddatCol; title: string; expired?: boolean; strong?: boolean; width?: number; vertical?: boolean; red?: boolean; head?: string };
/**
 * single — bitta ustunli guruh: sarlavhasi ikki qator balandlikda;
 * toggle — shunday guruh, bosilsa keyingi tahlil ustunlari ochiladi/yopiladi; red — guruh sarlavhasi qizil.
 */
type Group = { id: string; title: string; theme: string; cols: Col[]; single?: boolean; toggle?: boolean; red?: boolean };

/**
 * Muddati o'tgan ustunlar: rang to'qligi qiymatga qarab (eng ko'p tuman — eng to'q qizil).
 * CSS o'zgaruvchilari orqali — jadvalning hover/drilldown stillari !important bilan fonni almashtiradi (.mt-heat).
 */
const heat = (v: number, max: number): CSSProperties | undefined => {
  if (v <= 0 || max <= 0) return undefined;
  const t = v / max;
  // Raqam doim qora — qizil fonda o'qiladi
  return { "--heat-bg": `rgba(220, 38, 38, ${(0.1 + 0.65 * t).toFixed(3)})`, "--heat-fg": "#111827" } as CSSProperties;
};

/** Bosqichlar: sarlavhasi qizil ("Filial (tizm)") va SVOD'dagi qisqa nomlar (guruh nomi "Filial") */
const RED_HEAD = new Set<string>(["ajratish", "ozida", "umumiy", "boglik"]);
const HEAD: Partial<Record<string, string>> = { boshliq: "Tuman / shahar boʼlimi boshligʼi", arxiv: "Arxivchi" };

/** Bosqich ustunlari (sarlavhasi vertikal) — BOSQICHLAR dan */
const bosqich = (...ids: string[]): Col[] =>
  ids.map((id) => {
    const b = BOSQICHLAR.find((x) => x.id === id)!;
    return { id: b.id as MuddatCol, title: b.title, head: HEAD[id], vertical: true, red: RED_HEAD.has(id) };
  });

const groupsFor = (showBoshqa: boolean, tahlilOpen: boolean): Group[] => [
  { id: "jami", title: "Jami yakunlash kerak", theme: "theme-manba", cols: [{ id: "jami", title: "Jami yakunlash kerak", width: 78 }], single: true },
  {
    id: "otgan", title: "Shundan muddati o‘tgan arizalar", theme: "theme-dkp",
    cols: [
      { id: "otganFilial", title: "Filial tomonidan o‘tgan", expired: true, width: 92, red: true },
      { id: "otganReg", title: "Registratsiya tomonidan o‘tgan", expired: true, width: 92, red: true },
    ],
  },
  { id: "bugun", title: "Bugun muddati tugaydigan", theme: "theme-dkp", cols: [{ id: "bugun", title: "Bugun muddati tugaydigan", width: 78 }], single: true },
  {
    id: "obyekt", title: "Obyekt turi", theme: "theme-manba",
    cols: [{ id: "turar", title: "Turar", width: 62 }, { id: "noturar", title: "Noturar", width: 62 }],
  },
  // Ariza hozir turgan bosqich — Google Sheets SVOD'dagidek bo'limlar bo'yicha
  { id: "filial1", title: "Filial", theme: "theme-filial", cols: bosqich("boshliq", "boshMuhandis", "inventar") },
  { id: "filialTizm", title: "Filial (tizm)", theme: "theme-filial", red: true, cols: bosqich("ajratish", "ozida", "umumiy", "boglik") },
  { id: "filial2", title: "Filial", theme: "theme-filial", cols: bosqich("topograf", "dkyat", "balans") },
  { id: "boshqarma", title: "Boshqarma", theme: "theme-boshqarma", cols: bosqich("boshqarma", "reg") },
  { id: "filial3", title: "Filial", theme: "theme-filial", cols: bosqich("arxiv") },
  {
    id: "tizm", title: "Tizm", theme: "theme-manba",
    cols: bosqich("kamchilik", "kelishish", "tolov"),
  },
  // Hech qaysi bosqichga tushmaganlar — faqat bo'lsa
  ...(showBoshqa ? [{ id: "boshqa", title: "Boshqa", theme: "theme-dkp", cols: [{ id: "boshqa" as MuddatCol, title: "Boshqa", width: 56 }], single: true }] : []),
  { id: "yakunlandi", title: "YAKUNLANDI", theme: "theme-manba", cols: [{ id: "yakunlandi", title: "YAKUNLANDI", strong: true, width: 56, vertical: true }], single: true },
  // QOLDI = Jami − Yakunlandi
  { id: "qoldi", title: "QOLDI", theme: "mt-qoldi-th", cols: [{ id: "qoldi", title: "QOLDI", strong: true, width: 56 }], single: true },
  {
    id: "muddatiBor", title: "MUDDATI BOR", theme: "theme-agentlik",
    cols: [{ id: "muddatiBor", title: "MUDDATI BOR", strong: true, width: 84 }], single: true, toggle: true,
  },
  ...(tahlilOpen
    ? [{
        id: "qolgan", title: "Muddat buzilishni oldini olish maqsadida tahlil — muddati buzilishga", theme: "theme-agentlik",
        cols: QOLGAN.map((q) => ({ id: q.id as MuddatCol, title: q.title, width: 70 })),
      }]
    : []),
];

const KPI = [
  { col: "jami" as MuddatCol, cls: "kpi-manba", icon: "fa-solid fa-layer-group", title: "Jami yakunlash kerak (o‘tgan + bugun)", short: "Jami yakunlash kerak" },
  { col: "otganFilial" as MuddatCol, cls: "kpi-dkp", icon: "fa-solid fa-triangle-exclamation", title: "Filial tomonidan muddati o‘tgan", short: "Filial tomonidan o‘tgan" },
  { col: "bugun" as MuddatCol, cls: "kpi-filial", icon: "fa-solid fa-hourglass-end", title: "Bugun muddati tugaydigan", short: "Bugun tugaydigan" },
  { col: "qoldi" as MuddatCol, cls: "kpi-boshqarma", icon: "fa-solid fa-list-check", title: "Qoldi (yakunlanmagan)", short: "Qoldi" },
  { col: "muddatiBor" as MuddatCol, cls: "kpi-agentlik", icon: "fa-solid fa-clock", title: "Muddati bor", short: "Muddati bor" },
];

const colTitle = (id: MuddatCol) => groupsFor(true, true).flatMap((g) => g.cols).find((c) => c.id === id)?.title || id;
const safeFile = (s: string) => s.replace(/[\\/:*?"<>|]/g, "_");

/** Modal — arizalar ro'yxati (katak, karta yoki muhandis arizalari) */
type Drill = { open: boolean; loading: boolean; error: string | null; title: string; file: string; headers: string[]; data: unknown[][] };
const CLOSED: Drill = { open: false, loading: false, error: null, title: "", file: "", headers: [], data: [] };

/** Tuman ochilganda: ijrochi muhandislar kesimidagi qatorlar (SVOD bilan bir xil ustunlar) */
type MuhRows = { loading: boolean; error: string | null; rows: { name: string; st: MuddatRowStats }[] };

/** "2026-10-22T09:00" → "22.10.2026-yil 09:00" */
const fmtHolat = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}-yil ${m[4]}` : iso;
};

/** Ism-familiya bosh harflari (avatar) */
const initials = (name: string) =>
  name === BIRIKTIRILMAGAN ? "—" : name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

/** Karta filtrlari so'rov parametri (bir nechta — vergul bilan; yo'q — bo'sh) */
const fq = (fs: MuddatCol[]) => (fs.length ? `&f=${fs.join(",")}` : "");

/** col = "hammasi" — muhandisning barcha arizalari; muhandis — shu ijrochi muhandis bo'yicha; f — karta filtrlari */
async function fetchDetails(tuman: string, col: MuddatCol | "hammasi", muhandis: string | undefined, f: MuddatCol[]): Promise<{ headers: string[]; data: unknown[][] }> {
  const m = muhandis === undefined ? "" : `&muhandis=${encodeURIComponent(muhandis)}`;
  const res = await fetch(`/api/muddat?details=1&tuman=${encodeURIComponent(tuman)}&col=${col}${m}${fq(f)}`, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok || json.status !== "success") throw new Error(json.message || json.error || `HTTP ${res.status}`);
  return json;
}

/** Tuman ichida ijrochi muhandislar kesimi */
async function fetchMuhandislar(tuman: string, f: MuddatCol[]): Promise<MuhRows["rows"]> {
  const res = await fetch(`/api/muddat?muhandislar=1&tuman=${encodeURIComponent(tuman)}${fq(f)}`, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok || json.status !== "success") throw new Error(json.message || json.error || `HTTP ${res.status}`);
  return json.rows;
}

async function exportRows(headers: string[], data: unknown[][], file: string) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...data]), "Arizalar");
  XLSX.writeFile(wb, `${safeFile(file)}.xlsx`);
}

export default function MuddatView({ canUpload }: { canUpload: boolean }) {
  const now = useClock();
  const reportRef = useRef<HTMLDivElement>(null);
  const fileName = useCallback(() => `Muddat_buzilish_${fmtDate(new Date())}.png`, []);
  // Pechat ham rasm orqali (bitta A4 albom sahifa) — rasm bilan bir xil chiqadi
  const cap = useReportCapture(reportRef, { fileName, windowWidth: 1600, background: "#f1f5f9", printPages: 1 });

  const [svod, setSvod] = useState<MuddatSvod | null>(null);
  // Kartalardagi raqamlar — filtrsiz SVOD'dan
  const [totals, setTotals] = useState<MuddatSvod | null>(null);
  // Karta filtrlari (bir nechta): jadval tanlangan ustunlardan istalganiga tushadigan arizalar bo'yicha hisoblanadi
  const [filters, setFilters] = useState<MuddatCol[]>([]);
  // Hisobot holati (sana va vaqt, "yyyy-MM-ddTHH:mm") — hammaga umumiy, hisob shu sana bo'yicha; tahrir — canUpload
  const [holat, setHolat] = useState("");
  const [holatDraft, setHolatDraft] = useState<string | null>(null);
  const [holatSaving, setHolatSaving] = useState(false);
  const [holatErr, setHolatErr] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [drill, setDrill] = useState<Drill>(CLOSED);
  // Ochilgan tumanlar → ijrochi muhandislar qatorlari (bir nechtasi bir vaqtda ochiq bo'lishi mumkin)
  const [openTuman, setOpenTuman] = useState<Record<string, MuhRows>>({});
  // "Muddat buzilishni oldini olish" ustunlari — sahifaga kirganda yopiq, MUDDATI BOR sarlavhasi bilan ochiladi
  const [tahlilOpen, setTahlilOpen] = useState(false);

  /** keepOpen — jadval o'zgarganda (versiya): ochiq tumanlar yopilmaydi, ularning muhandis qatorlari qayta olinadi */
  const load = useCallback(async (fresh: boolean, f: MuddatCol[], keepOpen: string[] = []) => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/muddat?x=1${fresh ? "&fresh=1" : ""}${fq(f)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || json.status !== "success") throw new Error(json.message || json.error || `HTTP ${res.status}`);
      setSvod(json.svod);
      setTotals(json.totals);
      // Filtr yoki yangilanishda muhandislar qatorlari qayta so'raladi
      const muh = await Promise.all(keepOpen.map((t) => fetchMuhandislar(t, f).then((rows) => [t, { loading: false, error: null, rows }] as const, () => null)));
      setOpenTuman(Object.fromEntries(muh.filter((m) => m !== null)));
      setHolat(json.holat || "");
      setEmpty(!!json.empty);
      setError(null);
    } catch (e) {
      setError((e as Error).message || "Tarmoq xatosi");
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => void load(false, filters), [load, filters]);

  // Google Sheets'dagi baza o'zgardi (qo'lda tahrir yoki "Bazaga yuklash") — DataProvider versiyalari orqali
  const ver = useData().versions.muddat;
  const seenVer = useRef(ver);
  useEffect(() => {
    const prev = seenVer.current;
    seenVer.current = ver;
    if (ver && prev && ver !== prev) void load(true, filters, Object.keys(openTuman));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ver]);

  /** Holat sana/vaqtini saqlash (Google Sheets → MuddatHolat) va jadvalni shu sana bo'yicha qayta hisoblash */
  const saveHolat = async () => {
    if (!holatDraft) return;
    setHolatSaving(true);
    setHolatErr(null);
    try {
      const res = await fetch("/api/muddat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ holat: holatDraft }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.status !== "success") throw new Error(json.message || json.error || `HTTP ${res.status}`);
      setHolatDraft(null);
      await load(true, filters, Object.keys(openTuman));
    } catch (e) {
      setHolatErr((e as Error).message || "Tarmoq xatosi");
    } finally {
      setHolatSaving(false);
    }
  };

  /** Karta: filtrga qo'shish / olib tashlash ("Muddati bor" — tahlil ustunlari u bilan birga ochiladi va yopiladi) */
  const toggleFilter = (col: MuddatCol) => {
    const on = !filters.includes(col);
    // KPI tartibida saqlanadi — so'rov va sarlavha barqaror bo'lsin
    setFilters(KPI.map((k) => k.col).filter((c) => (c === col ? on : filters.includes(c))));
    if (col === "muddatiBor") setTahlilOpen(on);
  };
  const filterNames = filters.map((c) => KPI.find((k) => k.col === c)?.short ?? colTitle(c)).join(" + ");

  /** Katak, karta yoki muhandis: shu ko'rsatkichdagi arizalar */
  const openDrill = async (tuman: string, col: MuddatCol | "hammasi", muhandis?: string) => {
    const what = (col === "hammasi" ? "barcha arizalari" : colTitle(col)) + (filters.length && !(filters.length === 1 && filters[0] === col) ? ` (${filterNames})` : "");
    const title = muhandis === undefined ? `${tuman} — ${what}` : `${tuman} — ${muhandis} — ${what}`;
    setDrill({ ...CLOSED, open: true, loading: true, title, file: [tuman, muhandis, what].filter(Boolean).join("_") });
    try {
      const { headers, data } = await fetchDetails(tuman, col, muhandis, filters);
      setDrill((d) => ({ ...d, loading: false, headers, data, title: `${title}: ${data.length} ta ariza` }));
    } catch (e) {
      setDrill((d) => ({ ...d, loading: false, error: (e as Error).message || "Tarmoq xatosi" }));
    }
  };

  /** Tuman nomi bosilganda: ostida ijrochi muhandislar qatorlari ochiladi (qayta bosilsa yopiladi) */
  const toggleTuman = async (tuman: string) => {
    if (openTuman[tuman]) {
      setOpenTuman(({ [tuman]: _, ...rest }) => rest);
      return;
    }
    setOpenTuman((o) => ({ ...o, [tuman]: { loading: true, error: null, rows: [] } }));
    try {
      const rows = await fetchMuhandislar(tuman, filters);
      setOpenTuman((o) => (o[tuman] ? { ...o, [tuman]: { loading: false, error: null, rows } } : o));
    } catch (e) {
      setOpenTuman((o) => (o[tuman] ? { ...o, [tuman]: { loading: false, error: (e as Error).message || "Tarmoq xatosi", rows: [] } } : o));
    }
  };

  const rows = svod ? ROWS.filter((r) => r.name in svod) : [];
  const tot = totals ?? svod;
  const jami = tot?.[VILOYAT] ?? (rows.length === 1 ? tot?.[rows[0].name] : undefined) ?? {};
  const GROUPS = groupsFor(rows.some((r) => (svod?.[r.name]?.boshqa ?? 0) > 0), tahlilOpen);
  const COLS = GROUPS.flatMap((g) => g.cols);
  const STRONG = { borderLeft: "2px solid #64748b" } as const;
  const colCount = 2 + COLS.length;
  // Rang shkalasi faqat tumanlar orasida ("Viloyat jami" qatori o'z rangida)
  const heatMax = (id: MuddatCol) => Math.max(0, ...rows.filter((r) => !r.isJami).map((r) => svod?.[r.name]?.[id] ?? 0));

  if (!svod && !error) return <div className="sec-deadline muddat-page"><PageLoader /></div>;

  const thBase: CSSProperties = { padding: "6px 8px", background: "#f1f5f9", border: "1px solid #cbd5e1", position: "sticky", top: 0, zIndex: 10, whiteSpace: "nowrap", fontWeight: 700 };
  const tdBase: CSSProperties = { padding: "5px 8px", border: "1px solid #e2e8f0", whiteSpace: "nowrap" };

  return (
    <div className="sec-deadline muddat-page print-page">
      <header className="top-header-panel">
        <div className="header-title-box">
          <div className="header-icon-badge"><i className="fa-solid fa-calendar-xmark" /></div>
          <div>
            <h2>Muddat buzilish (SVOD) — tashqi arizalar</h2>
          </div>
        </div>
        <div className="header-right-actions">
          <div className="datetime-badge">
            <i className="fa-regular fa-calendar" style={{ color: "#64748b" }} />
            <span>{now ? fmtDate(now) : "--.--.----"}</span>
            <span className="datetime-divider">|</span>
            <span className="live-dot" />
            <span style={{ fontWeight: 700, color: "#0f172a" }}>{now ? fmtTime(now) : "--:--:--"}</span>
          </div>
          <ReportActions
            onRefresh={() => load(true, filters)} refreshing={refreshing}
            onImage={cap.saveImage} imageBusy={cap.busy} onPrint={cap.print} printBusy={cap.printing} disabled={!svod || empty}
          />
        </div>
      </header>

      {error && (
        <div role="alert" style={{ margin: "0 0 12px", padding: "10px 14px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: 13, fontWeight: 600 }}>
          <i className="fa-solid fa-circle-exclamation" style={{ marginRight: 8 }} />
          Ma&apos;lumotni yuklab bo&apos;lmadi: {error}
          {canUpload && /yuklang|sarlavha|ustun/i.test(error) && <a href="/upload" className="drill-error-link" style={{ marginLeft: 10 }}>Bazaga yuklash</a>}
        </div>
      )}

      {svod && empty && (
        <div role="status" style={{ margin: "0 0 12px", padding: "12px 16px", borderRadius: 10, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e3a8a", fontSize: 13 }}>
          <i className="fa-solid fa-circle-info" style={{ marginRight: 8 }} />
          Baza hali yuklanmagan.{" "}
          {canUpload ? <a href="/upload" style={{ fontWeight: 700 }}>Bazaga yuklash → Muddat buzilish</a> : "Administratorga murojaat qiling."}
        </div>
      )}

      {svod && (
        <div ref={reportRef} className={`dashboard-content-wrapper print-fit${cap.capturing ? " capturing" : ""}`}>
          <section className="kpi-cards-grid">
            {KPI.map((k) => (
              <div key={k.col} role="button" tabIndex={0} aria-pressed={filters.includes(k.col)}
                className={`kpi-card kpi-click ${k.cls}${filters.includes(k.col) ? " is-active" : ""}`}
                title={filters.includes(k.col) ? "Filtrdan olib tashlash" : "Filtrga qo'shish"}
                onClick={() => toggleFilter(k.col)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggleFilter(k.col)}>
                {filters.includes(k.col) && <span className="mt-kpi-check" aria-hidden><i className="fa-solid fa-check" /></span>}
                <div className="kpi-content-box">
                  <div className="kpi-icon"><i className={k.icon} /></div>
                  <div className="kpi-info">
                    <span className="kpi-title">{k.title}</span>
                    <h3>{fmtNum(jami[k.col] ?? 0)}</h3>
                  </div>
                </div>
              </div>
            ))}
          </section>

          <div className="sheet-viewport">
            <table className="excel-table muddat-table">
              {/* Fixed layout: ustunlar soni va kengligi shu yerdan (bosqich ustunlari — qolgan joyni teng bo'ladi) */}
              <colgroup>
                <col style={{ width: 36 }} />
                <col style={{ width: 168 }} />
                {COLS.map((c) => <col key={c.id} style={c.width ? { width: c.width } : undefined} />)}
              </colgroup>
              <thead>
                <tr>
                  <th colSpan={colCount} className="banner-row-1">
                    <i className="fa-solid fa-file-invoice" style={{ marginRight: 8 }} />
                    Turar-joy va noturar-joy ko‘chmas mulk obyektlari Jismoniy va Yuridik shaxslar tomonidan Uzkad dasturiga kelgan arizalarni muddati buzilish bo‘yicha
                  </th>
                </tr>
                <tr>
                  {/* MAʼLUMOT qatori: chapda hisobot holati (sana va vaqt) */}
                  <th colSpan={colCount} className="banner-row-2">
                    <div className="mt-banner">
                      <span className="mt-banner-date">
                        {holatDraft === null ? (
                          <>
                            {holat && `${fmtHolat(holat)} holatiga`}
                            {canUpload && holat && (
                              <button type="button" className="mt-banner-edit no-print" data-html2canvas-ignore title="Sana va vaqtni o'zgartirish"
                                onClick={() => { setHolatDraft(holat); setHolatErr(null); }}>
                                <i className="fa-solid fa-pen" />
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="mt-holat-form no-print" data-html2canvas-ignore>
                            <input type="datetime-local" value={holatDraft} onChange={(e) => setHolatDraft(e.target.value)} disabled={holatSaving} />
                            <button type="button" className="is-save" onClick={saveHolat} disabled={holatSaving || !holatDraft}>
                              {holatSaving ? <i className="fa-solid fa-spinner fa-spin" /> : "Saqlash"}
                            </button>
                            <button type="button" onClick={() => setHolatDraft(null)} disabled={holatSaving}>Bekor</button>
                          </span>
                        )}
                        {holatErr && <span className="mt-holat-err no-print" data-html2canvas-ignore>{holatErr}</span>}
                      </span>
                      <span className="mt-banner-title">MAʼLUMOT{filters.length ? ` · Filtr: ${filterNames}` : ""}</span>
                    </div>
                  </th>
                </tr>
                <tr className="header-row-roles">
                  <th className="freeze-no" rowSpan={2}>№</th>
                  <th className="freeze-name" rowSpan={2}>Hudud nomi</th>
                  {GROUPS.map((g) =>
                    g.toggle ? (
                      <th key={g.id} rowSpan={2} className={`${g.theme} mt-toggle`} style={STRONG}
                        onClick={() => setTahlilOpen((o) => !o)} title="Muddat buzilishni oldini olish tahlilini ochish/yopish">
                        {g.title}
                        <i className={`no-print ${tahlilOpen ? "fa-solid fa-chevron-left" : "fa-solid fa-chevron-right"}`} data-html2canvas-ignore />
                      </th>
                    ) : g.single ? (
                      <th key={g.id} rowSpan={2} className={`${g.theme}${g.cols[0].vertical ? " mt-vert-th" : ""}`}
                        style={g.cols[0].strong ? { ...STRONG, fontWeight: 800 } : undefined}>
                        {g.cols[0].vertical ? <div className="mt-vert">{g.title}</div> : g.title}
                      </th>
                    ) : (
                      <th key={g.id} colSpan={g.cols.length} className={`${g.theme}${g.red ? " mt-th-red" : ""}`}>{g.title}</th>
                    )
                  )}
                </tr>
                <tr className="header-row-days">
                  {GROUPS.filter((g) => !g.single).flatMap((g) =>
                    g.cols.map((c) => (
                      <th key={c.id} className={`${g.theme}${c.vertical ? " mt-vert-th" : ""}${c.red ? " mt-th-red" : ""}`} title={c.title}
                        style={c.strong ? { ...STRONG, fontWeight: 800 } : undefined}>
                        {c.vertical ? <div className="mt-vert">{c.head ?? c.title}</div> : c.head ?? c.title}
                      </th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = svod[r.name] || {};
                  const muh = r.isJami ? undefined : openTuman[r.name];
                  return (
                    <Fragment key={r.name}>
                    <tr className={`${r.isJami ? "row-jami" : ""}${muh ? " mt-row-open" : ""}`}>
                      <td className="freeze-no">{r.no}</td>
                      {r.isJami ? (
                        <td className="freeze-name">{r.name}</td>
                      ) : (
                        <td className="freeze-name mt-tuman" title="Ijrochi muhandislar kesimi" onClick={() => toggleTuman(r.name)}>
                          <i className={`fa-solid ${muh ? "fa-chevron-down" : "fa-chevron-right"} mt-caret no-print`} data-html2canvas-ignore />
                          {r.name}
                        </td>
                      )}
                      {COLS.map((c) => {
                        const v = st[c.id] ?? 0;
                        const shade = c.expired && !r.isJami ? heat(v, heatMax(c.id)) : undefined;
                        return (
                          <td key={c.id}
                            className={`num-cell${v > 0 ? " drilldown-cell" : ""}${c.id === "jami" ? " col-subtotal" : ""}${c.id === "qoldi" ? " mt-qoldi" : ""}${shade ? " mt-heat" : ""}`}
                            style={{ ...(c.strong ? { ...STRONG, fontWeight: 700 } : {}), ...shade }}
                            onClick={v > 0 ? () => openDrill(r.name, c.id) : undefined}>
                            {v > 0 ? fmtNum(v) : ""}
                          </td>
                        );
                      })}
                    </tr>
                    {muh && (muh.loading || muh.error || muh.rows.length === 0) && (
                      <tr className="mt-sub mt-sub-msg">
                        <td className="freeze-no" />
                        <td colSpan={colCount - 1}>
                          {muh.loading ? <><i className="fa-solid fa-spinner fa-spin" /> Ijrochi muhandislar yuklanmoqda...</>
                            : muh.error ? <span className="mt-sub-err"><i className="fa-solid fa-triangle-exclamation" /> {muh.error}</span>
                            : "Bu tumanda ariza yo'q."}
                        </td>
                      </tr>
                    )}
                    {muh?.rows.map((m) => (
                      <tr key={m.name} className="mt-sub">
                        <td className="freeze-no" />
                        <td className={`freeze-name mt-fio${m.name === BIRIKTIRILMAGAN ? " mt-none" : ""}`} title={`${m.name} — barcha arizalari`} onClick={() => openDrill(r.name, "hammasi", m.name)}>
                          <span className={`mt-avatar${m.name === BIRIKTIRILMAGAN ? " is-none" : ""}`}>{initials(m.name)}</span>
                          <span className="mt-fio-name">{m.name}</span>
                        </td>
                        {COLS.map((c) => {
                          const v = m.st[c.id] ?? 0;
                          return (
                            <td key={c.id}
                              className={`num-cell${v > 0 ? " drilldown-cell" : ""}${c.expired && v > 0 ? " mt-bad" : ""}${c.id === "qoldi" ? " mt-qoldi" : ""}`}
                              style={c.strong ? STRONG : undefined}
                              onClick={v > 0 ? () => openDrill(r.name, c.id, m.name) : undefined}>
                              {v > 0 ? fmtNum(v) : ""}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* TELEFON (≤768px): jadval o'rniga har bir hudud — karta (rasm va pechat — jadval) */}
          <div className="dl-cards mt-cards" data-html2canvas-ignore>
            {rows.map((r) => {
              const st = svod[r.name] || {};
              const muh = r.isJami ? undefined : openTuman[r.name];
              const nz = (ids: readonly MuddatCol[]) => ids.filter((id) => (st[id] ?? 0) > 0);
              const chip = (id: MuddatCol, label: string) => (
                <button key={id} type="button" className="mt-chip" onClick={() => openDrill(r.name, id)}>
                  {label} <b>{fmtNum(st[id] ?? 0)}</b>
                </button>
              );
              const bosqich = nz(COLS.filter((c) => c.vertical).map((c) => c.id));
              const qolgan = nz(QOLGAN.map((q) => q.id as MuddatCol));
              return (
                <details key={r.name} className={`dl-card mt-card${r.isJami ? " is-total" : ""}`} open={r.isJami && rows.length === 1}>
                  <summary>
                    <div className="dl-card-title">
                      <b>{r.name}</b>
                      <span className="mt-card-n" title="Jami yakunlash kerak">{fmtNum(st.jami ?? 0)}</span>
                      <i className="fa-solid fa-chevron-down dl-card-chev" />
                    </div>
                    <div className="mt-card-stats">
                      <span className={(st.otganFilial ?? 0) > 0 ? "is-bad" : ""}>Filial o‘tgan <b>{fmtNum(st.otganFilial ?? 0)}</b></span>
                      <span className={(st.otganReg ?? 0) > 0 ? "is-bad" : ""}>Registr. o‘tgan <b>{fmtNum(st.otganReg ?? 0)}</b></span>
                      <span>Bugun <b>{fmtNum(st.bugun ?? 0)}</b></span>
                      <span>Qoldi <b>{fmtNum(st.qoldi ?? 0)}</b></span>
                      <span>Muddati bor <b>{fmtNum(st.muddatiBor ?? 0)}</b></span>
                    </div>
                  </summary>
                  <div className="mt-card-body">
                    {(st.jami ?? 0) > 0 && (
                      <div className="mt-card-sec">
                        <h4>Jami yakunlash kerak</h4>
                        <div className="mt-chips">
                          {chip("jami", "Jami")}
                          {nz(["otganFilial", "otganReg", "bugun"]).map((id) => chip(id, colTitle(id)))}
                          {nz(["turar", "noturar"]).map((id) => chip(id, colTitle(id)))}
                        </div>
                      </div>
                    )}
                    {bosqich.length > 0 && (
                      <div className="mt-card-sec">
                        <h4>Ariza hozir turgan bosqich</h4>
                        <div className="mt-chips">{bosqich.map((id) => chip(id, colTitle(id)))}</div>
                      </div>
                    )}
                    {qolgan.length > 0 && (
                      <div className="mt-card-sec">
                        <h4>Muddati buzilishga qolgan kun</h4>
                        <div className="mt-chips">{qolgan.map((id) => chip(id, colTitle(id)))}</div>
                      </div>
                    )}
                    {!r.isJami && (
                      <div className="mt-card-sec">
                        <button type="button" className="mt-card-muh-btn" onClick={() => toggleTuman(r.name)}>
                          <i className="fa-solid fa-user-gear" /> Ijrochi muhandislar
                          <i className={`fa-solid ${muh ? "fa-chevron-up" : "fa-chevron-down"}`} />
                        </button>
                        {muh?.loading && <div className="mt-card-msg"><i className="fa-solid fa-spinner fa-spin" /> Yuklanmoqda...</div>}
                        {muh?.error && <div className="mt-card-msg is-bad">{muh.error}</div>}
                        {muh && !muh.loading && !muh.error && (
                          <ul className="mt-card-muh">
                            {muh.rows.map((m) => (
                              <li key={m.name} onClick={() => openDrill(r.name, "hammasi", m.name)}>
                                <span className={`mt-avatar${m.name === BIRIKTIRILMAGAN ? " is-none" : ""}`}>{initials(m.name)}</span>
                                <span className="mt-card-muh-name">{m.name}</span>
                                {(m.st.otganFilial ?? 0) + (m.st.otganReg ?? 0) > 0 && (
                                  <span className="mt-card-muh-bad" title="Muddati o'tgan">{fmtNum((m.st.otganFilial ?? 0) + (m.st.otganReg ?? 0))}</span>
                                )}
                                <b title="Jami yakunlash kerak">{fmtNum(m.st.jami ?? 0)}</b>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL: arizalar ro'yxati */}
      <div className="modal-overlay no-print" style={{ display: drill.open ? "flex" : "none" }}>
        <div className="modal-content">
          <div className="modal-header">
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{drill.title}</h3>
            <button onClick={() => setDrill(CLOSED)} style={{ background: "none", border: "none", color: "white", fontSize: 20, cursor: "pointer" }}>
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
          <div className="modal-toolbar">
            {drill.loading && <span style={{ color: "#0284c7", fontWeight: 600 }}><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} />Yuklanmoqda...</span>}
            {!drill.loading && drill.data.length > 0 && (
              <button className="btn-upload" style={{ background: "#10b981" }} onClick={() => exportRows(drill.headers, drill.data, drill.file)}>
                <i className="fa-solid fa-file-excel" style={{ marginRight: 6 }} /> Excel yuklash
              </button>
            )}
          </div>
          <div className="modal-body">
            {drill.error ? (
              <div className="drill-error" style={{ margin: 15 }}><i className="fa-solid fa-triangle-exclamation" /><div>{drill.error}</div></div>
            ) : (
              <table className="excel-table drill-table">
                <thead>
                  <tr>{drill.headers.map((h, i) => <th key={i} style={thBase}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {drill.data.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((v, ci) => <td key={ci} style={tdBase}>{v === null || v === undefined ? "" : String(v)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
