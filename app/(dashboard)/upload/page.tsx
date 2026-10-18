import type { Metadata } from "next";
import { guardPage } from "@/lib/auth";
import UploadView from "@/features/upload/UploadView";

export const metadata: Metadata = { title: "Bazaga yuklash — DKP Namangan" };

export default async function Page() {
  await guardPage("upload");
  return <UploadView />;
}
