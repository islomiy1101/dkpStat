import type { Metadata } from "next";
import { guardPage } from "@/lib/auth";
import XatlovView from "@/features/xatlov/XatlovView";

export const metadata: Metadata = { title: "Xatlov+Faol — DKP Namangan" };

export default async function Page() {
  await guardPage("xatlov");
  return <XatlovView />;
}
