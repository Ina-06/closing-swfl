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
  /**
   * exceljs is here for the same reason: a CommonJS library over a pile of
   * stream and zip packages. It bundled cleanly, but so did the Admin SDK, and
   * that one still failed on the first real request. Loading it from
   * node_modules keeps the workbook route out of that class of failure.
   */
  serverExternalPackages: ["firebase-admin", "exceljs"],
};

export default nextConfig;
