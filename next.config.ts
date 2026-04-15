import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable Turbopack optimizations
  turbopack: {
    root: __dirname,
    // Optimize memory usage for M2 MacBook
    resolveAlias: {
      "@": __dirname,
    },
  },
  // Disable source maps in development for faster builds
  productionBrowserSourceMaps: false,
  // Optimize image handling
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // Optimize webpack
  webpack: (config, { isServer }) => {
    // Optimize bundle splitting
    config.optimization = {
      ...config.optimization,
      minimize: false, // Disable minimization in dev mode
    };
    
    // Reduce memory usage
    if (!isServer) {
      config.optimization.runtimeChunk = 'single';
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          default: {
            minChunks: 2,
            priority: -20,
            reuseExistingChunk: true,
          },
        },
      };
    }

    return config;
  },
  // Experimental optimizations for development
  experimental: {
    // Optimize dev server performance
    optimizePackageImports: ['react-icons', '@stellar/stellar-sdk'],
  },
};

export default nextConfig;
