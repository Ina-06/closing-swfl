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
  const keys = vansOfTitle(title).map(vanKey).filter(Boolean);

  // Every way of reading the front of the line, exactly, before any of them
  // by number — "RT 112" should be RT112 before it is ever just 112.
  for (const key of keys) {
    const exact = byKey.get(key);
    if (exact) return exact;
  }

  for (const key of keys) {
    const number = vanNumber(key);
    if (!number) continue;
    const bare = key === number;
    const candidates = (byNumber.get(number) ?? []).filter(
      (van) =>
        bare ||
        van.key === number ||
        key.endsWith(van.key) ||
        van.key.endsWith(key),
    );
    if (candidates.length === 1) return candidates[0];
  }
  return null;
}

/**
 * The van a job is about, as the ways the front of its line can be read.
 *
 * The van is the first word with a number in it: "BR.03 - Rear door",
 * "119: Pass side mirror", "EC-RT.82✅ GRD leaking". Short codes written in
 * front of it are stepped over — "MT - RT.75 Front bumper", "NA - RT.87
 * Smells gasoline" — as long as they look like codes: capitals (MT, NA,
 * GRD, RT), "van", or one or two letters ("rt 112"). "Rear door 2 hinges"
 * stops at "Rear" and finds no van at all, which is the right answer.
 *
 * When the letters and the number were written apart — "RT 112 left mirror",
 * "VAN 150 - Tyre" — the two together are tried first, then the number on
 * its own. A code stuck on with a dash — "ZT- 88", "ZT-19" — is stepped over
 * the same way.
 */
export function vansOfTitle(title: string): string[] {
  const words = title.trim().split(/\s+/).slice(0, 5);
  // A code may have its dash stuck to it: "ZT- 88".
  const code = /^(?:[A-Z]{1,4}|[A-Za-z]{1,2}|[Vv]an)[.:#\-–—]?$/;
  const dash = /^[-–—:|/]+$/;

  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    if (/[0-9]/.test(word)) {
      const before = words[index - 1];
      const readings =
        before && code.test(before) && /^[0-9]/.test(word)
          ? [`${before} ${word}`, word]
          : [word];
      // A code glued on with a dash — "ZT-19", "EC-RT.82" — is also read
      // without it: 19, RT.82.
      const glued = /^[A-Za-z]{1,4}[-–—](.*[0-9].*)$/.exec(word);
      if (glued) readings.push(glued[1]);
      return readings;
    }
    if (!code.test(word) && !dash.test(word)) return [];
  }
  return [];
}
