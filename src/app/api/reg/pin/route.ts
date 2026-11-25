import {
  PIN_COOKIE,
  REG_HEADERS,
  clientIp,
  driverPin,
  noteWrongPin,
  pinCookieValue,
  pinLocked,
  pinMatches,
  regFail,
} from "@/lib/server/regAccess";

/**
 * The driver PIN, typed once per phone.
 *
 * A right PIN earns an httpOnly cookie good for 30 days; the browser's script
 * never sees it, so nothing on the page can copy it out. Wrong PINs are
 * counted per address (10 in 15 minutes) and for the whole station (50), in
 * Firestore so every server instance shares the count.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!driverPin()) return Response.json({ ok: true }, { headers: REG_HEADERS });

  let pin = "";
  try {
    const body = (await request.json()) as { pin?: unknown };
    pin = typeof body.pin === "string" ? body.pin : "";
  } catch {
    return regFail("Malformed request.", 400);
  }
  if (!/^\d{4,6}$/.test(pin.trim())) return regFail("The PIN is 4 to 6 digits.", 400);

  const ip = clientIp(request);
  try {
    if (await pinLocked(ip)) {
      return regFail("Too many wrong PINs. Wait 15 minutes and try again, or call dispatch.", 429);
    }
  } catch (error) {
    console.error("Could not read the PIN throttle:", error);
    return regFail("Something went wrong. Try again in a moment.", 500);
  }

  if (!pinMatches(pin)) {
    await noteWrongPin(ip).catch((error: unknown) => console.error("Could not count a wrong PIN:", error));
    return regFail("That PIN is not right.", 401);
  }

  const { value, maxAge } = pinCookieValue();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return Response.json(
    { ok: true },
    {
      headers: {
        ...REG_HEADERS,
        "Set-Cookie": `${PIN_COOKIE}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`,
      },
    },
  );
}
