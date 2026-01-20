import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Empty turbopack config to acknowledge we're using Turbopack
  // The typst.ts WASM modules are loaded dynamically via CDN
  turbopack: {},
};

export default nextConfig;
