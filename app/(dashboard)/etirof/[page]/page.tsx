import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { guardPage } from "@/lib/auth";
import EtirofView from "@/features/etirof/EtirofView";
import { ETIROF_PAGES, isEtirofPage } from "@/features/etirof/config";

export async function generateMetadata({ params }: { params: Promise<{ page: string }> }): Promise<Metadata> {
  const { page } = await params;
  const sub = isEtirofPage(page) ? ` · ${ETIROF_PAGES[page].title}` : "";
  return { title: `Эътироф${sub} - DKP Namangan` };
}

export default async function Page({ params }: { params: Promise<{ page: string }> }) {
  await guardPage("etirof");
  const { page } = await params;
  if (!isEtirofPage(page)) notFound();
  return <EtirofView page={page} />;
}
