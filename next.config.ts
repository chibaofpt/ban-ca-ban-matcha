import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { getStaticSecurityHeaders } from "./lib/securityHeaders";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: getStaticSecurityHeaders(process.env.VERCEL_ENV === "production"),
      },
    ];
  },
  images: {
    minimumCacheTTL: 31536000,
    qualities: [60, 75],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "nqwfbmghziubdhvtgyao.supabase.co",
        pathname: "/storage/v1/object/public/menu-images/**",
      },
      {
        protocol: "https",
        hostname: "mnklsbzkefuefpqvghrr.supabase.co",
        pathname: "/storage/v1/object/public/menu-images/**",
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  webpack: {
    automaticVercelMonitors: false,
    treeshake: { removeDebugLogging: true },
  },
});
