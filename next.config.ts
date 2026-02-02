import type { NextConfig } from "next";

// On Vercel we need a server (no static export) so API routes like /api/fetch-url work.
// For Electron or local static builds, use static export.
const isVercel = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  /* config options here */
  // Empty turbopack config to acknowledge we're using Turbopack
  // The typst.ts WASM modules are loaded dynamically via CDN
  turbopack: {},

  // Static export only when not on Vercel (Electron/local static build)
  ...(isVercel ? {} : { output: "export" as const }),

  // Disable image optimization since it requires a server
  // Images will still work, just without Next.js optimization
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
