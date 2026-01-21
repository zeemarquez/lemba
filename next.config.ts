import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Empty turbopack config to acknowledge we're using Turbopack
  // The typst.ts WASM modules are loaded dynamically via CDN
  turbopack: {},
  
  // Enable static export for Electron packaging
  // This allows the app to run without a Node.js server
  output: 'export',
  
  // Disable image optimization since it requires a server
  // Images will still work, just without Next.js optimization
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
