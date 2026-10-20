import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import LoginView from "@/features/auth/LoginView";

export const metadata: Metadata = { title: "Tizimga kirish — DKP Namangan" };

export default async function Page() {
  if (await getUser()) redirect("/"); // "/" — mustChange bo'lsa parol sahifasiga
  return <LoginView />;
}
