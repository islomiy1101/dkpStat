/**
 * Oddiy in-memory kesh + in-flight dedupe.
 * Bir vaqtda kelgan bir xil so'rovlar Google'ga bitta so'rov bo'lib boradi.
 */
type Entry<T> = { value: T; expires: number };

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/** ttlMs — son yoki qiymatga qarab muddat (masalan, bo'sh natija qisqa muddat saqlansin) */
export async function cached<T>(
  key: string,
  ttlMs: number | ((value: T) => number),
  loader: () => Promise<T>,
  opts: { fresh?: boolean } = {}
): Promise<T> {
  const now = Date.now();
  if (!opts.fresh) {
    const hit = store.get(key) as Entry<T> | undefined;
    if (hit && hit.expires > now) return hit.value;
  }
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;

  const p = loader()
    .then((value) => {
      store.set(key, { value, expires: Date.now() + (typeof ttlMs === "function" ? ttlMs(value) : ttlMs) });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export function invalidate(prefix: string) {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
