import type { NextConfig } from "next";

// A static build: no server, hosted free anywhere, and the form a desktop wrapper
// would need later (MASTER_BUILD_SPEC.md section 7.1).
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
