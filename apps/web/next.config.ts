import type { NextConfig } from "next";
import { resolve } from "path";
import { withSentryConfig } from "@sentry/nextjs";
import withBundleAnalyzer from "@next/bundle-analyzer";
import { LEGACY_REDIRECTS } from "./src/lib/redirects/legacy-redirects";

const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  transpilePackages: ["@school/ui"],
  turbopack: {
    root: resolve(__dirname, "../.."),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  async redirects() {
    return LEGACY_REDIRECTS.map((entry) => ({ ...entry }));
  },
};

export default withSentryConfig(withAnalyzer(nextConfig), {
  // Suppress source-map upload logs in CI
  silent: true,

  // Widen client file upload for better stack traces
  widenClientFileUpload: true,

  // Proxy Sentry events through /monitoring to avoid ad blockers
  tunnelRoute: "/monitoring",

  // Disable Sentry SDK logger to reduce bundle size
  disableLogger: true,
});
