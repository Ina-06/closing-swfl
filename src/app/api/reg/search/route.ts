import { getAdminDb } from "@/lib/firebase/admin";
import { stationDateKey } from "@/lib/constants";
import { activeRegistration, driverState, normalizeSearch } from "@/lib/regDocs";
import { daysUntil, isRegistrationDate, registrationLabel } from "@/lib/registration";
import {
  REG_HEADERS,
  allowSearch,
  clientIp,
  pinCookieOf,
  pinCookieOk,
  regFail,
  viewToken,
} from "@/lib/server/regAccess";
import { ownQrPath, readDocs } from "@/lib/server/regStore";
import { vanKey, vanNumber } from "@/lib/vans";
import type { RegistrationDoc } from "@/lib/types";

/**
 * GET /api/reg/search?q=56 — the driver's search.
 *
 * Exact matches only, on the van number, and never more than two vans: this
 * is a lookup for the van in front of you, not a way to list the fleet. Only
 * vans marked "With us" are searched.
 *
 *   "RT.56", "rt 56", "RT-056"   → RT.56 exactly
 *   "56"                          → every van numbered 56 — RT.56, BR.56 —
 *                                   if there are one or two of them
 *   "RT56" with EC-RT.56 on file  → EC-RT.56 (a prefix stuck on is the same van)
 *
 * Three or more vans with that number answer "type the letters too", and name
 * none of them.
 *
 * Each result carries a ten-minute token per document; /api/reg/doc wants it.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RESULTS = 2;

type Van = {
  id: string;
  van: string;
  key: string;
  registrationExpires: string;
  docs: RegistrationDoc[];
  hasQr: boolean;
};

function matches(query: string, vans: Van[]): Van[] {
  const exact = vans.filter((van) => van.key === query);
  if (exact.length > 0) return exact;

  const number = vanNumber(query);
  if (!number) return [];
  const bare = query === number;
  return vans.filter(
    (van) =>
      vanNumber(van.key) === number &&
      (bare || van.key.endsWith(query) || query.endsWith(van.key)),
  );
}

export async function GET(request: Request) {
  if (!pinCookieOk(pinCookieOf(request))) {
    return regFail("Enter the driver PIN first.", 401, { pin: true });
  }

  try {
    if (!(await allowSearch(clientIp(request)))) {
      return regFail("Too many searches. Wait a minute and try again.", 429);
    }
  } catch (error) {
    console.error("Could not count a search:", error);
    return regFail("Something went wrong. Try again in a moment.", 500);
  }

  const raw = new URL(request.url).searchParams.get("q") ?? "";
  const query = vanKey(normalizeSearch(raw));
  if (!query) return regFail("Type the van number.", 400);

  let vans: Van[];
  try {
    const snapshot = await getAdminDb().collection("vans").get();
    vans = snapshot.docs
      .filter((document) => document.get("active") !== false)
      .map((document) => {
        const data = document.data();
        const van = typeof data.van === "string" ? data.van : "";
        const expires = typeof data.registrationExpires === "string" ? data.registrationExpires : "";
        return {
          id: document.id,
          van,
          key: vanKey(van),
          registrationExpires: isRegistrationDate(expires) ? expires : "",
          docs: readDocs(data.registrationDocs) as unknown as RegistrationDoc[],
          hasQr: !!ownQrPath(document.id, data.qrPath),
        };
      })
      .filter((van) => van.key);
  } catch (error) {
    console.error("Could not read the vans:", error);
    return regFail("Something went wrong. Try again in a moment.", 500);
  }

  const found = matches(query, vans);
  if (found.length > MAX_RESULTS) {
    return Response.json({ results: [], tooMany: true }, { headers: REG_HEADERS });
  }

  const today = stationDateKey();
  const results = found.map((van) => {
    const doc = activeRegistration(van.docs.map((entry) => ({ ...entry, active: entry.active === true })));
    return {
      van: van.van,
      expires: van.registrationExpires,
      expiresLabel: registrationLabel(van.registrationExpires),
      state: driverState(van.registrationExpires, today),
      daysLeft: van.registrationExpires ? daysUntil(van.registrationExpires, today) : null,
      registration: doc
        ? { path: `/api/reg/doc/${van.id}/${doc.id}`, ...viewToken(van.id, doc.id) }
        : null,
      qr: van.hasQr ? { path: `/api/reg/doc/${van.id}/qr`, ...viewToken(van.id, "qr") } : null,
    };
  });

  return Response.json({ results, tooMany: false }, { headers: REG_HEADERS });
}
