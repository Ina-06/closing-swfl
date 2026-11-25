"use client";

import { RepairsBoard } from "@/components/repairs/RepairsBoard";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * The repairs portal, which is one board and nothing else.
 *
 * Shorter than the other three portals' pages because there is no night to
 * resolve. The closer's and HR's screens both open by working out which
 * session they are looking at and saying so plainly when there is not one yet;
 * this board has no such moment. It is the same list at six in the morning as
 * it is at midnight, and an empty one means the vans are fine rather than that
 * nobody has started.
 */
export default function RepairsPage() {
  const auth = useAuth();

  return <RepairsBoard uid={auth.status === "signedIn" ? auth.uid : ""} />;
}
