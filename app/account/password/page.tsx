import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import ChangePasswordView from "@/features/account/ChangePasswordView";

export const metadata: Metadata = { title: "Parolni yangilash — DKP Namangan" };

/**
 * Parolni yangilash sahifasi (dashboard qobig'idan tashqarida): parol talabga javob bermasa yoki superadmin
 * tiklagan bo'lsa, foydalanuvchi shu yerga yo'naltiriladi va yangi parol o'rnatmaguncha boshqa bo'limlar yopiq.
 */
export default async function Page() {
  const u = await getUser();
  if (!u) redirect("/login");
  return <ChangePasswordView login={u.login} fullName={u.fullName} forced={!!u.mustChange} />;
}
