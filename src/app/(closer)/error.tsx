"use client";

import { Crashed } from "@/components/Crashed";

export default function Error(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <Crashed {...props} where="the closer screen" />;
}
