import { NextResponse } from "next/server";
import { clearUser } from "@/lib/auth";

export async function POST() {
  await clearUser();
  return NextResponse.json({ success: true });
}
