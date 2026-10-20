import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/auth";
import { listUsers } from "@/lib/auth-server";

/** GET /api/admin/users — foydalanuvchilar ro'yxati (parolsiz), faqat superadmin */
export const dynamic = "force-dynamic";

export async function GET() {
  const u = await requireSuperadmin();
  if (u instanceof Response) return u;
  try {
    const users = await listUsers(u.login);
    return NextResponse.json({ success: true, users }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ success: false, message: (e as Error).message }, { status: 502 });
  }
}
