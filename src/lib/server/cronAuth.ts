import { timingSafeEqual } from "node:crypto";

/**
 * Only Vercel's scheduler gets into a cron route.
 *
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` on every scheduled call
 * when that variable is set. Compared in constant time. null when the secret
 * is missing, so the route can fail closed and say why — a route that closes
 * nights or sends email must not be open to anyone who finds it.
 */
export function cronAuthorised(request: Request): boolean | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;

  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}
