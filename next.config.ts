import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * firebase-admin is Node-only: it reaches for the filesystem, native crypto
   * and dynamic requires that no bundler can follow. Leaving it external means
   * it is loaded from node_modules at runtime, as its authors intended.
   *
   * This is not what fixed the ERR_REQUIRE_ESM crash — the jose override in
   * package.json did — but it keeps the Admin SDK out of the bundler's hands,
   * which is where that class of failure comes from.
   */
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
