import type { Metadata, Viewport } from "next";
import "../globals.css";

/**
 * The root of reg.swfl.app — its own, not the app's.
 *
 * A separate root layout so the driver page loads none of what the station
 * app needs: no Firebase sign-in, no web fonts. Drivers open this at the
 * roadside with an officer waiting; it has to be up in a second on one bar.
 */

export const metadata: Metadata = {
  title: "SWFL Reg & QRs",
  description: "Van registration lookup for SWFL drivers.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RegRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-white font-system text-reg-black antialiased">{children}</body>
    </html>
  );
}
