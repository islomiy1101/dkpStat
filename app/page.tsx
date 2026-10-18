import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { firstAllowedHref } from "@/lib/roles";

export default async function Home() {
  const user = await getUser();
  redirect(user ? firstAllowedHref(user.role) : "/login");
}
