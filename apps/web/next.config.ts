import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "../..");

const nextConfig: NextConfig = {
  transpilePackages: ["@gcp-sre/shared"],
  outputFileTracingRoot: root,
};

export default nextConfig;
