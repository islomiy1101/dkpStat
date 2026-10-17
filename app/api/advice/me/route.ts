import { getUser, authError } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getUser())) return authError();
  const s = await getSession();
  if (!s) return NextResponse.json({ session: null }, { status: 401 });
  return NextResponse.json({ session: s });
}
