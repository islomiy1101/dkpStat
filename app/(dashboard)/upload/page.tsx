import type { Metadata } from "next";
import { guardPage } from "@/lib/auth";
import UploadView from "@/features/upload/UploadView";
import { sheetLinks } from "@/lib/sheet-links";

export const metadata: Metadata = { title: "Bazaga yuklash — DKP Namangan" };

export default async function Page() {
  await guardPage("upload");
  // Sheet havolalari faqat shu sahifada (superadmin) — boshqa rollarga ID'lar chiqmaydi
  return <UploadView links={await sheetLinks()} />;
}
