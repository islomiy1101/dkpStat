import { redirect } from "next/navigation";
import { guardPage } from "@/lib/auth";

/** /regtest → birinchi bo'limcha (Test yechish) */
export default async function Page() {
  await guardPage("regtest");
  redirect("/regtest/test");
}
