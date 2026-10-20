"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { downloadBlob } from "./useClock";

/** Brauzerlarning canvas chegarasi (Chrome ~16384 px tomon) — undan oshsa rasm bo'sh chiqadi */
const MAX_CANVAS_SIDE = 16000;
/** A4 albomning chop etiladigan kengligi (297 mm − 2 × 8 mm chekka) CSS px'da */
const PRINT_WIDTH_PX = Math.round(((297 - 16) / 25.4) * 96);
/** A4 albomning chop etiladigan balandligi (210 mm − 2 × 8 mm chekka) CSS px'da */
const PRINT_HEIGHT_PX = Math.round(((210 - 16) / 25.4) * 96);

type Opts = {
  /** Yuklanadigan PNG nomi (bosilgan paytdagi sana bilan) */
  fileName: () => string;
  /** Rasm olinayotganda sahifa shu kenglikda "chiziladi" (media query'lar uchun); berilmasa — hisobotning to'liq kengligi */
  windowWidth?: number;
  background?: string;
  maxScale?: number;
  /**
   * "Chop etish" — hisobot rasmga olinib, aynan shuncha A4 albom sahifaga sig'diriladi (joylashuvdan qat'i nazar).
   * `[data-print-skip]` — pechatga tushmaydi; `[data-print-page="N"]` — N-sahifada (belgisizlari — 1-sahifada).
   * Berilmasa — oddiy `window.print()` va `--print-zoom`.
   */
  printPages?: number;
  /**
   * Oddiy (matnli) pechat, aniq sahifalarga bo'lingan: `beforeprint` da hisobotga `print-mode` klassi qo'yiladi
   * (pechat tartibi — A4 kengligida, CSS'da), `[data-print-page="N"]` dan oldin yangi sahifa; har bir sahifa
   * o'lchanib, sig'maydigani `--pN-zoom` bilan kichraytiriladi.
   */
  pagedPrint?: boolean;
};

/** Hisobot ichidagi eng keng element (scroll ichidagi jadval ham hisobga olinadi) */
function contentWidth(el: HTMLElement) {
  let w = el.scrollWidth;
  el.querySelectorAll("table").forEach((t) => (w = Math.max(w, t.scrollWidth)));
  return w;
}

type H2C = typeof import("html2canvas").default;

/** Nusxa `windowWidth` kenglikda joylashadi; scale canvas chegarasidan oshmaydi */
async function renderCanvas(el: HTMLElement, o: { windowWidth?: number; background: string; maxScale: number; ignore?: (n: Element) => boolean }) {
  const w = contentWidth(el);
  const ww = o.windowWidth ?? Math.max(w, window.innerWidth);
  const scale = Math.max(0.5, Math.min(o.maxScale, MAX_CANVAS_SIDE / Math.max(w, ww, el.scrollHeight, 1)));
  const html2canvas: H2C = (await import("html2canvas")).default;
  return html2canvas(el, { scale, backgroundColor: o.background, useCORS: true, logging: false, windowWidth: ww, ignoreElements: o.ignore });
}

/** Bir nechta canvas — ustma-ust bitta canvas'ga */
function stackCanvases(list: HTMLCanvasElement[], background: string) {
  if (list.length === 1) return list[0];
  const gap = 24;
  const out = document.createElement("canvas");
  out.width = Math.max(...list.map((c) => c.width));
  out.height = list.reduce((h, c) => h + c.height, 0) + gap * (list.length - 1);
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);
  let y = 0;
  for (const c of list) {
    ctx.drawImage(c, 0, y);
    y += c.height + gap;
  }
  return out;
}

const pageOf = (n: Element) => (n instanceof HTMLElement ? n.dataset.printPage : undefined);

/**
 * Barcha hisobot sahifalari uchun umumiy "Rasm" (PNG) va "Chop etish".
 *  - Rasm: `capturing` paytida sahifa scroll/sticky'siz to'liq holatga o'tadi (har bir bo'lim CSS'ida `.capturing`),
 *    scale canvas chegarasidan oshmaydigan qilib tanlanadi — juda keng jadval ham kesilmaydi.
 *  - Chop etish (`printPages` bilan): hisobot rasmga olinib, aniq N ta sahifaga sig'diriladi (.rpt-print-sheet).
 *  - Chop etish (oddiy) / Ctrl+P: `--print-zoom` (hisobot kengligi → A4 albom kengligi) o'rnatiladi; `.print-fit` klassli
 *    hisobot pechatda sahifaga sig'diriladi. Ctrl+P bosilganda ham ishlaydi.
 */
