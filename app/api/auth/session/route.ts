import { NextResponse } from "next/server";
import { authError, getUser } from "@/lib/auth";

/**
 * GET /api/auth/session — ochiq sahifa har daqiqada so'raydi (components/Sidebar.tsx):
 * foydalanuvchi bloklangan yoki sessiyasi bekor qilingan bo'lsa 401 → login sahifasiga.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const u = await getUser();
  if (!u) return authError();
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
