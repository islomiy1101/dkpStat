export type GeoFix = { lat: number; lng: number; accuracy: number };
export type GeoErrorCode = "UNSUPPORTED" | "DENIED" | "TIMEOUT";

export class GeoError extends Error {
  constructor(public code: GeoErrorCode, message: string) {
    super(message);
  }
}

export const mapsUrl = (f: { lat: number; lng: number }) => `https://maps.google.com/?q=${f.lat.toFixed(7)},${f.lng.toFixed(7)}`;

const DENIED_MSG = "Joylashuvga ruxsat berilmadi. Tizimga kirish uchun lokatsiyani yoqishingiz shart.";

/**
 * Joylashuvni fonda kuzatuvchi: login sahifasi ochilishi bilan ishga tushadi, foydalanuvchi login/parol
 * yozguncha nuqta tayyor bo'ladi va aniqlashib boradi. "Kirish" bosilganda kutish deyarli yo'q.
 *  - getCurrentPosition (past aniqlik, keshdan) — birinchi nuqtani tez beradi
 *  - watchPosition (yuqori aniqlik, GPS) — keyingi nuqtalar bilan aniqlashtiradi; eng aniqi saqlanadi
 */
export function createLocationTracker() {
  let best: GeoFix | null = null;
  let error: GeoError | null = null;
  let watchId: number | null = null;
  const waiters = new Set<() => void>();
  const notify = () => waiters.forEach((w) => w());

  const onPos = (p: GeolocationPosition) => {
    if (!best || p.coords.accuracy < best.accuracy) {
      best = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) };
    }
    error = null;
    notify();
  };
  const onErr = (e: GeolocationPositionError) => {
    // Vaqtinchalik xatolar (signal yo'q) e'tiborsiz — kuzatish davom etadi
    if (e.code === e.PERMISSION_DENIED) {
      error = new GeoError("DENIED", DENIED_MSG);
      notify();
    }
  };

  function start() {
    if (watchId !== null) return;
    if (!navigator.geolocation) {
      error = new GeoError("UNSUPPORTED", "Brauzeringiz joylashuvni aniqlashni qo'llab-quvvatlamaydi!");
      return;
    }
    error = null;
    navigator.geolocation.getCurrentPosition(onPos, onErr, { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: 10_000 });
    watchId = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 0 });
  }

  function stop() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  /** Hozirgacha eng aniq nuqta; hali yo'q bo'lsa — birinchisini `timeoutMs` gacha kutadi */
  function get(timeoutMs = 8_000): Promise<GeoFix> {
    if (error?.code === "DENIED") {
      // Foydalanuvchi ruxsatni yoqqan bo'lishi mumkin — qaytadan so'raymiz
      stop();
      start();
    } else if (watchId === null) {
      start();
    }
    if (best) return Promise.resolve(best);
    if (error && error.code !== "DENIED") return Promise.reject(error);
    return new Promise((resolve, reject) => {
      const finish = () => {
        clearTimeout(timer);
        waiters.delete(check);
      };
      const check = () => {
        if (best) {
          finish();
          resolve(best);
        } else if (error) {
          finish();
          reject(error);
        }
      };
      const timer = setTimeout(() => {
        finish();
        reject(new GeoError("TIMEOUT", "Joylashuvni aniqlab bo'lmadi. Qaytadan urinib ko'ring."));
      }, timeoutMs);
      waiters.add(check);
    });
  }

  return { start, stop, get };
}
