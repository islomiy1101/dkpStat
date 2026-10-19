import type { Metadata } from "next";
import { guardPage } from "@/lib/auth";
import RegTestView from "@/features/regtest/RegTestView";

export const metadata: Metadata = { title: "Test yechish · Registratsiya — DKP Namangan" };

export default async function Page() {
  const u = await guardPage("regtest");
  // Registrator tizimga kirib beradi, testni boshqa xodim (PINFL) yechadi — registratordan faqat login
  return <RegTestView login={u.login} />;
}
