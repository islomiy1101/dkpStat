import type { Metadata } from "next";
import PaymentView from "@/features/payment/PaymentView";

export const metadata: Metadata = { title: "DKP Namangan viloyati | To'lov Kutilmoqda va Tushumlar Tahlili" };

export default function Page() {
  return <PaymentView />;
}
