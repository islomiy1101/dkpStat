import type { Metadata } from "next";
import { guardPage } from "@/lib/auth";
import ReceptionView from "@/features/reception/ReceptionView";

export const metadata: Metadata = { title: "Filial qabulxonasi | DKP Namangan" };

export default async function Page() {
  await guardPage("reception");
  return <ReceptionView />;
}
