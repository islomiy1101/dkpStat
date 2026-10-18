/** Kirish uchun ruxsat etilgan eng katta xatolik (metr). Server ham shu qiymat bilan tekshiradi. */
export const GEO_MAX_ACCURACY_M = Number(process.env.NEXT_PUBLIC_GEO_MAX_ACCURACY_M) || 50;

export type GeoFix = { lat: number; lng: number; accuracy: number };
export type GeoErrorCode = "UNSUPPORTED" | "DENIED" | "LOW_ACCURACY" | "TIMEOUT";

export class GeoError extends Error {
  constructor(public code: GeoErrorCode, message: string, public best?: number) {
    super(message);
  }
}

export const mapsUrl = (f: { lat: number; lng: number }) => `https://maps.google.com/?q=${f.lat},${f.lng}`;

/**
 * Eng aniq GPS nuqtasini `timeoutMs` ichida qidiradi. Xatolik GEO_MAX_ACCURACY_M dan oshmasa
 * darhol qaytaradi; vaqt tugaganda ham shu chegaraga yetmasa — LOW_ACCURACY.
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
      if (best) {
        const acc = Math.round(best.coords.accuracy);
        reject(new GeoError("LOW_ACCURACY", `Joylashuv aniqligi yetarli emas: ±${acc} m (talab: ±${GEO_MAX_ACCURACY_M} m gacha).`, acc));
      } else {
        reject(new GeoError("TIMEOUT", "Joylashuvni aniqlash vaqti tugadi. Qaytadan urinib ko'ring."));
      }
    }, timeoutMs);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) {
          best = pos;
          onProgress?.(Math.round(pos.coords.accuracy));
        }
        if (pos.coords.accuracy <= GEO_MAX_ACCURACY_M) {
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
