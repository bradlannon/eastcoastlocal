import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // got-scraping + header-generator load data files from disk at runtime —
  // they must be excluded from Turbopack/Webpack bundling.
  serverExternalPackages: ['got-scraping', 'header-generator'],
};

export default nextConfig;
