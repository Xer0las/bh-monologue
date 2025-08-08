// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Skip ESLint in production builds on Render so deploys don't fail on stylistic rules.
  eslint: { ignoreDuringBuilds: true },
  // Keep TypeScript type-checking on (safer). If you ever need to skip that too:
  // typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
