import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No `output: "standalone"` — Vercel handles build output natively
  typescript: {
    ignoreBuildErrors: true, // TODO: fix type errors and re-enable before production launch
  },
  eslint: {
    ignoreDuringBuilds: true, // TODO: fix warnings and re-enable before production launch
  },
  // Prisma needs to be generated before the build can compile API routes
  // The postinstall script handles this, but we also set it here for safety
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
