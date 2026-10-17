import type { Murojaat } from "@/lib/types";

export const TUMANLAR = [
  "Namangan shahar", "Davlatobod tumani", "Yangi Namangan tumani", "Mingbuloq tumani", "Kosonsoy tumani",
  "Namangan tumani", "Norin tumani", "Pop tumani", "To'raqo'rg'on tumani", "Uychi tumani",
  "Uchqo'rg'on tumani", "Chortoq tumani", "Chust tumani", "Yangiqo'rg'on tumani",
];

export const ITEMS_PER_PAGE = 7;
export const SESSION_TIMEOUT = 10_800_000; // 3 soat

export function normalizeName(str: unknown) {
  if (!str) return "";
  return String(str).toLowerCase().replace(/[`'ʻ’‘\s]/g, "").trim();
}

export function isSuperAdmin(tuman: string) {
  const n = normalizeName(tuman);
  return n === "boshqarma" || n === "superadmin";
}

export function formatFioTitleCase(str: unknown) {
  if (!str) return "";
  return String(str)
    .trim()
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === "o'g'li" || lower === "o‘g‘li" || lower === "oʻgʻli" || lower === "qizi") return lower;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

const CYR: Record<string, string> = {
  А: "A", а: "a", Б: "B", б: "b", В: "V", в: "v", Г: "G", г: "g", Д: "D", д: "d", Е: "E", е: "e",
  Ё: "Yo", ё: "yo", Ж: "J", ж: "j", З: "Z", з: "z", И: "I", и: "i", Й: "Y", й: "y", К: "K", к: "k",
  Л: "L", л: "l", М: "M", м: "m", Н: "N", н: "n", О: "O", о: "o", П: "P", п: "p", Р: "R", р: "r",
  С: "S", с: "s", Т: "T", т: "t", У: "U", у: "u", Ф: "F", ф: "f", Х: "X", х: "x", Ц: "Ts", ц: "ts",
  // Originalda kichik "ч" uchun kalit xato yozilgan edi ('ch'), shu sababli o'girilmasdi — tuzatildi
  Ч: "Ch", ч: "ch", Ш: "Sh", ш: "sh", Щ: "Sh", щ: "sh", Ъ: "'", ъ: "'", Ы: "I", ы: "i", Ь: "", ь: "",
  Э: "E", э: "e", Ю: "Yu", ю: "yu", Я: "Ya", я: "ya", Ў: "O'", ў: "o'", Қ: "Q", қ: "q", Ғ: "G'", ғ: "g'",
  Ҳ: "H", ҳ: "h",
};
export const cyrillicToLatin = (text: string) => (text ? text.split("").map((ch) => (CYR[ch] !== undefined ? CYR[ch] : ch)).join("") : "");

export function parseLocalDate(dateStr: unknown) {
  if (!dateStr) return null;
  const parts = String(dateStr).trim().split(/[-.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  }
  return new Date(String(dateStr));
}

export const isIjobiy = (m: Murojaat) => m.natija === "ijobiy" || m.ijobiy == 1;
export const isFilial = (m: Murojaat) => m.natija === "filial" || m.filial == 1;
export const isVakolatsiz = (m: Murojaat) => m.natija === "vakolatsiz" || m.vakolatsiz == 1;

/** Bir kunda takrorlangan fuqaroning faqat bitta (eng yangi) murojaati */
export function getLatestDailyAppeals(list: Murojaat[], forExportOnly = false) {
  let src = list;
  if (forExportOnly) {
    src = list.filter((item) => {
      const k = item.ketdi ? String(item.ketdi).trim() : "";
      const hasKetdi = k !== "" && k !== "-";
      return hasKetdi && (item.natija === "ijobiy" || item.natija === "filial" || item.natija === "vakolatsiz" || item.ijobiy == 1 || item.filial == 1 || item.vakolatsiz == 1);
    });
  }
  const map = new Map<string, Murojaat>();
  for (const item of src) {
    const sana = item.sana ? String(item.sana).trim() : "";
    const tel = item.tel ? String(item.tel).replace(/\D/g, "") : "";
    const fio = item.fio ? normalizeName(item.fio) : "";
    const key = `${sana}_${tel.length >= 7 ? tel : fio}`;
    if (!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
}

export { getUserLocation } from "@/lib/geo";
