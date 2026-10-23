import type { SectionId } from "./sections";

/**
 * Rollar va ruxsatlar matritsasi — bitta joyda. Server ham, klient ham shu yerdan foydalanadi.
 *  - qaysi bo'limlar ko'rinadi (ACCESS)
 *  - har bir bo'limda ma'lumot doirasi (SCOPE): viloyat bo'yicha yoki faqat o'z filiali
 */
export const ROLES = ["engineer", "advicer", "accountant", "branchManager", "headOfDepartment", "assistant", "reception", "registrator", "superadmin"] as const;
export type Role = (typeof ROLES)[number];

/** Sidebar'dagi barcha sahifalar: ma'lumot bo'limlari + admin sahifalari */
/** Ma'lumot bo'limlari + admin sahifalari + RegTest (registrator testi — DataProvider'ga bog'lanmagan) */
export type AreaId = SectionId | "logs" | "upload" | "regtest" | "users";

const ACCESS: Record<Role, readonly AreaId[]> = {
  // Rollar kesimida tahlil — faqat o'z tumani (SCOPE: branch)
  engineer: ["payment", "deadline"],
  advicer: ["advice"],
  accountant: ["payment"],
  // "kadr" birinchi — kirgandan keyin Kadrlar statistikasi ochiladi (firstAllowedHref)
  branchManager: ["kadr", "deadline", "etirof", "xatlov", "payment", "advice", "reception"],
  headOfDepartment: ["kadr", "deadline", "etirof", "xatlov", "payment", "advice", "reception"],
  /** Bo'lim boshlig'i bo'limlari + Bazaga yuklash */
  assistant: ["kadr", "deadline", "etirof", "xatlov", "payment", "advice", "reception", "upload"],
  reception: ["reception"],
  /** Faqat RegTest — boshqa hech bir bo'lim ko'rinmaydi */
  registrator: ["regtest"],
  superadmin: ["kadr", "deadline", "etirof", "xatlov", "payment", "advice", "reception", "regtest", "logs", "upload", "users"],
};

/** Bo'lim bo'yicha ma'lumot doirasi: "region" — viloyat bo'yicha to'liq, "branch" — faqat o'z filiali */
export type Scope = "region" | "branch";
const SCOPE: Record<Role, Partial<Record<SectionId, Scope>>> = {
  engineer: { payment: "branch", deadline: "branch" },
  advicer: { advice: "branch" },
  accountant: { payment: "region" },
  branchManager: { kadr: "branch", deadline: "region", etirof: "region", xatlov: "region", payment: "region", advice: "branch", reception: "branch" },
  headOfDepartment: { kadr: "region", deadline: "region", etirof: "region", xatlov: "region", payment: "region", advice: "region", reception: "region" },
  assistant: { kadr: "region", deadline: "region", etirof: "region", xatlov: "region", payment: "region", advice: "region", reception: "region" },
  reception: { reception: "branch" },
  registrator: {},
  superadmin: { kadr: "region", deadline: "region", etirof: "region", xatlov: "region", payment: "region", advice: "region", reception: "region" },
};

export const ROLE_LABEL: Record<Role, string> = {
  engineer: "Muhandis",
  advicer: "Maslahatchi",
  accountant: "Buxgalter",
  branchManager: "Filial rahbari",
  headOfDepartment: "Bo'lim boshlig'i",
  assistant: "Assistent",
  reception: "Qabulxona",
  registrator: "Registrator",
  superadmin: "Superadmin",
};

/* ---------- Xodimga alohida bo'limlar (Users varag'i, Areas ustuni) ---------- */

/**
 * Rol bo'limlariga qo'shimcha (+) yoki ulardan olib tashlangan (−) bo'lim — faqat shu xodim uchun.
 * Varaqda: "+payment:branch; +kadr:region; -advice". Superadmin uchun e'tiborga olinmaydi.
 */
export type AreaOverride = { id: AreaId; op: "+" | "-"; scope?: Scope };
/** Ruxsatlarni hisoblash uchun yetarli: rol + xodimga alohida bo'limlar (AppUser shunga mos keladi) */
export type Access = { role: Role; areas?: readonly AreaOverride[] };

/** Xodimga berish/olish mumkin bo'lgan bo'limlar ("users" va "logs" — faqat superadmin) */
export const ADDABLE_AREAS = ["kadr", "deadline", "etirof", "xatlov", "payment", "advice", "reception", "upload", "regtest"] as const satisfies readonly AreaId[];
export type AddableArea = (typeof ADDABLE_AREAS)[number];
/** Doirasi (filial/viloyat) tanlanadigan bo'limlar — ma'lumot bo'limlari */
const SCOPED_AREAS: readonly AreaId[] = ["kadr", "deadline", "etirof", "xatlov", "payment", "advice", "reception"];
export const isScopedArea = (id: AreaId): id is SectionId => SCOPED_AREAS.includes(id);
const isAddable = (id: string): id is AddableArea => (ADDABLE_AREAS as readonly string[]).includes(id);

