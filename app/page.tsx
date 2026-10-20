import { redirect } from "next/navigation";
import { PASSWORD_PAGE, getUser } from "@/lib/auth";
import { firstAllowedHref } from "@/lib/roles";

export default async function Home() {
  const user = await getUser();
  if (!user) redirect("/login");
  redirect(user.mustChange ? PASSWORD_PAGE : firstAllowedHref(user.role));
}
