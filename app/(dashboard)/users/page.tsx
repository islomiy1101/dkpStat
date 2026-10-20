import type { Metadata } from "next";
import { guardPage } from "@/lib/auth";
import UsersView from "@/features/users/UsersView";

export const metadata: Metadata = { title: "Foydalanuvchilar — DKP Namangan" };

export default async function Page() {
  const u = await guardPage("users");
  return <UsersView self={u.login} />;
}
