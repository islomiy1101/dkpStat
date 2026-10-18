import type { Metadata } from "next";
import { guardPage } from "@/lib/auth";
import LogsView from "@/features/logs/LogsView";

export const metadata: Metadata = { title: "Kirishlar tarixi — DKP Namangan" };

export default async function Page() {
  await guardPage("logs");
  return <LogsView />;
}
