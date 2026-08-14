"use client";

import { Button } from "@/components/ui/Button";
import { FLAGS, FlagToggle, type Flag } from "@/components/ui/FlagToggle";
import type { Driver } from "@/lib/types";

export type RosterDraft = {
  /** Local key only — the driver id comes from matching, live. */
  id: string;
  name: string;
  /** BUD, TRN and RES — set here, for tonight only. */
  flags: Record<Flag, boolean>;
};

/**
 * One line of the pasted roster, after matching.
 *
 * The name stays editable the whole time. A Cortex paste with a typo is the
 * normal case, not an error case, and fixing the spelling here re-matches the
 * row on the next keystroke — no mode to enter, nothing to confirm.
 */
export function RosterRow({
  index,
  draft,
  match,
  suggestion,
  adding,
  onChange,
  onRemove,
  onAddToDatabase,
}: {
  index: number;
  draft: RosterDraft;
  /** The driver this row resolved to, if any. */
  match: Driver | null;
  /** A near miss worth offering when nothing matched. */
  suggestion: Driver | null;
  adding: boolean;
  onChange: (next: RosterDraft) => void;
  onRemove: () => void;
  onAddToDatabase: () => void;
}) {
  const unmatched = !match;

  return (
    <li
      className={`grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2.5 last:border-0 sm:flex sm:gap-3 ${
        unmatched ? "bg-warn-soft/40" : ""
      }`}
    >
      <span className="tnum w-6 shrink-0 text-right font-mono text-[12px] text-ink-faint">
        {index + 1}
      </span>

      <input
        value={draft.name}
        onChange={(event) => onChange({ ...draft, name: event.target.value })}
        aria-label={`Driver ${index + 1} name`}
        spellCheck={false}
        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-[15px] font-medium text-ink outline-none transition-colors hover:border-line focus:border-brand focus:bg-surface"
      />

      <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 sm:col-auto sm:flex-nowrap">
        {unmatched ? (
          <>
            {suggestion ? (
              <button
                type="button"
                onClick={() =>
                  onChange({ ...draft, name: suggestion.fullName })
                }
                className="rounded-md px-1.5 py-1 text-[12px] text-ink-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-brand hover:decoration-brand"
              >
                Did you mean {suggestion.fullName}?
              </button>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              onClick={onAddToDatabase}
              loading={adding}
              disabled={!draft.name.trim()}
            >
              Add to database
            </Button>
          </>
        ) : null}

        <div className="flex shrink-0 items-center gap-1">
          {FLAGS.map((flag) => (
            <FlagToggle
              key={flag}
              flag={flag}
              on={draft.flags[flag]}
              label={draft.name || `Driver ${index + 1}`}
              onChange={(next) =>
                onChange({ ...draft, flags: { ...draft.flags, [flag]: next } })
              }
            />
          ))}
        </div>

        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${draft.name || `driver ${index + 1}`} from tonight's roster`}
          /* ml-1 keeps it off the flag pills — they sit side by side all night. */
          className="ml-1 grid size-7 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-overdue-soft hover:text-overdue"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="size-4"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </li>
  );
}
