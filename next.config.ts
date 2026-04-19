import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable source maps in development for faster builds
  productionBrowserSourceMaps: false,
  // Optimize image handling
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // Experimental optimizations for development
  experimental: {
    // Optimize dev server performance
    optimizePackageImports: ['react-icons', '@stellar/stellar-sdk'],
  },
};

export default nextConfig;
