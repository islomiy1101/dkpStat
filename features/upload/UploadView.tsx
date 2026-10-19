"use client";

import { useRef, useState } from "react";
import { useData } from "@/components/DataProvider";
import type { SheetLink } from "@/lib/sheet-links";
import { UPLOAD_CHUNK_ROWS, UPLOAD_TARGETS, parseWorkbook, type ParsedSheet, type UploadSection, type UploadTarget, type CellValue } from "@/lib/upload-targets";

/**
 * "Bazaga yuklash" (faqat superadmin): har bir bo'lim uchun alohida .xlsx.
 * Fayl avval brauzerda tekshiriladi va ko'rsatiladi, tasdiqlangach serverga yuboriladi —
 * server qayta tekshirib, Google Sheets'dagi varaqlarni to'liq almashtiradi.
 */
export default function UploadView({ links }: { links: SheetLink[] }) {
  return (
    <div className="sec-upload">
      <header className="up-header">
        <div className="up-title">
          <div className="up-badge"><i className="fa-solid fa-file-arrow-up" /></div>
          <div>
            <h2>Bazaga yuklash</h2>
            <span>Excel (.xlsx) fayldagi ma&apos;lumotlar tegishli Google Sheets varag&apos;iga yoziladi — eski ma&apos;lumotlar to&apos;liq almashtiriladi</span>
          </div>
        </div>
      </header>
      <div className="up-grid">
        {(Object.keys(UPLOAD_TARGETS) as UploadSection[]).map((id) => (
          <UploadCard key={id} target={UPLOAD_TARGETS[id]} />
        ))}
      </div>
      <SheetLinks links={links} />
    </div>
  );
}

