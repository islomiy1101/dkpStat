import type { Metadata } from "next";
import { guardPage } from "@/lib/auth";
import PaymentView from "@/features/payment/PaymentView";

export const metadata: Metadata = { title: "DKP Namangan viloyati | To'lov Kutilmoqda va Tushumlar Tahlili" };

export default async function Page() {
  await guardPage("payment");
  return <PaymentView />;
}
