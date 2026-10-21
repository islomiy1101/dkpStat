import type { Metadata } from "next";
import { guardPage } from "@/lib/auth";
import { canSee } from "@/lib/roles";
import MuddatView from "@/features/muddat/MuddatView";

export const metadata: Metadata = { title: "Muddat buzilish — DKP Namangan" };

/** Statik "muddat" segmenti dinamik [list] dan ustun turadi */
export default async function Page() {
  const u = await guardPage("deadline");
  return <MuddatView canUpload={canSee(u.role, "upload")} />;
}
