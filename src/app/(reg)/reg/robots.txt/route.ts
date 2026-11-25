/** reg.swfl.app/robots.txt (rewritten here by src/proxy.ts): nothing on this host is for search engines. */
export function GET() {
  return new Response("User-agent: *\nDisallow: /\n", {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
