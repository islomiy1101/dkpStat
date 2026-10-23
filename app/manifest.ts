import type { MetadataRoute } from "next";

// PWA manifest (/manifest.webmanifest) — PWABuilder orqali APK yaratish uchun
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "DKP Namangan — Monitoring",
    short_name: "DKP Stat",
    description: "Davlat kadastrlari palatasi Namangan viloyati: yagona monitoring paneli",
    lang: "uz",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
