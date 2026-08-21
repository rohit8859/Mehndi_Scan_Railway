import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Disable type-checking during production builds to save compilation memory on Railway
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
