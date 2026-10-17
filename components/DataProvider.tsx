"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AdviceData, AdviceSessionInfo, DeadlineData, PaymentData } from "@/lib/types";
import { SECTIONS, type SectionId } from "@/lib/sections";

/**
 * Barcha bo'limlar ma'lumotini PARALLEL yuklovchi provider.
 *  - Ilova ochilishi bilan har bir bo'lim so'rovi bir vaqtda yuboriladi (biri ikkinchisini kutmaydi).
 *  - Oxirgi muvaffaqiyatli javob localStorage'da saqlanadi va keyingi ochilishda darhol ko'rsatiladi
 *    (stale-while-revalidate), fonda yangisi olinadi.
 *  - Sidebar orqali bo'lim almashtirilganda qayta yuklash bo'lmaydi — data allaqachon xotirada.
 */

export type AdvicePayload = AdviceData & { session: AdviceSessionInfo };
type DataMap = { deadline: DeadlineData; payment: PaymentData; advice: AdvicePayload };

export type SlotStatus = "idle" | "loading" | "ready" | "error" | "locked";
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

class LockedError extends Error {}

async function getJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (res.status === 401) {
    // Sayt sessiyasi tugagan bo'lsa — login sahifasiga
    if (json && json.error === "auth") {
      window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      throw new Error("auth");
    }
    throw new LockedError("locked");
  }
  if (!res.ok) throw new Error((json && (json.error || json.message)) || `HTTP ${res.status}`);
  return json;
}

const FETCHERS: { [K in SectionId]: (fresh: boolean) => Promise<DataMap[K]> } = {
  deadline: async (fresh) => {
    const json = await getJson(`/api/deadline/summary${fresh ? "?fresh=1" : ""}`);
    if (json.status === "success" && json.summary) return json.summary as DeadlineData;
    throw new Error(json.message || "Django javobi noto'g'ri");
  },
  payment: async (fresh) => (await getJson(`/api/payment${fresh ? "?fresh=1" : ""}`)) as PaymentData,
  advice: async (fresh) => (await getJson(`/api/advice/data${fresh ? "?fresh=1" : ""}`)) as AdvicePayload,
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

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(() => ({
    deadline: empty(),
    payment: empty(),
    advice: empty(),
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
          if (e instanceof LockedError) {
            dropCache(id);
            patch(id, { status: "locked", data: null, refreshing: false });
          } else {
            console.error(`[${id}] yuklashda xatolik:`, e);
            setState((s) => ({
              ...s,
              [id]: { ...s[id], refreshing: false, error: e.message, status: s[id].data ? s[id].status : "error" },
            }));
          }
        })
        .finally(() => {
          if (inflight.current[id] === p) delete inflight.current[id];
        });
      inflight.current[id] = p;
      return p;
    },
    [patch]
  );

  const refreshAll = useCallback(async () => {
    await Promise.allSettled(SECTIONS.map((s) => refresh(s.id, { fresh: true })));
  }, [refresh]);

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

  // Ilova ochilganda: keshdan darhol ko'rsatish + HAMMA bo'limlarni bir vaqtda yuklash
  useEffect(() => {
    setState((s) => {
      const next = { ...s };
      for (const sec of SECTIONS) {
        const c = readCache(sec.id);
        if (c) next[sec.id] = { status: "ready", data: c.data as never, updatedAt: c.updatedAt, refreshing: false };
      }
      return next;
    });
    for (const sec of SECTIONS) void refresh(sec.id);
  }, [refresh]);

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
