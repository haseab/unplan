import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow local reverse proxies to serve development assets and HMR.
  allowedDevOrigins: ["127.0.0.1"],
  env: {
    NEXT_PUBLIC_GOOGLE_CLIENT_ID:
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? "",
  },
  turbopack: {
    root: process.cwd(),
  },
  logging: {
    browserToTerminal: false,
    incomingRequests: {
      ignore: [/\/api\/debug-log(?:\?|$)/],
    },
  },
};


// Managed previews use their assigned origin and isolated caches. Normal development is unchanged.
if (process.env.DEV_SESSION_ID) {
  nextConfig.distDir = process.env.DEV_DIST_DIR;
  nextConfig.typescript = { ...nextConfig.typescript, tsconfigPath: process.env.DEV_TSCONFIG_PATH };
  nextConfig.allowedDevOrigins = [...(nextConfig.allowedDevOrigins ?? []), process.env.NEXT_DEV_ALLOWED_ORIGINS ?? "127.0.0.1"];
}

export default nextConfig;
