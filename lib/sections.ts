/**
 * Sidebar bo'limlari. Har bir bo'lim alohida ma'lumot manbasiga bog'langan.
 * Yangi bo'lim qo'shish: shu yerga yozuv + features/<id>/ + app/(dashboard)/<id>/page.tsx
 * + DataProvider'dagi FETCHERS ga bitta funksiya.
 */
import { DEADLINE_LISTS, DEADLINE_LIST_IDS } from "@/features/deadline/source";
import { ETIROF_PAGES, ETIROF_PAGE_IDS } from "@/features/etirof/config";

const DEADLINE_CHILDREN: { href: string; title: string; icon: string }[] = [
  ...DEADLINE_LIST_IDS.map((id) => ({ href: `/deadline/${id}`, title: DEADLINE_LISTS[id].title, icon: DEADLINE_LISTS[id].icon })),
  // UZKAD bazasidan tumanlar kesimidagi muddat buzilish SVOD'i (features/muddat)
  { href: "/deadline/muddat", title: "Muddat buzilish", icon: "fa-solid fa-calendar-xmark" },
];

export const SECTIONS = [
  {
    id: "kadr",
    href: "/kadr",
    title: "Kadrlar statistikasi",
    subtitle: "Shtat · xodimlar · vakantlar",
    icon: "fa-solid fa-people-group",
    source: "Google Sheets (Bazaga yuklash)",
  },
  {
    id: "deadline",
    href: "/deadline",
    title: "Rollar kesimida tahlil",
    subtitle: "Arizalar muddati · Свод",
    icon: "fa-solid fa-chart-line",
    source: "Google Sheets",
    /** Sidebar'da ochiladigan bo'limchalar (bir xil ko'rinish, har biri o'z varag'idan) */
    children: DEADLINE_CHILDREN,
  },
  {
    id: "etirof",
    href: "/etirof",
    title: "E'tirof",
    subtitle: "Эътироф тизими · Свод",
    icon: "fa-solid fa-award",
    source: "Google Sheets",
    children: ETIROF_PAGE_IDS.map((id) => ({ href: `/etirof/${id}`, title: ETIROF_PAGES[id].title, icon: ETIROF_PAGES[id].icon })),
  },
  {
    id: "xatlov",
    href: "/xatlov",
    title: "Xatlov+Faol",
    subtitle: "ШТАБ маълумоти · ЎРҚ-937",
    icon: "fa-solid fa-map-location-dot",
    source: "Google Sheets",
  },
  {
    id: "payment",
    href: "/payment",
    title: "To'lov va tushumlar",
    subtitle: "To'lov kutilayotgan arizalar",
    icon: "fa-solid fa-money-bill-wave",
    source: "Google Sheets",
  },
  {
    id: "advice",
    href: "/advice",
    title: "DXM Maslahat burchagi",
    subtitle: "Murojaatlar monitoringi",
    icon: "fa-solid fa-comments",
    source: "Google Sheets + Apps Script",
  },
  {
    id: "reception",
    href: "/reception",
    title: "Filial qabulxonasi",
    subtitle: "Murojaatchilarni ro'yxatga olish",
    icon: "fa-solid fa-id-card",
    source: "Apps Script",
  },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];
