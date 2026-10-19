import { redirect } from "next/navigation";
import { guardPage } from "@/lib/auth";
import { DEADLINE_LIST_IDS } from "@/features/deadline/source";

/** /deadline → birinchi bo'limcha (Yakunlangan arizalar) */
export default async function Page() {
  await guardPage("deadline");
  redirect(`/deadline/${DEADLINE_LIST_IDS[0]}`);
}
