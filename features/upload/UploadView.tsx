"use client";

import { useRef, useState } from "react";
import { useData } from "@/components/DataProvider";
import { UPLOAD_TARGETS, parseWorkbook, type ParsedSheet, type UploadSection, type UploadTarget, type CellValue } from "@/lib/upload-targets";

/**
 * "Bazaga yuklash" (faqat superadmin): har bir bo'lim uchun alohida .xlsx.
 * Fayl avval brauzerda tekshiriladi va ko'rsatiladi, tasdiqlangach serverga yuboriladi —
 * server qayta tekshirib, Google Sheets'dagi varaqlarni to'liq almashtiradi.
 */
export default function UploadView() {
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
    </div>
  );
}

type Result = { ok: boolean; text: string } | null;

const show = (v: CellValue) => (typeof v === "object" ? v.$date.replace("T00:00:00", "").replace("T", " ") : String(v));

function UploadCard({ target }: { target: UploadTarget }) {
  const { refresh } = useData();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedSheet[] | null>(null);
  const [reading, setReading] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<Result>(null);

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
                <span className="up-count">{(p.values.length - 1).toLocaleString()} qator · {p.values[0].length} ustun</span>
              </div>
              <div className="up-table-wrap">
                <table className="up-table">
                  <thead>
                    <tr>{p.values[0].map((h, i) => <th key={i}>{show(h)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {p.values.slice(1, 11).map((r, ri) => (
                      <tr key={ri}>{r.map((v, ci) => <td key={ci}>{show(v)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {p.values.length > 11 && <div className="up-more">… va yana {(p.values.length - 11).toLocaleString()} qator</div>}
            </div>
          ))}
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
