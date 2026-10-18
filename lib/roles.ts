import type { SectionId } from "./sections";

/**
 * Rollar va ruxsatlar matritsasi — bitta joyda. Server ham, klient ham shu yerdan foydalanadi.
 *  - qaysi bo'limlar ko'rinadi (ACCESS)
 *  - ma'lumot doirasi: umumiy (isGlobal) yoki faqat o'z filiali
 */
export const ROLES = ["engineer", "advicer", "accountant", "branchManager", "headOfDepartment", "superadmin"] as const;
export type Role = (typeof ROLES)[number];

/** Sidebar'dagi barcha sahifalar: ma'lumot bo'limlari + admin sahifalari */
export type AreaId = SectionId | "logs" | "upload";

const ACCESS: Record<Role, readonly AreaId[]> = {
  engineer: ["payment"],
  advicer: ["advice"],
  accountant: ["payment"],
  branchManager: ["deadline", "payment", "advice"],
  headOfDepartment: ["deadline", "payment", "advice"],
  superadmin: ["deadline", "payment", "advice", "logs", "upload"],
};

const GLOBAL: readonly Role[] = ["accountant", "headOfDepartment", "superadmin"];

export const ROLE_LABEL: Record<Role, string> = {
  engineer: "Muhandis",
  advicer: "Maslahatchi",
  accountant: "Buxgalter",
  branchManager: "Filial rahbari",
  headOfDepartment: "Bo'lim boshlig'i",
  superadmin: "Superadmin",
};

export const canSee = (role: Role, id: AreaId) => ACCESS[role].includes(id);

/** Umumiy (viloyat bo'yicha) ma'lumotni ko'radigan rollar; qolganlari faqat o'z filialini */
export const isGlobal = (role: Role) => GLOBAL.includes(role);

const HREF: Record<AreaId, string> = {
  deadline: "/deadline",
  payment: "/payment",
  advice: "/advice",
  logs: "/logs",
  upload: "/upload",
};
export const firstAllowedHref = (role: Role) => HREF[ACCESS[role][0]];

const ALIASES: Record<string, Role> = {
  engineer: "engineer",
  muhandis: "engineer",
  user: "engineer", // eski "user" roli — eng kam huquq
  advicer: "advicer",
  adviser: "advicer",
  advisor: "advicer",
  maslahatchi: "advicer",
  accountant: "accountant",
  buxgalter: "accountant",
  branchmanager: "branchManager",
  filialrahbari: "branchManager",
  headofdepartment: "headOfDepartment",
  bolimboshligi: "headOfDepartment",
  superadmin: "superadmin",
  admin: "superadmin", // eski "admin" roli
};

/** Users varag'idagi Role qiymatini o'qish ("Head of Department", "branch_manager" ham bo'ladi) */
export function parseRole(raw: unknown): Role {
  const key = String(raw ?? "").toLowerCase().replace(/[\s_\-'`ʻ’‘]/g, "");
  return ALIASES[key] || "engineer";
}

/**
 * Filial nomini solishtirish kaliti: "Chust tumani filiali" va "Chust tumani" bir xil kalit beradi.
 * Faqat "filiali" qo'shimchasi olinadi — "Namangan shahar" va "Namangan tumani" farqlanib qolishi kerak.
 */
export function branchKey(name: unknown) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[`'ʻ’‘\s]/g, "")
    .replace(/filiali?$/, "");
}

export const sameBranch = (a: unknown, b: unknown) => {
  const ka = branchKey(a);
  return ka !== "" && ka === branchKey(b);
};
