import { NextResponse } from "next/server";
import { AUTH_STATE_KEY, requireSuperadmin } from "@/lib/auth";
import { BLOCK_FOREVER, blockUser } from "@/lib/auth-server";
import { invalidate } from "@/lib/cache";

/**
 * POST /api/admin/users/block { login, until, reason } — faqat superadmin.
 * until: kelajakdagi vaqt (ms) yoki "muddatsiz". Muddat o'tgach avtomatik ochiladi; ochiq sessiyalari yopiladi.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await requireSuperadmin();
  if (u instanceof Response) return u;
  const b = (await req.json().catch(() => null)) as { login?: unknown; until?: unknown; reason?: unknown } | null;
  const login = String(b?.login ?? "").trim();
  const reason = String(b?.reason ?? "").trim().slice(0, 200);
  const until = b?.until === BLOCK_FOREVER ? BLOCK_FOREVER : Number(b?.until);
  const bad = (message: string) => NextResponse.json({ success: false, message }, { status: 400 });
  if (!login) return bad("Login ko'rsatilmagan");
  if (login.toLowerCase() === u.login.toLowerCase()) return bad("O'zingizni bloklay olmaysiz");
  if (until !== BLOCK_FOREVER && !(until > Date.now())) return bad("Blok muddati kelajakda bo'lishi kerak");
  try {
    const r = await blockUser(u.login, login, until, reason);
    if (!r.success) return bad(r.message || "Bloklab bo'lmadi");
    invalidate(AUTH_STATE_KEY);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[auth] block:", e);
    return NextResponse.json({ success: false, message: "Server bilan bog'lanib bo'lmadi. Qayta urinib ko'ring." }, { status: 502 });
  }
}
