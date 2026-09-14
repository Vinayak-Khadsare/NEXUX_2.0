import type { NextConfig } from "next";

const staticExport = process.env.NEXUS_STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  experimental: { proxyTimeout: 120000 },
  ...(staticExport ? { output: "export" as const, distDir: "out" } : {}),
  async rewrites() {
    if (staticExport) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_URL || "http://127.0.0.1:8000"}/api/:path*`,
      }
    ];
  },
};

export default nextConfig;
