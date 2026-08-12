"use client";

import { useEffect, useState } from "react";
import { stationDateLabel } from "@/lib/constants";

/**
 * Today's date, in the station timezone.
 *
 * These pages prerender as static, so computing the date on the server would
 * freeze it at build time. We resolve it after mount instead, and refresh on
 * focus — Karim's phone sits in his pocket across midnight and needs to roll
 * over without a reload.
 *
 * The device clock decides *which day it is*; the station timezone decides how
 * it is written. Clock-out times never come from here — those are server
 * timestamps.
 */
export function StationDate({ className }: { className?: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setLabel(stationDateLabel());
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  return (
    <span className={className} suppressHydrationWarning>
      {label ?? " "}
    </span>
  );
}
