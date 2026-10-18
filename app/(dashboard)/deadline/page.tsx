import type { Metadata } from "next";
import { guardPage } from "@/lib/auth";
import DeadlineView from "@/features/deadline/DeadlineView";

export const metadata: Metadata = { title: "Рўллар кесмида тахлил - DKP Namangan (FinTech Dashboard)" };

export default async function Page() {
  await guardPage("deadline");
  return <DeadlineView />;
}
