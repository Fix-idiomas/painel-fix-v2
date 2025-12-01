import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  // Explicitly set the root to this workspace to avoid Next.js
  // inferring the parent directory due to multiple lockfiles.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
