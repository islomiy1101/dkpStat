"use client";

import { useEffect } from "react";

// PWA uchun service worker'ni ro'yxatdan o'tkazadi (faqat production'da)
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
