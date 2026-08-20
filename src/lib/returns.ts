/**
 * Returns parsing.
 *
 * `2R 1 RNI 1 Can't find address` — a total, then a reason per count.
 *
 * This field is typed fast, mid-wave, one-handed, while a driver is on the
 * phone. It must never block, never throw and never lose a character. Every
 * result here carries the raw string through untouched; parsing is something
 * we do *in addition to* keeping what was typed, never instead of it.
 */

export type ReturnsReason = { count: number; text: string };

export type ParsedReturns = {
  /** Exactly what was typed. Stored verbatim, always. */
  raw: string;
  /** Total from the leading `\d+R`, or null when there is nothing to read. */
  count: number | null;
  reasons: ReturnsReason[];
  /** Drives the soft amber warning. Never blocks a save. */
  mismatch: boolean;
  /** The warning to show inline, or null when nothing is wrong. */
  warning: string | null;
};

export const EMPTY_RETURNS: ParsedReturns = {
  raw: "",
  count: null,
  reasons: [],
  mismatch: false,
  warning: null,
};

/**
 * Split a line into `<count> <text>` segments.
 *
 * The lookahead is what makes free text safe: a reason runs until the next
 * "number followed by a space", so "Unsafe due to dog" survives intact and
 * "2 Damaged 1 RNI" still splits into two.
 *
 * Exported because the station types infractions the same way — "1 speeding",
 * "2 distraction" — and that is one habit, not two. It should be read by one
 * piece of code.
 */
export function parseReasons(tail: string): ReturnsReason[] {
  const reasons: ReturnsReason[] = [];
  const segment = /(\d+)\s+(.+?)(?=\s+\d+\s+|$)/g;

  for (const match of tail.matchAll(segment)) {
    const text = match[2].trim();
    if (text) reasons.push({ count: Number(match[1]), text });
  }

  return reasons;
}

export function parseReturns(raw: string): ParsedReturns {
  const trimmed = raw.trim();

  // Nothing typed yet is not a failure — most drivers have no returns.
  if (!trimmed) return { ...EMPTY_RETURNS, raw };

  const total = /^(\d+)\s*R\b/i.exec(trimmed);

  // No leading total. Keep every character, flag it, move on.
  if (!total) {
    return {
      raw,
      count: null,
      reasons: parseReasons(trimmed),
      mismatch: true,
      warning: "No 2R-style total in there. Saved exactly as typed.",
    };
  }

  const count = Number(total[1]);
  const reasons = parseReasons(trimmed.slice(total[0].length));
  const sum = reasons.reduce((running, reason) => running + reason.count, 0);

  // Only compare once reasons exist. Warning on a bare "2R" would fire on
  // every keystroke of a line that is still being typed.
  const mismatch = reasons.length > 0 && sum !== count;

  return {
    raw,
    count,
    reasons,
    mismatch,
    warning: mismatch
      ? `Reasons add up to ${sum}, total says ${count}. Saved either way.`
      : null,
  };
}

/** One-line echo of what was understood, for the live preview under the field. */
export function describeReturns(parsed: ParsedReturns): string | null {
  if (parsed.count === null && parsed.reasons.length === 0) return null;

  if (parsed.count === 0 && parsed.reasons.length === 0) return "No returns";

  const head =
    parsed.count === null
      ? "Unknown total"
      : `${parsed.count} return${parsed.count === 1 ? "" : "s"}`;

  if (parsed.reasons.length === 0) return head;

  return `${head} — ${parsed.reasons
    .map((reason) => `${reason.count} × ${reason.text}`)
    .join(", ")}`;
}
