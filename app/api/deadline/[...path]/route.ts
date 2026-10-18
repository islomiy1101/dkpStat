import { requireArea } from "@/lib/auth";
import { isGlobal, sameBranch } from "@/lib/roles";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { cached, invalidate } from "@/lib/cache";
import { MOCK, readMock } from "@/lib/mock";

/**
 * Django API proxy: /api/deadline/summary, /api/deadline/details, /api/deadline/upload
 * Original frontend to'g'ridan-to'g'ri ngrok manziliga murojaat qilardi;
 * endi manzil serverda yashirin, ngrok ogohlantirish sarlavhasi ham shu yerda qo'yiladi.
 */
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["summary", "details", "upload"]);
const NGROK = { "ngrok-skip-browser-warning": "true" };

function target(path: string, search: string) {
  if (!config.deadlineApiBase) throw new Error("DEADLINE_API_BASE sozlanmagan");
  return `${config.deadlineApiBase}/${path}/${search}`;
}

/** Filial rollari uchun summary'dan faqat o'z tumani qoldiriladi ("Viloyat jami" ham olib tashlanadi) */
function scopeSummary<T extends { summary?: Record<string, unknown> }>(json: T, branch: string): T {
  if (!json || !json.summary) return json;
  const summary = Object.fromEntries(Object.entries(json.summary).filter(([tuman]) => sameBranch(tuman, branch)));
  return { ...json, summary };
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const u = await requireArea("deadline");
  if (u instanceof Response) return u;
  const { path } = await ctx.params;
  const name = path.join("/");
  if (!ALLOWED.has(name) || name === "upload") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const fresh = url.searchParams.has("fresh");
  url.searchParams.delete("fresh");
  const global = isGlobal(u.role);
  // Filial roli boshqa tumanning tafsilotini so'ray olmaydi
  if (!global && name === "details" && !sameBranch(url.searchParams.get("tuman"), u.branch)) {
    return NextResponse.json({ status: "error", message: "Ruxsat yo'q" }, { status: 403 });
  }
  const search = url.searchParams.toString() ? `?${url.searchParams}` : "";

  if (MOCK) {
    if (name === "summary") {
      const json = await readMock<{ summary?: Record<string, unknown> }>("deadline_summary");
      return NextResponse.json(global ? json : scopeSummary(json, u.branch));
    }
    if (url.searchParams.get("action") === "export") return new Response("demo", { headers: { "Content-Type": "application/octet-stream" } });
    return NextResponse.json(await readMock("deadline_details"));
  }

  try {
    if (name === "summary") {
      const json = await cached(
        "deadline:summary",
        config.cacheTtlMs,
        async () => {
          const r = await fetch(target("summary", ""), { headers: NGROK, cache: "no-store" });
          if (!r.ok) throw new Error(`Django: ${r.status}`);
          return r.json();
        },
        { fresh }
      );
      return NextResponse.json(global ? json : scopeSummary(json, u.branch), { headers: { "Cache-Control": "no-store" } });
    }

    // details (JSON yoki action=export bo'lsa Excel fayl) — keshsiz, oqim sifatida uzatiladi
    const r = await fetch(target("details", search), { headers: NGROK, cache: "no-store" });
    return new Response(r.body, {
      status: r.status,
      headers: {
        "Content-Type": r.headers.get("Content-Type") || "application/json",
        ...(r.headers.get("Content-Disposition") ? { "Content-Disposition": r.headers.get("Content-Disposition")! } : {}),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ status: "error", message: (e as Error).message }, { status: 502 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const u = await requireArea("upload");
  if (u instanceof Response) return u;
  const { path } = await ctx.params;
  if (path.join("/") !== "upload") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (MOCK) return NextResponse.json({ status: "success", message: "Demo: fayl qabul qilindi" });
  try {
    const form = await req.formData();
    const r = await fetch(target("upload", ""), { method: "POST", body: form, headers: NGROK });
    const json = await r.json();
    invalidate("deadline:");
    return NextResponse.json(json, { status: r.status });
  } catch (e) {
    return NextResponse.json({ status: "error", message: (e as Error).message }, { status: 502 });
  }
}
