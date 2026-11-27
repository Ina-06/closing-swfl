import { NextResponse, type NextRequest } from "next/server";

/**
 * reg.swfl.app — the driver's registration lookup, on its own host.
 *
 * On that host every page path is served from /reg: reg.swfl.app/ is /reg,
 * reg.swfl.app/robots.txt is /reg/robots.txt. Only /api/reg/* answers there
 * among the API routes, so the station app's pages and routes are simply not
 * on the driver's host. On swfl.app, /reg still works, for testing.
 *
 * Everything for drivers carries X-Robots-Tag: noindex, on top of the page's
 * own meta tag, so no search engine lists a page that leads to registrations.
 */

const NOINDEX = "noindex, nofollow, noarchive";

function isRegHost(host: string | null) {
  return !!host && /^reg\./i.test(host);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isRegHost(request.headers.get("host"))) {
    if (pathname.startsWith("/api/")) {
      if (!pathname.startsWith("/api/reg/")) return new NextResponse(null, { status: 404 });
      const response = NextResponse.next();
      response.headers.set("X-Robots-Tag", NOINDEX);
      return response;
    }

    if (pathname !== "/reg" && !pathname.startsWith("/reg/")) {
      const url = request.nextUrl.clone();
      url.pathname = pathname === "/" ? "/reg" : `/reg${pathname}`;
      const response = NextResponse.rewrite(url);
      response.headers.set("X-Robots-Tag", NOINDEX);
      return response;
    }
  }

  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", NOINDEX);
  return response;
}

export const config = {
  matcher: [
    // Every request on the reg host, bar the build's own files and the PDF
    // viewer's decoders (public/pdfjs), which the registration preview loads.
    {
      source: "/((?!_next/static|_next/image|favicon.ico|pdfjs/).*)",
      has: [{ type: "host", value: "reg\\..*" }],
    },
    // And the driver paths on any host.
    "/reg/:path*",
    "/api/reg/:path*",
  ],
};
