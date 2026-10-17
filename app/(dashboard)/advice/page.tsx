import type { Metadata } from "next";
import AdviceView from "@/features/advice/AdviceView";

export const metadata: Metadata = { title: "Kadastr maslahat burchagi" };

export default function Page() {
  return <AdviceView />;
}
