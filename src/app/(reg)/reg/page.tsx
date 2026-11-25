import { cookies } from "next/headers";
import { RegApp } from "@/components/reg/RegApp";
import { PIN_COOKIE, pinCookieOk } from "@/lib/server/regAccess";

/**
 * reg.swfl.app (and /reg on the main domain): the driver's registration lookup.
 *
 * Whether to ask for the PIN is settled here, on the server, from the httpOnly
 * cookie — so a phone that already has it opens straight onto the search box.
 */
export const dynamic = "force-dynamic";

export default async function RegPage() {
  const jar = await cookies();
  const locked = !pinCookieOk(jar.get(PIN_COOKIE)?.value);
  return <RegApp locked={locked} />;
}
