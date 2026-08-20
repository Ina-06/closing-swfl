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

  /**
   * When this build was made, in the station's timezone.
   *
   * The fallback behind the commit sha in BuildTag. Vercel supplies the sha and
   * that is the better answer, but this one cannot go missing — it is evaluated
   * here, during the build, whatever is or is not set in the environment. A
   * marker whose whole job is telling us which version a phone is running must
   * not be able to come back blank.
   */
  env: {
    NEXT_PUBLIC_BUILT_AT: new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/New_York",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  },
};

export default nextConfig;