export function useReportCapture(ref: RefObject<HTMLElement | null>, opts: Opts) {
  const [capturing, setCapturing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const { fileName, windowWidth, background = "#ffffff", maxScale = 2, printPages, pagedPrint = false } = opts;

  const saveImage = useCallback(async () => {
    const el = ref.current;
    if (!el || busy) return;
    setBusy(true);
    setError(null);
    setCapturing(true);
    document.documentElement.classList.add("rpt-capturing"); // TV masshtabi o'chadi (globals.css)
    // Scroll va sticky o'chirilgan holat chizilishini kutish
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      // html2canvas sahifani `windowWidth` kenglikdagi nusxada qayta joylaydi (telefonda ham to'liq ko'rinish)
      const canvas = await renderCanvas(el, { windowWidth, background, maxScale });
      await new Promise<void>((resolve, reject) =>
        canvas.toBlob((b) => (b ? (downloadBlob(b, fileName()), resolve()) : reject(new Error("canvas"))), "image/png")
      );
    } catch (e) {
      console.error("Rasm xatolik:", e);
      setError("Rasmni saqlab bo'lmadi.");
    } finally {
      document.documentElement.classList.remove("rpt-capturing");
      setCapturing(false);
      setBusy(false);
    }
  }, [ref, busy, fileName, windowWidth, background, maxScale]);

  useEffect(() => {
    const before = () => {
      const el = ref.current;
      if (!el) return;
      if (!pagedPrint) {
        el.style.setProperty("--print-zoom", String(Math.min(1, PRINT_WIDTH_PX / Math.max(contentWidth(el), 1))));
        return;
      }
      el.classList.add("print-mode");
      // Sahifa chegaralari: hisobot boshi, har bir [data-print-page] boshi, hisobot oxiri
      const box = el.getBoundingClientRect();
      const marks = [...el.querySelectorAll<HTMLElement>("[data-print-page]")]
        .sort((a, b) => Number(a.dataset.printPage) - Number(b.dataset.printPage))
        .map((m) => m.getBoundingClientRect().top);
      const edges = [box.top, ...marks, box.bottom];
      for (let i = 0; i < edges.length - 1; i++) {
        // 0.96 — yaxlitlash va brauzer farqlari uchun zaxira
        const zoom = Math.min(1, (PRINT_HEIGHT_PX * 0.96) / Math.max(1, edges[i + 1] - edges[i]));
        el.style.setProperty(`--p${i + 1}-zoom`, zoom.toFixed(3));
      }
    };
    const after = () => {
      const el = ref.current;
      if (!el) return;
      el.style.removeProperty("--print-zoom");
      el.classList.remove("print-mode");
      for (let i = 1; i <= 9; i++) el.style.removeProperty(`--p${i}-zoom`);
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [ref, pagedPrint]);

  const print = useCallback(async () => {
    const el = ref.current;
    if (!printPages || !el) return window.print();
    if (printing || busy) return;
    setPrinting(true);
    setError(null);
    setCapturing(true);
    document.documentElement.classList.add("rpt-capturing");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    let sheet: HTMLDivElement | null = null;
    try {
      const skip = (n: Element) => n.hasAttribute("data-print-skip");
      const o = { windowWidth, background, maxScale };
      const pages: HTMLCanvasElement[] = [
        // 1-sahifa: hisobot, boshqa sahifalarga belgilangan bloklarsiz
        await renderCanvas(el, { ...o, ignore: (n) => skip(n) || (!!pageOf(n) && pageOf(n) !== "1") }),
      ];
      for (let p = 2; p <= printPages; p++) {
        const parts = [...el.querySelectorAll<HTMLElement>(`[data-print-page="${p}"]`)];
        if (!parts.length) continue;
        const canvases = [];
        for (const part of parts) canvases.push(await renderCanvas(part, { ...o, ignore: skip }));
        pages.push(stackCanvases(canvases, background));
      }
      sheet = document.createElement("div");
      sheet.className = "rpt-print-sheet";
      const imgs = pages.map((c) => {
        const img = document.createElement("img");
        img.src = c.toDataURL("image/png");
        sheet!.appendChild(img);
        return img;
      });
      document.body.appendChild(sheet);
      await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
    } catch (e) {
      console.error("Chop etish xatolik:", e);
      setError("Chop etish uchun tayyorlab bo'lmadi.");
      sheet?.remove();
      sheet = null;
    } finally {
      document.documentElement.classList.remove("rpt-capturing");
      setCapturing(false);
      setPrinting(false);
    }
    if (!sheet) return;
    const done = () => sheet?.remove();
    window.addEventListener("afterprint", done, { once: true });
    window.print();
    // afterprint kelmaydigan brauzerlar uchun
    setTimeout(done, 60_000);
  }, [ref, printPages, printing, busy, windowWidth, background, maxScale]);

  return { capturing, busy, printing, error, clearError: () => setError(null), saveImage, print };
}
