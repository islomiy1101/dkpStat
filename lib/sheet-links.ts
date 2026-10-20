import { config } from "./config";
import { authSpreadsheetId } from "./auth-server";
import { DEADLINE_LISTS, DEADLINE_LIST_IDS } from "@/features/deadline/source";
import { ETIROF_PAGES, ETIROF_PAGE_IDS } from "@/features/etirof/config";
import { KADR_SHEET } from "@/features/kadr/model";

/**
 * "Bazaga yuklash" sahifasidagi Google Sheets havolalari (faqat superadmin ko'radi).
 * ID'lar .env'dan olinadi (Users/Logs jadvali — Apps Script'dan ham); topilmagani "sozlanmagan" deb ko'rsatiladi.
 */
export type SheetLink = { group: string; title: string; icon: string; sheets: string[]; url: string | null };

const url = (id: string) => (id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null);

export async function sheetLinks(): Promise<SheetLink[]> {
  const authId = await authSpreadsheetId();
  return [
    {
      group: "Bazaga yuklanadigan",
      title: "Kadrlar statistikasi",
      icon: "fa-solid fa-people-group",
      sheets: [KADR_SHEET],
      url: url(config.kadrSheetId),
    },
    {
      group: "Bazaga yuklanadigan",
      title: "To'lov va tushumlar",
      icon: "fa-solid fa-money-bill-wave",
      sheets: ["TolovBaza", config.paymentSheetMain, config.paymentSheetPlan],
      url: url(config.paymentSheetId),
    },
    {
      group: "Bazaga yuklanadigan",
      title: "Rollar kesimida tahlil",
      icon: "fa-solid fa-chart-line",
      sheets: DEADLINE_LIST_IDS.map((id) => DEADLINE_LISTS[id].sheet),
      url: url(config.deadlineSheetId),
    },
    ...ETIROF_PAGE_IDS.map((id) => ({
      group: "E'tirof",
      title: ETIROF_PAGES[id].title,
      icon: ETIROF_PAGES[id].icon,
      sheets: [ETIROF_PAGES[id].svodSheet, ...ETIROF_PAGES[id].rawSheets],
      url: url(config.etirofSheets[id]),
    })),
    {
      group: "Boshqa",
      title: "Xatlov+Faol",
      icon: "fa-solid fa-map-location-dot",
      sheets: ["ШТАБ маълумоти", "Кунлик"],
      url: url(config.xatlovSheetId),
    },
    {
      group: "Boshqa",
      title: "Maslahat burchagi",
      icon: "fa-solid fa-comments",
      sheets: ["Murojaatlar", "Mahallalar", "Foydalanuvchilar"],
      url: url(config.adviceSheetId),
    },
    {
      group: "Boshqa",
      title: "Registratsiya testi",
      icon: "fa-solid fa-clipboard-question",
      sheets: ["Тест саволлари", "Натижалар"],
      url: url(config.regtestSheetId),
    },
    {
      group: "Boshqa",
      title: "Filial qabulxonasi",
      icon: "fa-solid fa-id-card",
      sheets: ["Apps Script orqali"],
      url: url(config.receptionSheetId),
    },
    {
      group: "Boshqa",
      title: "Foydalanuvchilar va Log",
      icon: "fa-solid fa-users-gear",
      sheets: ["Users", "Logs", "UploadLogs"],
      url: url(authId),
    },
  ];
}
