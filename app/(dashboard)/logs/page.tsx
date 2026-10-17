import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import LogsView from "@/features/logs/LogsView";

export const metadata: Metadata = { title: "Kirishlar tarixi — DKP Namangan" };

export default async function Page() {
  const user = await getUser();
  if (!user || user.role !== "admin") redirect("/deadline");
  return <LogsView />;
}
