import type { Metadata } from "next";
import { guardPage } from "@/lib/auth";
import AdviceView from "@/features/advice/AdviceView";

export const metadata: Metadata = { title: "Kadastr maslahat burchagi" };

export default async function Page() {
  await guardPage("advice");
  return <AdviceView />;
}
