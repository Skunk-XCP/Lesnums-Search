import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.lesnumeriques.com",
        pathname: "/**",
      },
    ],
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
