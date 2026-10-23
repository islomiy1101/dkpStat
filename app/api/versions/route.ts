import { NextResponse } from "next/server";
import { authError, getUser, mustChangeError } from "@/lib/auth";
import { canSee, type AreaId } from "@/lib/roles";
import { loadVersions, type VersionSection } from "@/lib/sheet-version";

/**
 * GET /api/versions — foydalanuvchi ko'ra oladigan bo'limlar jadvallarining versiyasi (Drive oxirgi o'zgarish vaqti).
 * Ochiq sahifa (components/DataProvider.tsx) buni muntazam so'raydi va versiya o'zgarsa ma'lumotni qayta yuklaydi.
 */
export const dynamic = "force-dynamic";

/** Versiya bo'limi → kirish huquqi tekshiriladigan hudud (Muddat buzilish — "Rollar kesimida tahlil" ichida) */
const AREA: Record<VersionSection, AreaId> = {
  kadr: "kadr",
  deadline: "deadline",
  muddat: "deadline",
  etirof: "etirof",
  xatlov: "xatlov",
  payment: "payment",
  regtest: "regtest",
};

export async function GET() {
  const u = await getUser();
  if (!u) return authError();
  if (u.mustChange) return mustChangeError();
  const all = await loadVersions();
  const versions = Object.fromEntries(Object.entries(all).filter(([sec]) => canSee(u, AREA[sec as VersionSection])));
  return NextResponse.json({ versions }, { headers: { "Cache-Control": "no-store" } });
}
