import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { guardPage } from "@/lib/auth";
import DeadlineView from "@/features/deadline/DeadlineView";
import { DEADLINE_LISTS, isDeadlineList } from "@/features/deadline/source";

export async function generateMetadata({ params }: { params: Promise<{ list: string }> }): Promise<Metadata> {
  const { list } = await params;
  const sub = isDeadlineList(list) ? ` · ${DEADLINE_LISTS[list].title}` : "";
  return { title: `Рўллар кесмида тахлил${sub} - DKP Namangan (FinTech Dashboard)` };
}

export default async function Page({ params }: { params: Promise<{ list: string }> }) {
  await guardPage("deadline");
  const { list } = await params;
  if (!isDeadlineList(list)) notFound();
  return <DeadlineView list={list} />;
}
