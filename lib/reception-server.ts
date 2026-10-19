import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { MOCK } from "./mock";
import { cached } from "./cache";
import { isGlobalIn, sameBranch } from "./roles";
import { isSuperAdminTuman } from "./session";
import type { AppUser } from "./auth";
import { TUMANLAR } from "@/features/advice/utils";
import type { ReceptionData, ReceptionMurojaat, ReceptionSessionInfo } from "./types";

/**
 * "Filial qabulxonasi": jadval yopiq (gviz ishlamaydi) — o'qish ham, yozish ham Apps Script orqali
 * (apps-script/reception/Code.gs). Hamma tumanlar bitta "boshqarma" so'rovi bilan olinib,
 * qisqa muddat umumiy keshlanadi; tumanga filtr keshdan keyin.
 */

/* ---------- MOCK (MOCK_DATA=1): xotiradagi nusxa, yozuvlar ham shu yerda ---------- */
let mockData: ReceptionData | null = null;
async function mockStore() {
  if (!mockData) mockData = JSON.parse(await fs.readFile(path.join(process.cwd(), "mock", "reception_initial.json"), "utf8"));
  return mockData!;
}
const pad = (n: number) => String(n).padStart(2, "0");
const tashkentNow = () => new Date(Date.now() + 5 * 3600_000);
const hm = (d: Date) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;

async function mockCall(p: Record<string, unknown>): Promise<Record<string, unknown>> {
  const db = await mockStore();
  const d = tashkentNow();
  switch (p.action) {
    case "getInitialData":
      return { success: true, ...structuredClone(db) };
    case "searchByPassport": {
      const pass = String(p.passport || "").toUpperCase();
      const rows = db.murojaatlar.filter((m) => m.passport.toUpperCase() === pass);
      const first = rows[rows.length - 1];
      return { exists: !!first, data: first ? { fio: first.fio, tuman: first.tuman, manzil: first.manzil } : null, murojaatSoni: rows.length };
    }
    case "saveMurojaat": {
      const f = p.formData as Record<string, string>;
      const pass = String(f.passport || "Mavjud emas").toUpperCase();
      const nextId = Math.max(0, ...db.murojaatlar.map((m) => Number(m.id) || 0)) + 1;
      db.murojaatlar.unshift({
        rowNum: Math.max(1, ...db.murojaatlar.map((m) => m.rowNum)) + 1,
        id: String(nextId), passport: pass, fio: f.fio, tuman: f.tuman, manzil: f.manzil,
        keldi: hm(d), ketdi: "", maqsad: f.maqsad, qabulQildi: f.qabulQildi, lavozim: f.lavozim,
        sana: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
        qaytaMurojaat: db.murojaatlar.filter((m) => m.passport.toUpperCase() === pass).length + 1,
      });
      return { success: true, message: "Murojaat muvaffaqiyatli saqlandi! (demo)" };
    }
    case "setKetdiVaqti": {
      const m = db.murojaatlar.find((x) => x.rowNum === Number(p.rowNum));
      if (m) m.ketdi = hm(d);
      return { success: true, vaqt: hm(d) };
    }
    case "updateMurojaat": {
      const m = db.murojaatlar.find((x) => x.rowNum === Number(p.rowNum));
      if (m) Object.assign(m, { qabulQildi: p.qabulQildi, lavozim: p.lavozim });
      return { success: true, message: "Ma'lumot yangilandi!" };
    }
  }
  return { success: false, message: "Noma'lum amal" };
}

/* ---------- public ---------- */
export async function callReceptionScript(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (MOCK) return mockCall(payload);
  if (!config.receptionAppsScriptUrl || !config.receptionApiSecret) {
    return { success: false, message: "RECEPTION_APPS_SCRIPT_URL / RECEPTION_APPS_SCRIPT_SECRET sozlanmagan" };
  }
  try {
    const res = await fetch(config.receptionAppsScriptUrl, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...payload, secret: config.receptionApiSecret }),
      cache: "no-store",
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      console.error("[reception] Apps Script JSON qaytarmadi:", res.status, text.slice(0, 300));
      return { success: false, message: `Apps Script javobi noto'g'ri (HTTP ${res.status}). Deploy sozlamasini tekshiring.` };
    }
  } catch {
    return { success: false, message: "Tarmoq xatosi yuz berdi!" };
  }
}

export function loadReceptionRaw(fresh = false) {
  return cached<ReceptionData>(
    "reception:raw",
    config.cacheTtlMs,
    async () => {
      const r = await callReceptionScript({ action: "getInitialData", tuman: "boshqarma" });
      if (r.success === false) throw new Error(String(r.message || "Apps Script xatosi"));
      return {
        xodimlar: (r.xodimlar as ReceptionData["xodimlar"]) || [],
        murojaatlar: ((r.murojaatlar as ReceptionMurojaat[]) || []).map((m) => ({
          ...m,
          id: String(m.id),
          qaytaMurojaat: Number(m.qaytaMurojaat) || 1,
        })),
      };
    },
    { fresh }
  );
}

/** Viloyat doirasidagi rollar "Boshqarma" rejimida (hamma tumanlar), qolganlari o'z tumanida */
export function receptionSessionFor(u: AppUser): ReceptionSessionInfo {
  const tuman = isGlobalIn(u.role, "reception") ? "Boshqarma" : TUMANLAR.find((t) => sameBranch(t, u.branch)) || u.branch;
  return { tuman, fio: u.fullName };
}

export function scopeReception(raw: ReceptionData, tuman: string): ReceptionData {
  if (isSuperAdminTuman(tuman)) return raw;
  return {
    xodimlar: raw.xodimlar.filter((x) => sameBranch(x.tuman, tuman)),
    murojaatlar: raw.murojaatlar.filter((m) => sameBranch(m.tuman, tuman)),
  };
}
