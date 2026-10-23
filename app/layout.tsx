import type { Metadata, Viewport } from "next";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "@/styles/deadline.css";
import "@/styles/payment.css";
import "@/styles/advice.css";
import "@/styles/reception.css";
import "@/styles/analytics.css";
import "@/styles/logs.css";
import "@/styles/users.css";
import "@/styles/kadr.css";
import "@/styles/upload.css";
import "@/styles/etirof.css";
import "@/styles/xatlov.css";
import "@/styles/regtest.css";
import "@/styles/regtest-results.css";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "DKP Namangan — Monitoring",
  description: "Davlat kadastrlari palatasi Namangan viloyati: yagona monitoring paneli",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "DKP Stat", statusBarStyle: "default" },
};

// interactiveWidget: telefonda klaviatura ochilganda sahifa balandligi ham kichrayadi (forma klaviatura ostida qolmaydi)
// colorScheme "only light": sayt faqat yorug' rejimda; telefon qorong'i rejimida Chrome sahifani majburan qoraytirmasin
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
  colorScheme: "only light",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
