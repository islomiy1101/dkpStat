import { NextResponse } from "next/server";
import { clearUser } from "@/lib/auth";
import { clearSession as clearAdviceSession } from "@/lib/session";

export async function POST() {
  await clearUser();
  await clearAdviceSession();
  return NextResponse.json({ success: true });
}
