/** Shu aniqlikka yetganda kutish to'xtatiladi (undan yomoni ham qabul qilinadi — eng aniq nuqta olinadi) */
const GOOD_ACCURACY_M = 15;

export type GeoFix = { lat: number; lng: number; accuracy: number };
export type GeoErrorCode = "UNSUPPORTED" | "DENIED" | "TIMEOUT";

export class GeoError extends Error {
  constructor(public code: GeoErrorCode, message: string) {
    super(message);
  }
}

export const mapsUrl = (f: { lat: number; lng: number }) => `https://maps.google.com/?q=${f.lat.toFixed(7)},${f.lng.toFixed(7)}`;

/**
 * Joylashuvni imkon qadar aniq olish: `timeoutMs` davomida GPS/Wi-Fi nuqtalari kuzatiladi va eng kichik
 * xatolikka ega nuqta tanlanadi (GPS odatda birinchi soniyalarda "isiydi" — keyingi nuqtalar aniqroq bo'ladi).
 * ±GOOD_ACCURACY_M ga yetsa darhol qaytaradi. Aniqlik bo'yicha cheklov yo'q — kirish istalgan joydan.
 * onProgress har yangi (aniqroq) nuqtada joriy xatolikni beradi (UI'da "±N m" uchun).
 */
export function getUserLocation(onProgress?: (accuracy: number) => void, timeoutMs = 20_000): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new GeoError("UNSUPPORTED", "Brauzeringiz joylashuvni aniqlashni qo'llab-quvvatlamaydi!"));
      return;
    }
    let best: GeolocationPosition | null = null;
    let watchId: number | null = null;
    const done = () => {
      clearTimeout(timer);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
    const fix = (p: GeolocationPosition): GeoFix => ({
      lat: p.coords.latitude,
      lng: p.coords.longitude,
      accuracy: Math.round(p.coords.accuracy),
    });

    const timer = setTimeout(() => {
      done();
      if (best) resolve(fix(best));
      else reject(new GeoError("TIMEOUT", "Joylashuvni aniqlash vaqti tugadi. Qaytadan urinib ko'ring."));
    }, timeoutMs);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) {
          best = pos;
          onProgress?.(Math.round(pos.coords.accuracy));
        }
        if (pos.coords.accuracy <= GOOD_ACCURACY_M) {
          done();
          resolve(fix(pos));
        }
      },
      (err) => {
        // Ruxsat berilmasa — darhol; vaqtinchalik xatolarda (signal yo'q) kutishda davom etamiz
        if (err.code === err.PERMISSION_DENIED) {
          done();
          reject(new GeoError("DENIED", "Joylashuvga ruxsat berilmadi. Tizimga kirish uchun lokatsiyani yoqishingiz shart."));
        }
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}
