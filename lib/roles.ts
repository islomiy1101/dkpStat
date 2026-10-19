import type { SectionId } from "./sections";

/**
 * Rollar va ruxsatlar matritsasi — bitta joyda. Server ham, klient ham shu yerdan foydalanadi.
 *  - qaysi bo'limlar ko'rinadi (ACCESS)
 *  - har bir bo'limda ma'lumot doirasi (SCOPE): viloyat bo'yicha yoki faqat o'z filiali
 */
export const ROLES = ["engineer", "advicer", "accountant", "branchManager", "headOfDepartment", "reception", "registrator", "superadmin"] as const;
export type Role = (typeof ROLES)[number];

/** Sidebar'dagi barcha sahifalar: ma'lumot bo'limlari + admin sahifalari */
/** Ma'lumot bo'limlari + admin sahifalari + RegTest (registrator testi — DataProvider'ga bog'lanmagan) */
export type AreaId = SectionId | "logs" | "upload" | "regtest";

const ACCESS: Record<Role, readonly AreaId[]> = {
  engineer: ["payment"],
  advicer: ["advice"],
  accountant: ["payment"],
  branchManager: ["deadline", "etirof", "xatlov", "payment", "advice", "reception"],
  headOfDepartment: ["deadline", "etirof", "xatlov", "payment", "advice", "reception"],
  reception: ["reception"],
  /** Faqat RegTest — boshqa hech bir bo'lim ko'rinmaydi */
  registrator: ["regtest"],
  superadmin: ["deadline", "etirof", "xatlov", "payment", "advice", "reception", "regtest", "logs", "upload"],
};

/** Bo'lim bo'yicha ma'lumot doirasi: "region" — viloyat bo'yicha to'liq, "branch" — faqat o'z filiali */
type Scope = "region" | "branch";
const SCOPE: Record<Role, Partial<Record<SectionId, Scope>>> = {
  engineer: { payment: "branch" },
  advicer: { advice: "branch" },
  accountant: { payment: "region" },
  branchManager: { deadline: "region", etirof: "region", xatlov: "region", payment: "region", advice: "branch", reception: "branch" },
  headOfDepartment: { deadline: "region", etirof: "region", xatlov: "region", payment: "region", advice: "region", reception: "region" },
  reception: { reception: "branch" },
  registrator: {},
  superadmin: { deadline: "region", etirof: "region", xatlov: "region", payment: "region", advice: "region", reception: "region" },
};

export const ROLE_LABEL: Record<Role, string> = {
  engineer: "Muhandis",
  advicer: "Maslahatchi",
  accountant: "Buxgalter",
  branchManager: "Filial rahbari",
  headOfDepartment: "Bo'lim boshlig'i",
  reception: "Qabulxona",
  registrator: "Registrator",
  superadmin: "Superadmin",
};

export const canSee = (role: Role, id: AreaId) => ACCESS[role].includes(id);

/** Shu bo'limda viloyat bo'yicha to'liq ma'lumot ko'radimi; aks holda faqat o'z filialini */
export const isGlobalIn = (role: Role, id: SectionId) => SCOPE[role][id] === "region";

const HREF: Record<AreaId, string> = {
  deadline: "/deadline",
  etirof: "/etirof",
  xatlov: "/xatlov",
  payment: "/payment",
  advice: "/advice",
  reception: "/reception",
  logs: "/logs",
  upload: "/upload",
  regtest: "/regtest/test",
};
export const firstAllowedHref = (role: Role) => HREF[ACCESS[role][0]];

const ALIASES: Record<string, Role> = {
  engineer: "engineer",
  muhandis: "engineer",
  муҳандис: "engineer",
  мухандис: "engineer",
  user: "engineer", // eski "user" roli — eng kam huquq
  advicer: "advicer",
  adviser: "advicer",
  advisor: "advicer",
  maslahatchi: "advicer",
  консультант: "advicer",
  маслаҳатчи: "advicer",
  accountant: "accountant",
  buxgalter: "accountant",
  бухгалтер: "accountant",
  branchmanager: "branchManager",
  filialrahbari: "branchManager",
  manager: "branchManager",
  rahbar: "branchManager",
  headofdepartment: "headOfDepartment",
  headofdept: "headOfDepartment",
  departmenthead: "headOfDepartment",
  head: "headOfDepartment",
  bolimboshligi: "headOfDepartment",
  reception: "reception",
  receptionist: "reception",
  qabulxona: "reception",
  resepshn: "reception",
  ресепшн: "reception",
  қабулхона: "reception",
  registrator: "registrator",
  registr: "registrator",
  регистратор: "registrator",
  royxatdanotkazuvchi: "registrator",
  royxatgaoluvchi: "registrator",
  рўйхатданўтказувчи: "registrator",
  superadmin: "superadmin",
  admin: "superadmin", // eski "admin" roli
};

/** Users varag'idagi Role qiymatini o'qish ("Head of Department", "branch_manager" ham bo'ladi) */
export function parseRole(raw: unknown): Role {
  const key = String(raw ?? "")
    .toLowerCase()
    .replace(/^\s*the\s+/, "") // "The head of department"
    .replace(/[\s_\-'`ʻ’‘.]/g, "");
  const role = ALIASES[key];
  if (role) return role;
  // Jim fallback rollar ishlamayotganini yashirib qo'yardi — log'da ko'rinsin
  console.warn("[roles] noma'lum rol, engineer deb olindi:", JSON.stringify(raw ?? null));
  return "engineer";
}

/**
 * Filial nomini solishtirish kaliti: "Chust tumani filiali", "Chust tuman filiali" va "Chust tumani"
 * bir xil kalit beradi. Tuman/shahar farqi saqlanadi — "Namangan shahar" va "Namangan tumani" boshqa-boshqa.
 */
export function branchKey(name: unknown) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[`'ʻ’‘ʼ\s.\-]/g, "")
    .replace(/filiali?$/, "")
    .replace(/(tumani|tuman)$/, "tuman")
    .replace(/(shahri|shahar)$/, "shahar");
}

export const sameBranch = (a: unknown, b: unknown) => {
  const ka = branchKey(a);
  return ka !== "" && ka === branchKey(b);
};