/** Barcha Google Sheets — bir joydan ochish (har birini izlab yurmaslik uchun) */
function SheetLinks({ links }: { links: SheetLink[] }) {
  const groups = [...new Set(links.map((l) => l.group))];
  return (
    <section className="up-links">
      <div className="up-links-head">
        <div className="up-card-icon"><i className="fa-solid fa-table-list" /></div>
        <div>
          <h3>Google Sheets jadvallari</h3>
          <p>Tizim ishlatadigan barcha jadvallar — bosilsa yangi oynada ochiladi</p>
        </div>
      </div>
      {groups.map((g) => (
        <div key={g} className="up-links-group">
          <div className="up-links-label">{g}</div>
          <div className="up-links-grid">
            {links.filter((l) => l.group === g).map((l) =>
              l.url ? (
                <a key={l.title} className="up-link" href={l.url} target="_blank" rel="noopener noreferrer" title={`${l.title} — Google Sheets'da ochish`}>
                  <span className="up-link-icon"><i className={l.icon} /></span>
                  <span className="up-link-text">
                    <b>{l.title}</b>
                    <small>{l.sheets.join(" · ")}</small>
                  </span>
                  <i className="fa-solid fa-arrow-up-right-from-square up-link-go" />
                </a>
              ) : (
                <div key={l.title} className="up-link is-off" title="Jadval ID'si topilmadi (.env yoki Apps Script)">
                  <span className="up-link-icon"><i className={l.icon} /></span>
                  <span className="up-link-text">
                    <b>{l.title}</b>
                    <small>Sozlanmagan</small>
                  </span>
                </div>
              )
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

type Result = { ok: boolean; text: string } | null;

const show = (v: CellValue) => (typeof v === "object" ? v.$date.replace("T00:00:00", "").replace("T", " ") : String(v));

/** Netlify funksiyasi so'rov hajmi ~6 MB — qism shundan kichik bo'lishi kerak */
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;

type Progress = { sheet: string; done: number; total: number };

async function postJson(url: string, body: string) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  const json = await res.json().catch(() => ({ success: false, message: `HTTP ${res.status}` }));
  return { ...(json as { success: boolean; message?: string }), status: res.status };
}

/**
 * Katta varaqlarni qismlab yuborish. Birinchi qism (sarlavhalar bilan) varaqni tozalaydi.
 * Tarmoq/server xatosida qism 2 marta qayta yuboriladi (qayta yozish xavfsiz — o'sha qatorlar ustiga yoziladi);
 * baribir o'tmasa — varaq qisman yozilgan bo'ladi.
 */
async function sendChunked(target: UploadTarget, file: File, sheets: ParsedSheet[], onProgress: (p: Progress) => void) {
  const url = `/api/upload/${target.id}`;
  const done: string[] = [];
  for (const p of sheets) {
    const total = p.values.length;
    let start = 0;
    let size = UPLOAD_CHUNK_ROWS;
    onProgress({ sheet: p.rule.target, done: 0, total });
    while (start < total) {
      const values = p.values.slice(start, start + size);
      const body = JSON.stringify({ sheet: p.rule.target, fileName: file.name, startRow: start + 1, totalRows: total, values });
      if (body.length > MAX_CHUNK_BYTES && size > 100) {
        size = Math.floor(size / 2);
        continue;
      }
      let r: { success: boolean; message?: string; status?: number } = { success: false };
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          r = await postJson(url, body);
        } catch {
          r = { success: false, message: "Tarmoq xatosi" };
        }
        // Tekshiruv xatosi (4xx) — qayta urinishdan foyda yo'q
        if (r.success || (r.status && r.status < 500)) break;
      }
      if (!r.success) {
        const where = start === 0 ? "" : ` Varaq qisman yozildi (${start.toLocaleString()} / ${total.toLocaleString()} qator) — faylni qayta yuklang.`;
        throw new Error(`${p.rule.target}: ${r.message || "Yozib bo'lmadi"}.${where}${done.length ? ` To'liq yozilgan: ${done.join(", ")}.` : ""}`);
      }
      start += values.length;
      onProgress({ sheet: p.rule.target, done: start, total });
    }
    done.push(`${p.rule.target}: ${(total - (p.rule.headerRows ?? 1)).toLocaleString()} qator`);
  }
  return `Baza yangilandi (${done.join(", ")}).`;
}

function UploadCard({ target }: { target: UploadTarget }) {
  const { refresh } = useData();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedSheet[] | null>(null);
  const [reading, setReading] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [progress, setProgress] = useState<Progress | null>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setConfirm(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onPick = async (f: File | undefined) => {
    setResult(null);
    setPreview(null);
    setConfirm(false);
    if (!f) return setFile(null);
    setFile(f);
    if (!/\.xlsx$/i.test(f.name)) {
      setResult({ ok: false, text: "Faqat .xlsx fayl qabul qilinadi." });
      return;
    }
    setReading(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array", cellDates: true });
      setPreview(parseWorkbook(XLSX, wb, target));
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message || "Faylni o'qib bo'lmadi." });
    } finally {
      setReading(false);
    }
  };

  const send = async () => {
    if (!file) return;
    setSending(true);
    setResult(null);
    if (target.chunked && preview) {
      try {
        const text = await sendChunked(target, file, preview, setProgress);
        setResult({ ok: true, text });
        reset();
      } catch (e) {
        setResult({ ok: false, text: (e as Error).message });
      } finally {
        // Qisman yozilgan bo'lsa ham kesh tozalanadi — sahifa haqiqiy holatni ko'rsatsin
        void refresh(target.id, { fresh: true });
        setProgress(null);
        setSending(false);
        setConfirm(false);
      }
      return;
    }
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/upload/${target.id}`, { method: "POST", body: fd });
      const json = await res.json().catch(() => ({ success: false, message: `HTTP ${res.status}` }));
      setResult({ ok: !!json.success, text: json.message || (json.success ? "Yuklandi" : "Xatolik") });
      if (json.success) {
        reset();
        void refresh(target.id, { fresh: true });
      }
    } catch {
      setResult({ ok: false, text: "Tarmoq xatosi. Qayta urinib ko'ring." });
    } finally {
      setSending(false);
      setConfirm(false);
    }
  };

  return (
    <section className="up-card">
      <div className="up-card-head">
        <div className="up-card-icon"><i className={target.icon} /></div>
        <div>
          <h3>{target.title}</h3>
          <p>{target.hint}</p>
        </div>
      </div>

      <label className={`up-drop${file ? " has-file" : ""}`}>
        <input ref={inputRef} type="file" accept=".xlsx" disabled={sending} onChange={(e) => onPick(e.target.files?.[0])} />
        <i className={`fa-solid ${reading ? "fa-spinner fa-spin" : "fa-file-excel"}`} />
        <span>{file ? file.name : "Faylni tanlang (.xlsx)"}</span>
        {file && <small>{(file.size / 1024).toFixed(0)} KB</small>}
      </label>

      {preview && (
        <div className="up-preview">
          {preview.map((p) => (
            <div key={p.rule.target} className="up-sheet">
              <div className="up-sheet-head">
                <span><i className="fa-solid fa-table" /> {p.sourceName} → <b>{p.rule.target}</b></span>
                <span className="up-count">{(p.values.length - (p.rule.headerRows ?? 1)).toLocaleString()} qator · {p.values[0].length} ustun</span>
              </div>
              <div className="up-table-wrap">
                <table className="up-table">
                  <thead>
                    {p.values.slice(0, p.rule.headerRows ?? 1).map((r, ri) => (
                      <tr key={ri}>{r.map((h, i) => <th key={i}>{show(h)}</th>)}</tr>
                    ))}
                  </thead>
                  <tbody>
                    {p.values.slice(p.rule.headerRows ?? 1, (p.rule.headerRows ?? 1) + 10).map((r, ri) => (
                      <tr key={ri}>{r.map((v, ci) => <td key={ci}>{show(v)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {p.values.length > (p.rule.headerRows ?? 1) + 10 && (
                <div className="up-more">
                  Ko&apos;rinishda birinchi 10 qator · yana {(p.values.length - (p.rule.headerRows ?? 1) - 10).toLocaleString()} qator ·
                  jami <b>{(p.values.length - (p.rule.headerRows ?? 1)).toLocaleString()}</b> qator yuklanadi
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {progress && (
        <div className="up-progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
          <div className="up-progress-head">
            <span><i className="fa-solid fa-spinner fa-spin" /> {progress.sheet}</span>
            <span>{progress.done.toLocaleString()} / {progress.total.toLocaleString()} qator</span>
          </div>
          <div className="up-progress-bar"><span style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
          <small>Sahifani yopmang — katta fayl bir necha daqiqa yuklanadi.</small>
        </div>
      )}

      {result && (
        <div className={`up-result ${result.ok ? "ok" : "err"}`} role="status">
          <i className={`fa-solid ${result.ok ? "fa-circle-check" : "fa-circle-exclamation"}`} /> {result.text}
        </div>
      )}

      <div className="up-actions">
        {preview && !confirm && (
          <>
            <button className="up-btn" onClick={reset} disabled={sending}>Bekor qilish</button>
            <button className="up-btn up-btn-primary" onClick={() => setConfirm(true)}>
              <i className="fa-solid fa-cloud-arrow-up" /> Bazaga yuklash
            </button>
          </>
        )}
        {preview && confirm && (
          <div className="up-confirm">
            <span>
              <i className="fa-solid fa-triangle-exclamation" /> {preview.map((p) => p.rule.target).join(", ")} varag&apos;idagi eski ma&apos;lumotlar
              o&apos;chirilib, yangisi yoziladi. Davom etasizmi?
            </span>
            <div>
              <button className="up-btn" onClick={() => setConfirm(false)} disabled={sending}>Yo&apos;q</button>
              <button className="up-btn up-btn-danger" onClick={send} disabled={sending}>
                {sending ? <><i className="fa-solid fa-spinner fa-spin" /> Yuklanmoqda...</> : "Ha, almashtirish"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
