import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Docker uchun ixcham build (node .next/standalone/server.js)
  output: "standalone",
};

export default nextConfig;
