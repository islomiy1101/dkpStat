/**
 * Sidebar bo'limlari. Har bir bo'lim alohida ma'lumot manbasiga bog'langan.
 * Yangi bo'lim qo'shish: shu yerga yozuv + features/<id>/ + app/(dashboard)/<id>/page.tsx
 * + DataProvider'dagi FETCHERS ga bitta funksiya.
 */
export const SECTIONS = [
  {
    id: "deadline",
    href: "/deadline",
    title: "Rollar kesimida tahlil",
    subtitle: "Arizalar muddati · Свод",
    icon: "fa-solid fa-chart-line",
    source: "Django API",
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
    title: "Maslahat burchagi",
    subtitle: "Murojaatlar monitoringi",
    icon: "fa-solid fa-comments",
    source: "Google Sheets + Apps Script",
  },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];
