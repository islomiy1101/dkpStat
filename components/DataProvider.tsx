"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AdviceData, AdviceSessionInfo, DeadlineData, PaymentData, ReceptionData, ReceptionSessionInfo } from "@/lib/types";
import { SECTIONS, type SectionId } from "@/lib/sections";
import { DEADLINE_LIST_IDS, type DeadlineList } from "@/features/deadline/source";
import { ETIROF_PAGE_IDS, type EtirofPage, type EtirofSvod } from "@/features/etirof/config";
import type { XatlovData } from "@/features/xatlov/config";

/**
 * Barcha bo'limlar ma'lumotini PARALLEL yuklovchi provider.
 *  - Ilova ochilishi bilan har bir bo'lim so'rovi bir vaqtda yuboriladi (biri ikkinchisini kutmaydi).
 *  - Oxirgi muvaffaqiyatli javob localStorage'da saqlanadi va keyingi ochilishda darhol ko'rsatiladi
 *    (stale-while-revalidate), fonda yangisi olinadi.
 *  - Sidebar orqali bo'lim almashtirilganda qayta yuklash bo'lmaydi — data allaqachon xotirada.
 */

export type AdvicePayload = AdviceData & { session: AdviceSessionInfo };
export type ReceptionPayload = ReceptionData & { session: ReceptionSessionInfo };
/** "Rollar kesimida tahlil": ikkala ro'yxat bitta slotda (parallel yuklanadi) */
export type DeadlinePayload = Partial<Record<DeadlineList, DeadlineData>>;
/** "E'tirof": 4 ta SVOD bitta slotda; bittasi xato bersa, qolganlari baribir ko'rinadi */
export type EtirofPayload = Partial<Record<EtirofPage, EtirofSvod | { error: string }>>;
type DataMap = { deadline: DeadlinePayload; etirof: EtirofPayload; xatlov: XatlovData; payment: PaymentData; advice: AdvicePayload; reception: ReceptionPayload };

export type SlotStatus = "idle" | "loading" | "ready" | "error";
export type Slot<T> = {
  status: SlotStatus;
  data: T | null;
  error?: string;
  updatedAt?: number;
  refreshing: boolean;
};

type State = { [K in SectionId]: Slot<DataMap[K]> };

type Ctx = {
  state: State;
  refresh: (id: SectionId, opts?: { fresh?: boolean }) => Promise<void>;
  refreshAll: () => Promise<void>;
  mutate: <K extends SectionId>(id: K, fn: (d: DataMap[K]) => DataMap[K]) => void;
  reset: (id: SectionId, status?: SlotStatus) => void;
};

const DataCtx = createContext<Ctx | null>(null);
const CACHE_PREFIX = "dkp_cache_v1_";

const empty = <T,>(): Slot<T> => ({ status: "idle", data: null, refreshing: false });

async function getJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (res.status === 401) {
    // Sayt sessiyasi tugagan — login sahifasiga
    window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    throw new Error("auth");
  }
  if (!res.ok) throw new Error((json && (json.error || json.message)) || `HTTP ${res.status}`);
  return json;
}

const FETCHERS: { [K in SectionId]: (fresh: boolean) => Promise<DataMap[K]> } = {
  deadline: async (fresh) => {
    const lists = await Promise.all(
      DEADLINE_LIST_IDS.map(async (list) => {
        const json = await getJson(`/api/deadline/summary?list=${list}${fresh ? "&fresh=1" : ""}`);
        if (json.status === "success" && json.summary) return [list, json.summary as DeadlineData] as const;
        throw new Error(json.message || "Javob noto'g'ri");
      })
    );
    return Object.fromEntries(lists) as DeadlinePayload;
  },
  etirof: async (fresh) => {
    const res = await Promise.allSettled(ETIROF_PAGE_IDS.map((p) => getJson(`/api/etirof/${p}${fresh ? "?fresh=1" : ""}`)));
    if (res.every((r) => r.status === "rejected")) throw (res[0] as PromiseRejectedResult).reason;
    return Object.fromEntries(
      res.map((r, i) => [ETIROF_PAGE_IDS[i], r.status === "fulfilled" ? (r.value as EtirofSvod) : { error: (r.reason as Error).message }])
    ) as EtirofPayload;
  },
  xatlov: async (fresh) => (await getJson(`/api/xatlov${fresh ? "?fresh=1" : ""}`)) as XatlovData,
  payment: async (fresh) => (await getJson(`/api/payment${fresh ? "?fresh=1" : ""}`)) as PaymentData,
  advice: async (fresh) => (await getJson(`/api/advice/data${fresh ? "?fresh=1" : ""}`)) as AdvicePayload,
  reception: async (fresh) => (await getJson(`/api/reception/data${fresh ? "?fresh=1" : ""}`)) as ReceptionPayload,
};

