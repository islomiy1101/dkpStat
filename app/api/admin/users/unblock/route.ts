import { NextResponse } from "next/server";
import { AUTH_STATE_KEY, requireSuperadmin } from "@/lib/auth";
import { unblockUser } from "@/lib/auth-server";
import { invalidate } from "@/lib/cache";

/** POST /api/admin/users/unblock { login } — faqat superadmin */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await requireSuperadmin();
  if (u instanceof Response) return u;
  const b = (await req.json().catch(() => null)) as { login?: unknown } | null;
  const login = String(b?.login ?? "").trim();
  if (!login) return NextResponse.json({ success: false, message: "Login ko'rsatilmagan" }, { status: 400 });
  try {
    const r = await unblockUser(u.login, login);
    if (!r.success) return NextResponse.json({ success: false, message: r.message || "Blokdan chiqarib bo'lmadi" }, { status: 400 });
    invalidate(AUTH_STATE_KEY);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[auth] unblock:", e);
    return NextResponse.json({ success: false, message: "Server bilan bog'lanib bo'lmadi. Qayta urinib ko'ring." }, { status: 502 });
  }
}
