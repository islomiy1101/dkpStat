import type { Metadata } from "next";
import { guardPage } from "@/lib/auth";
import ResultsView from "@/features/regtest/ResultsView";

export const metadata: Metadata = { title: "Test natijalari · Registratsiya — DKP Namangan" };

export default async function Page() {
  const u = await guardPage("regtest");
  return <ResultsView login={u.login} />;
}
