import { cleanVan } from "@/lib/repairs";

/**
 * Van numbers, made comparable — and the van a job is about.
 *
 * Pure, so the rules for what counts as "the same van" can be tested on their
 * own, without Firestore.
 */

/**
 * A van number reduced to what identifies it.
 *
 * "BR.03", "br 03", "BR-3" and "BR.3" are all BR3: case, spaces and
 * punctuation are how somebody happened to type it, and so are zeros in front
 * of a number — the yard says "B R three" whichever way it is painted. Only
 * leading zeros go: BR.30 stays BR30, and a van called 0 stays 0.
 *
 * "VAN 150" and "#150" are 150, the same as on the repairs board — see
 * cleanVan.
 *
 * A note about the van is not part of its number. "RT.112 (XL)" and
 * "RT.112 XL" are RT112 — anything in brackets goes, and so does a word of
 * letters after the number — so the vans database can say which are the XLs
 * without a job written "RT.112" missing it.
 */
export function vanKey(van: string): string {
  return cleanVan(van)
    .replace(/\([^)]*\)?/g, " ")
    .replace(/([0-9])\s+[A-Za-z]+\s*$/, "$1")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/(^|[^0-9])0+(?=[0-9])/g, "$1");
}

/**
 * The van's number — the last run of digits in it: RT.112 is 112, BR.03 is
 * 3, EC-RT.82 is 82.
 *
 * Karim and Sam often write a van by its number alone — "112 left mirror
 * side out" — when the database has it as RT.112. "" for a van with no digits.
 */
export function vanNumber(key: string): string {
  return /([0-9]+)[^0-9]*$/.exec(key)?.[1] ?? "";
}

/**
 * The database's van for a job, or null.
 *
 * The exact van first: BR.03 on the job is BR.03 in the database. Failing
 * that, the number alone, so "112 - Left mirror" finds RT.112 — but only when
 * exactly one van in the database has that number. If RT.112 and BR.112 are
 * both in it, a bare 112 could be either, and a card showing the wrong van's
 * VIN is worse than one showing none.
 *
 * Letters in front are allowed to be extra, not different. EC-RT.82 finds
 * RT.82, and RT.82 finds EC-RT.82 — one is the other with a prefix stuck on.
 * But BR.112 does not find RT.112: the letters were written, and they say it
 * is a different van. Either one finds a van written as the bare number.
 */
export function findVan<T extends { key: string }>(
  title: string,
  byKey: ReadonlyMap<string, T>,
  byNumber: ReadonlyMap<string, readonly T[]>,
): T | null {
  const key = vanKey(vanOfTitle(title));
  if (!key) return null;

  const exact = byKey.get(key);
  if (exact) return exact;

  const number = vanNumber(key);
  if (!number) return null;
  const bare = key === number;
  const candidates = (byNumber.get(number) ?? []).filter(
    (van) =>
      bare ||
      van.key === number ||
      key.endsWith(van.key) ||
      van.key.endsWith(key),
  );
  return candidates.length === 1 ? candidates[0] : null;
}

/**
 * The van a job is about: the front of its line.
 *
 * A job is "BR.03 - Rear door sticks", so the van is whatever is before the
 * first " - ". A line typed by hand without the dash — "BR.03 rear door" —
 * still starts with the van, so that falls back to the first word — or the
 * first two, when the letters and the number were written apart: "RT 112
 * left mirror" is RT 112. A line that starts with a word rather than a van
 * simply finds nothing in the database, which is the right answer.
 */
export function vanOfTitle(title: string): string {
  const line = title.trim();
  const dashed = /^(.+?)\s+-\s/.exec(line);
  if (dashed) return dashed[1];
  const [first = "", second = ""] = line.split(/\s+/);
  if (/^[A-Za-z]{1,4}[.#-]?$/.test(first) && /^\d/.test(second)) {
    return `${first} ${second}`;
  }
  return first;
}
