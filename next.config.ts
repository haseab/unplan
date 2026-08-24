import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

export default nextConfig;
