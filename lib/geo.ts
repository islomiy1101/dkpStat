/** Original getUserLocation() — eng aniq GPS nuqtasini 7 soniya ichida qidiradi */
export function getUserLocation(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject("Brauzeringiz joylashuvni aniqlashni qo'llab-quvvatlamaydi!");
      return;
    }
    let best: GeolocationPosition | null = null;
    let watchId: number | null = null;
    const timer = setTimeout(() => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (best) resolve(`https://maps.google.com/?q=${best.coords.latitude},${best.coords.longitude}`);
      else reject("Joylashuvni aniqlash vaqti tugadi. Qaytadan urinib ko'ring.");
    }, 7000);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
        if (pos.coords.accuracy <= 60) {
          clearTimeout(timer);
          if (watchId !== null) navigator.geolocation.clearWatch(watchId);
          resolve(`https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`);
        }
      },
      () => {
        clearTimeout(timer);
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        reject("LOCATION_DENIED");
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }
    );
  });
}
