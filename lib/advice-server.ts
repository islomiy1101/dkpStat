import { config } from "./config";
import { MOCK } from "./mock";
import { cached } from "./cache";
import { fetchGviz, type GvizTable } from "./gviz";
import { normalizeName, isSuperAdminTuman } from "./session";
import { isGlobal, sameBranch } from "./roles";
import type { AppUser } from "./auth";
import { TUMANLAR } from "@/features/advice/utils";
import type { AdviceData, AdviceSessionInfo, Murojaat, Natija } from "./types";

type Raw = { murojaat: GvizTable; mahalla: GvizTable; users: GvizTable };

/** Uchala varaq PARALLEL olinadi va qisqa muddat barcha foydalanuvchilar uchun umumiy keshlanadi */
export function loadAdviceRaw(fresh = false) {
  return cached<Raw>(
    "advice:raw",
    config.cacheTtlMs,
    async () => {
      const [murojaat, mahalla, users] = await Promise.all([
        fetchGviz(config.adviceSheetId, "Murojaatlar"),
        fetchGviz(config.adviceSheetId, "Mahallalar"),
        fetchGviz(config.adviceSheetId, "Foydalanuvchilar"),
      ]);
      return { murojaat, mahalla, users };
    },
    { fresh }
  );
}

/**
 * Advice bo'limi alohida login'siz ishlaydi: "sessiya" sayt foydalanuvchisidan quriladi.
 * Umumiy rollar "Boshqarma" rejimida (hamma tumanlar, faqat ko'rish), qolganlari o'z tumanida.
 */
export function adviceSessionFor(u: AppUser): AdviceSessionInfo {
  const tuman = isGlobal(u.role) ? "Boshqarma" : TUMANLAR.find((t) => sameBranch(t, u.branch)) || u.branch;
  return { tuman, fio: u.fullName, loginTime: u.loginTime };
}

/** Original myjs.js -> loadDashboardData() parsing mantiqi, sessiya tumani bo'yicha filtrlangan */
export function buildAdviceData(raw: Raw, sessionTuman: string): AdviceData {
  const isUserBoshqarma = isSuperAdminTuman(sessionTuman);

  // Mas'ul xodimlar (login/parol ustunlari tashlab yuboriladi)
  const masullar: Record<string, string> = {};
  for (const r of raw.users.table?.rows || []) {
    const c = r.c;
    if (!c) continue;
    const uTuman = c[2] && c[2].v ? String(c[2].v).trim() : "";
    const uFio = c[3] && c[3].v ? String(c[3].v).trim() : "";
    const uLavozim = c[4] && c[4].v ? String(c[4].v).trim() : "";
    const uTel = c[5] && c[5].v ? String(c[5].v).trim() : "";
    if (normalizeName(uTuman) === "tuman" || normalizeName(uFio) === "fio") continue;
    if (uTuman && uFio) {
      let t = uFio.toUpperCase();
      if (uLavozim) t += "\n" + uLavozim;
      if (uTel) t += "\n" + uTel;
      masullar[normalizeName(uTuman)] = t;
    }
  }

  // Murojaatlar
  const murojaatlar: Murojaat[] = [];
  (raw.murojaat.table?.rows || []).forEach((r, idx) => {
    const c = r.c;
    if (!c) return;
    const rawId = c[0] ? (c[0].v !== undefined ? c[0].v : c[0].f) : null;
    const rawFio = c[3] ? (c[3].v !== undefined && c[3].v !== null ? String(c[3].v).trim() : "") : "";
    const rawTuman = c[4] ? (c[4].v !== undefined && c[4].v !== null ? String(c[4].v).trim() : "") : "";

    if (rawId === "Tartib raqam" || rawFio === "Fuqaro F.I.O" || normalizeName(rawTuman) === "tumani") return;
    if (!rawId && !rawFio) return;
    const rowId = Number(rawId);
    if (isNaN(rowId) && !rawFio) return;

    const rowTuman = rawTuman || "Mavjud emas";
    if (!(isUserBoshqarma || sameBranch(rowTuman, sessionTuman))) return;

    let natija: Natija = "";
    if (c[10] && c[10].v == 1) natija = "ijobiy";
    else if (c[11] && c[11].v == 1) natija = "filial";
    else if (c[12] && c[12].v == 1) natija = "vakolatsiz";

    const fmt = (i: number) => (c[i] ? c[i]!.f || (c[i]!.v ? String(c[i]!.v) : "") : "");
    murojaatlar.push({
      rowNum: idx + 2,
      id: !isNaN(rowId) && rowId > 0 ? rowId : idx + 1,
      shaxsTuri: c[1] && c[1].v ? (c[1].v as number) : 2,
      tel: c[2] && c[2].v ? String(c[2].v) : "",
      fio: rawFio || "Mavjud emas",
      tuman: rowTuman,
      manzil: c[5] && c[5].v ? String(c[5].v) : "Mavjud emas",
      keldi: fmt(6),
      ketdi: fmt(7),
      maqsad: c[8] && c[8].v ? String(c[8].v) : "Mavjud emas",
      sana: fmt(9),
      ijobiy: c[10] ? c[10].v ?? "" : "",
      filial: c[11] ? c[11].v ?? "" : "",
      vakolatsiz: c[12] ? c[12].v ?? "" : "",
      natija,
    });
  });
  murojaatlar.sort((a, b) => Number(b.id) - Number(a.id));

  // Mahallalar
  const mahallalar: string[] = [];
  for (const r of raw.mahalla.table?.rows || []) {
    const c = r.c;
    if (!c) continue;
    const col0 = c[0] && c[0].v ? String(c[0].v).trim() : "";
    const col1 = c[1] && c[1].v ? String(c[1].v).trim() : "";
    const col2 = c[2] && c[2].v ? String(c[2].v).trim() : "";
    const mTuman = col2 ? col1 : col1 ? col0 : "";
    const mNomi = col2 || col1 || "";
    if (normalizeName(mTuman).includes("tuman") && normalizeName(mNomi).includes("mahalla")) continue;
    if (mNomi && (isUserBoshqarma || sameBranch(mTuman, sessionTuman))) {
      mahallalar.push(mNomi);
    }
  }

  return { murojaatlar, mahallalar, masullar };
}

/** Apps Script Web App'ga POST (text/plain — CORS preflight'siz, original bilan bir xil) */
export async function callAppsScript(payload: Record<string, unknown>) {
  if (MOCK) {
    const d = new Date();
    return { success: true, message: "Murojaat muvaffaqiyatli saqlandi! (demo)", vaqt: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` };
  }
  if (!config.adviceAppsScriptUrl) return { success: false, message: "ADVICE_APPS_SCRIPT_URL sozlanmagan" };
  try {
    const res = await fetch(config.adviceAppsScriptUrl, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: "Tarmoq xatosi yuz berdi!" };
  }
}