/** Rolning o'z bo'limlari (alohida bo'limlarsiz) */
export const roleAreas = (role: Role): readonly AreaId[] => ACCESS[role];

/**
 * Ma'nosiz yozuvlarni tozalaydi: rolda bor bo'limga "+", rolda yo'q bo'limga "−", takrorlar.
 * Superadmin — har doim bo'sh.
 */
export function normalizeAreas(role: Role, areas: readonly AreaOverride[] | undefined): AreaOverride[] {
  if (role === "superadmin" || !areas?.length) return [];
  const base = ACCESS[role];
  const byId = new Map<AreaId, AreaOverride>();
  for (const o of areas) {
    if (!isAddable(o.id)) continue;
    if (o.op === "+" && !base.includes(o.id)) byId.set(o.id, isScopedArea(o.id) ? { id: o.id, op: "+", scope: o.scope === "region" ? "region" : "branch" } : { id: o.id, op: "+" });
    if (o.op === "-" && base.includes(o.id)) byId.set(o.id, { id: o.id, op: "-" });
  }
  return [...byId.values()];
}

/** Varaqdagi matn → ro'yxat. Noma'lum yozuvlar tashlab yuboriladi (log'da ko'rinadi) */
export function parseAreas(raw: unknown): AreaOverride[] {
  const out: AreaOverride[] = [];
  for (const part of String(raw ?? "").split(/[;,\s]+/).filter(Boolean)) {
    const m = part.match(/^([+-])([a-z]+)(?::(branch|region))?$/i);
    const id = m?.[2].toLowerCase();
    if (!m || !id || !isAddable(id)) {
      console.warn("[roles] noma'lum bo'lim yozuvi tashlab yuborildi:", JSON.stringify(part));
      continue;
    }
    out.push({ id, op: m[1] as "+" | "-", scope: m[3] ? (m[3].toLowerCase() as Scope) : undefined });
  }
  return out;
}

/** Ro'yxat → varaqdagi matn */
export const formatAreas = (areas: readonly AreaOverride[]) =>
  areas.map((o) => `${o.op}${o.id}${o.op === "+" && o.scope ? ":" + o.scope : ""}`).join("; ");

/**
 * Xodim ko'radigan bo'limlar: rol bo'limlari (olib tashlanganlarsiz) + qo'shilganlar oxirida.
 * Tartib muhim — birinchisi kirgandan keyin ochiladi (firstAllowedHref).
 */
export function areaList(a: Access): readonly AreaId[] {
  const areas = normalizeAreas(a.role, a.areas);
  if (!areas.length) return ACCESS[a.role];
  const removed = new Set(areas.filter((o) => o.op === "-").map((o) => o.id));
  const list = [...ACCESS[a.role].filter((id) => !removed.has(id)), ...areas.filter((o) => o.op === "+").map((o) => o.id)];
  // Varaqda qo'lda hamma bo'lim olib tashlangan bo'lsa ham xodim tizimga kira olsin
  return list.length ? list : ACCESS[a.role];
}

const added = (a: Access, id: AreaId) => normalizeAreas(a.role, a.areas).find((o) => o.op === "+" && o.id === id);

export const canSee = (a: Access, id: AreaId) => areaList(a).includes(id);

/** Shu bo'limda viloyat bo'yicha to'liq ma'lumot ko'radimi; aks holda faqat o'z filialini */
export const isGlobalIn = (a: Access, id: SectionId) => {
  const extra = added(a, id);
  return extra ? extra.scope === "region" : SCOPE[a.role][id] === "region";
};

/**
 * O'z filiali doirasida murojaat kiritmay, analitika paneli + ro'yxatni faqat ko'radigan rollar
 * (Maslahat burchagi, Filial qabulxonasi). Viloyat rollari ("Boshqarma") ham yozmaydi — ular isGlobalIn bilan.
 */
const BRANCH_ANALYTICS: Partial<Record<Role, readonly SectionId[]>> = {
  branchManager: ["advice", "reception"],
};
/** Faqat rol bo'yicha: xodimga alohida qo'shilgan bo'limda "o'z filiali" — kiritish rejimi */
export const isBranchAnalyticsIn = (a: Access, id: SectionId) => !added(a, id) && (BRANCH_ANALYTICS[a.role]?.includes(id) ?? false);

const HREF: Record<AreaId, string> = {
  kadr: "/kadr",
  deadline: "/deadline",
  etirof: "/etirof",
  xatlov: "/xatlov",
  payment: "/payment",
  advice: "/advice",
  reception: "/reception",
  logs: "/logs",
  upload: "/upload",
  regtest: "/regtest/test",
  users: "/users",
};
export const firstAllowedHref = (a: Access) => HREF[areaList(a)[0]];

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
  assistant: "assistant",
  asistent: "assistant",
  assistent: "assistant",
  yordamchi: "assistant",
  ассистент: "assistant",
  ёрдамчи: "assistant",
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
