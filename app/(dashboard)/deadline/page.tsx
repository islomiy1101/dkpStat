import type { Metadata } from "next";
import DeadlineView from "@/features/deadline/DeadlineView";

export const metadata: Metadata = { title: "Рўллар кесмида тахлил - DKP Namangan (FinTech Dashboard)" };

export default function Page() {
  return <DeadlineView />;
}
