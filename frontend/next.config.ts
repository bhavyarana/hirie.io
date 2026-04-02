import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  allowedDevOrigins: ["https://hirie-io.vercel.app", "http://localhost:3000"]
};

export default nextConfig;
