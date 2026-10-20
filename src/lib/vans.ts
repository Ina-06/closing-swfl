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
 */
export function vanKey(van: string): string {
  return cleanVan(van)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/(^|[^0-9])0+(?=[0-9])/g, "$1");
}

/**
 * The van a job is about: the front of its line.
 *
 * A job is "BR.03 - Rear door sticks", so the van is whatever is before the
 * first " - ". A line typed by hand without the dash — "BR.03 rear door" —
 * still starts with the van, so that falls back to the first word. A line
 * that starts with a word rather than a van simply finds nothing in the
 * database, which is the right answer.
 */
export function vanOfTitle(title: string): string {
  const line = title.trim();
  const dashed = /^(.+?)\s+-\s/.exec(line);
  if (dashed) return dashed[1];
  return line.split(/\s+/)[0] ?? "";
}
