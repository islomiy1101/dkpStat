import { getUser, authError } from "@/lib/auth";
import { NextResponse } from "next/server";
import { clearSession } from "@/lib/session";

export async function POST() {
  if (!(await getUser())) return authError();
  await clearSession();
  return NextResponse.json({ success: true });
}
