/**
 * Turning a pasted block of Cortex names into roster rows.
 *
 * Everything here is reversible by hand: the review list shows exactly what
 * each line became and lets the dispatcher edit it before anything is saved.
 * That is the licence for cleaning input at all — nothing is guessed silently.
 */

/** Matching key. Case, accents, punctuation and double spaces all stop mattering. */
export function nameKey(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Apostrophes disappear rather than becoming spaces, so O'Neil, ONeil and
    // O Neil are all the same person.
    .replace(/['‘’ʼ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "SMITH" → "Smith", but "McDonald" pasted as-is is left alone. */
function titleCaseWord(word: string): string {
  const lower = word.toLowerCase();
  if (lower.startsWith("mc") && lower.length > 2) {
    return "Mc" + lower[2].toUpperCase() + lower.slice(3);
  }
  if (lower.startsWith("mac") && lower.length > 4) {
    return "Mac" + lower[3].toUpperCase() + lower.slice(4);
  }
  if (lower.startsWith("o'") && lower.length > 2) {
    return "O'" + lower[2].toUpperCase() + lower.slice(3);
  }
  // Hyphenated and apostrophed parts each get their own capital.
  return lower.replace(/(^|[-'])([a-z])/g, (_, sep, letter) => sep + letter.toUpperCase());
}

/**
 * Cortex exports names in a few shapes. We normalise the obvious ones and
 * leave anything unusual for the dispatcher to fix in the review list.
 */
export function cleanRosterLine(line: string): string {
  let name = line.trim();

  // "1. John Smith", "12) John Smith", "- John Smith"
  name = name.replace(/^[-•*]\s*/, "").replace(/^\d+\s*[.)]?\s+/, "");

  // Transporter ids and badge numbers hanging off the end.
  name = name.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");

  /**
   * Tab-separated columns. "Jordan Alvarez<tab>Route 12" is a name plus a
   * column we do not want; "Jordan<tab>Alvarez" is a first and last name split
   * across two. Telling them apart: if the first field already contains a
   * space it is the whole name, otherwise the next word-only field joins it.
   */
  if (name.includes("\t")) {
    const columns = name.split("\t").map((column) => column.trim());
    name = columns[0];
    if (name && !name.includes(" ") && /^[\p{L}'-]+$/u.test(columns[1] ?? "")) {
      name = `${name} ${columns[1]}`;
    }
  }

  const commaParts = name.split(",").map((part) => part.trim()).filter(Boolean);
  if (commaParts.length === 2 && commaParts.every((part) => part.split(/\s+/).length <= 3)) {
    name = `${commaParts[1]} ${commaParts[0]}`;
  } else if (commaParts.length > 1) {
    name = commaParts[0];
  }

  name = name.replace(/\s+/g, " ").trim();

  // ALL CAPS and all lowercase are both export artefacts, not how anyone
  // writes their name. Mixed case is left exactly as pasted, because that is
  // the one case where the capitals might be deliberate.
  if (name && (name === name.toUpperCase() || name === name.toLowerCase())) {
    name = name.split(" ").map(titleCaseWord).join(" ");
  }

  return name;
}

/** Split a pasted block into cleaned names, in order, without duplicates. */
export function parseRoster(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    const name = cleanRosterLine(line);
    if (!name) continue;

    const key = nameKey(name);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    names.push(name);
  }

  return names;
}

/** Levenshtein, capped — we only care whether two names are *nearly* the same. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let best = i;

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
      best = Math.min(best, current[j]);
    }

    // Whole row already worse than the cap: it can only get worse.
    if (best > max) return max + 1;
    previous = current;
  }

  return previous[b.length];
}

/**
 * The closest driver to an unmatched name, if one is close enough to be worth
 * offering. Deliberately conservative — a wrong suggestion that gets accepted
 * puts the wrong person on the sheet.
 */
export function findSuggestion<T extends { nameKey: string }>(
  name: string,
  candidates: readonly T[],
): T | null {
  const key = nameKey(name);
  if (key.length < 4) return null;

  // One typo for a short name, two for a long one.
  const tolerance = key.length > 10 ? 2 : 1;

  let best: T | null = null;
  let bestDistance = tolerance + 1;

  for (const candidate of candidates) {
    const distance = editDistance(key, candidate.nameKey, tolerance);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return bestDistance <= tolerance ? best : null;
}
