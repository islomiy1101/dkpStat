import { redirect } from "next/navigation";
import { guardPage } from "@/lib/auth";
import { ETIROF_PAGE_IDS } from "@/features/etirof/config";

/** /etirof → birinchi bo'limcha (E'tirof nomzod) */
export default async function Page() {
  await guardPage("etirof");
  redirect(`/etirof/${ETIROF_PAGE_IDS[0]}`);
}