function readCache<T>(id: SectionId): { data: T; updatedAt: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeCache(id: SectionId, data: unknown) {
  try {
    localStorage.setItem(CACHE_PREFIX + id, JSON.stringify({ data, updatedAt: Date.now() }));
  } catch {
    /* kvota to'lgan bo'lsa — e'tiborsiz */
  }
}
export function dropCache(id: SectionId) {
  try {
    localStorage.removeItem(CACHE_PREFIX + id);
  } catch {}
}

export function DataProvider({ children, allowed }: { children: React.ReactNode; allowed: SectionId[] }) {
  const [state, setState] = useState<State>(() => ({
    deadline: empty(),
    etirof: empty(),
    xatlov: empty(),
    payment: empty(),
    advice: empty(),
    reception: empty(),
  }));
  const inflight = useRef<Partial<Record<SectionId, Promise<void>>>>({});

  const patch = useCallback(<K extends SectionId>(id: K, p: Partial<Slot<DataMap[K]>>) => {
    setState((s) => ({ ...s, [id]: { ...s[id], ...p } }));
  }, []);

  const refresh = useCallback(
    (id: SectionId, opts: { fresh?: boolean } = {}) => {
      const running = inflight.current[id];
      if (running && !opts.fresh) return running;

      setState((s) => ({
        ...s,
        [id]: { ...s[id], refreshing: true, status: s[id].data ? s[id].status : "loading", error: undefined },
      }));

      const p = FETCHERS[id](!!opts.fresh)
        .then((data) => {
          writeCache(id, data);
          patch(id, { status: "ready", data: data as never, updatedAt: Date.now(), refreshing: false, error: undefined });
        })
        .catch((e: Error) => {
          console.error(`[${id}] yuklashda xatolik:`, e);
          setState((s) => ({
            ...s,
            [id]: { ...s[id], refreshing: false, error: e.message, status: s[id].data ? s[id].status : "error" },
          }));
        })
        .finally(() => {
          if (inflight.current[id] === p) delete inflight.current[id];
        });
      inflight.current[id] = p;
      return p;
    },
    [patch]
  );

  const allowedKey = allowed.join(",");
  const refreshAll = useCallback(async () => {
    await Promise.allSettled(allowed.map((id) => refresh(id, { fresh: true })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, allowedKey]);

  const mutate = useCallback(<K extends SectionId>(id: K, fn: (d: DataMap[K]) => DataMap[K]) => {
    setState((s) => {
      const cur = s[id].data as DataMap[K] | null;
      if (!cur) return s;
      const next = fn(cur);
      writeCache(id, next);
      return { ...s, [id]: { ...s[id], data: next } };
    });
  }, []);

  const reset = useCallback(
    (id: SectionId, status: SlotStatus = "idle") => {
      dropCache(id);
      patch(id, { status, data: null, refreshing: false, error: undefined });
    },
    [patch]
  );

  // Ilova ochilganda: keshdan darhol ko'rsatish + ruxsat etilgan bo'limlarni bir vaqtda yuklash
  useEffect(() => {
    // Ruxsat yo'q bo'limlarning eski keshi (boshqa foydalanuvchidan qolgan) o'chiriladi
    for (const sec of SECTIONS) if (!allowed.includes(sec.id)) dropCache(sec.id);
    setState((s) => {
      const next = { ...s };
      for (const id of allowed) {
        const c = readCache(id);
        if (c) next[id] = { status: "ready", data: c.data as never, updatedAt: c.updatedAt, refreshing: false };
      }
      return next;
    });
    for (const id of allowed) void refresh(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, allowedKey]);

  const value = useMemo(() => ({ state, refresh, refreshAll, mutate, reset }), [state, refresh, refreshAll, mutate, reset]);
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData() {
  const ctx = useContext(DataCtx);
  if (!ctx) throw new Error("useData DataProvider ichida ishlatilishi kerak");
  return ctx;
}

export function useSection<K extends SectionId>(id: K) {
  const { state, refresh, mutate, reset } = useData();
  return {
    ...(state[id] as Slot<DataMap[K]>),
    refresh: (fresh = true) => refresh(id, { fresh }),
    mutate: (fn: (d: DataMap[K]) => DataMap[K]) => mutate(id, fn),
    reset: (status?: SlotStatus) => reset(id, status),
  };
}
