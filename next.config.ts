import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright relies on `__dirname`-relative filesystem lookups (launching
  // browser binaries) that break if the bundler rewrites them, so it must be
  // required natively at runtime.
  serverExternalPackages: ["playwright", "playwright-core"],
};

export default nextConfig;
