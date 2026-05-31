import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@school/ui"],
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
