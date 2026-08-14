"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Top-bar link that knows when it is the current screen. */
export function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-2.5 py-1.5 transition-colors ${
        active
          ? "bg-brand-soft text-brand"
          : "text-ink-muted hover:bg-sunken hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
