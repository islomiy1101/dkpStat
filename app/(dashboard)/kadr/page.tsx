import type { Metadata } from "next";
import { guardPage } from "@/lib/auth";
import { canSee } from "@/lib/roles";
import KadrView from "@/features/kadr/KadrView";

export const metadata: Metadata = { title: "Kadrlar statistikasi — DKP Namangan" };

export default async function Page() {
  const u = await guardPage("kadr");
  return <KadrView canUpload={canSee(u, "upload")} />;
}
