"use client";

import { useMemo, useState } from "react";
import { nameKey } from "@/lib/names";
import type { RosterEntry } from "@/lib/types";

export type PickerOption = {
  driverId: string;
  fullName: string;
  nameKey: string;
  /** Tonight's roster row, when this driver is on it. */
  roster?: RosterEntry;
  /** Already has a line on tonight's sheet. */
  entered: boolean;
};

/**
 * Driver autocomplete, ordered by who the dispatcher is most likely to be
 * typing: people on tonight's roster who have not called in yet, then people
 * already entered, then everyone else in the database.
 *
 * Enter is doing two jobs on this screen — pick a driver, or submit the whole
 * entry — so it only ever picks when the list is actually open with something
 * highlighted, and otherwise falls through to the form.
 */
export function DriverPicker({
  value,
  onChange,
  options,
  onPick,
  onAddNew,
  inputRef,
}: {
  value: string;
  onChange: (next: string) => void;
  options: PickerOption[];
  onPick: (option: PickerOption) => void;
  onAddNew: (fullName: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const key = nameKey(value);

  const matches = useMemo(() => {
    const pool = key
      ? options.filter((option) => option.nameKey.includes(key))
      : options;

    return [...pool]
      .sort((a, b) => {
        // Not yet on the sheet and on tonight's roster: almost always the one.
        const rank = (option: PickerOption) =>
          option.roster ? (option.entered ? 1 : 0) : 2;
        if (rank(a) !== rank(b)) return rank(a) - rank(b);

        // Then whoever starts with what was typed.
        const starts = (option: PickerOption) =>
          key && option.nameKey.startsWith(key) ? 0 : 1;
        if (starts(a) !== starts(b)) return starts(a) - starts(b);

        return a.fullName.localeCompare(b.fullName);
      })
      .slice(0, 8);
  }, [options, key]);

  const exact = options.some((option) => option.nameKey === key);
  const canAdd = key.length > 1 && !exact;
  /** The "add" row sits after the matches and shares the same highlight index. */
  const rows = matches.length + (canAdd ? 1 : 0);

  function choose(index: number) {
    if (index < matches.length) onPick(matches[index]);
    else if (canAdd) onAddNew(value.trim());
    setOpen(false);
    setHighlight(0);
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setHighlight((current) => {
              if (rows === 0) return 0;
              const step = event.key === "ArrowDown" ? 1 : -1;
              return (current + step + rows) % rows;
            });
            return;
          }

          if (event.key === "Escape") {
            setOpen(false);
            return;
          }

          // Only intercept Enter when there is genuinely something to pick.
          if (event.key === "Enter" && open && rows > 0) {
            event.preventDefault();
            choose(highlight);
          }
        }}
        placeholder="Driver name"
        aria-label="Driver name"
        autoComplete="off"
        spellCheck={false}
        className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-[15px] font-medium text-ink outline-none transition-colors placeholder:font-normal placeholder:text-ink-faint focus:border-brand"
      />

      {open && rows > 0 ? (
        <ul
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-line-strong bg-surface py-1 shadow-lg shadow-ink/5"
          /*
           * Never let a press in here blur the input.
           *
           * The list used to close on blur after a short delay, which meant a
           * click only landed if the mouse button came back up fast enough.
           * Holding it a moment — which is most clicks — closed the list under
           * the cursor and the pick was lost. Killing the blur outright is the
           * fix: focus stays in the field, and only the click matters.
           */
          onMouseDown={(event) => event.preventDefault()}
        >
          {matches.map((option, index) => (
            <li key={option.driverId}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(index)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] transition-colors ${
                  highlight === index ? "bg-brand-soft" : ""
                }`}
              >
                <span
                  className={`min-w-0 flex-1 truncate font-medium ${
                    option.entered ? "text-ink-faint line-through" : "text-ink"
                  }`}
                >
                  {option.fullName}
                </span>
                {option.entered ? (
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                    Entered
                  </span>
                ) : option.roster ? null : (
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                    Not on roster
                  </span>
                )}
              </button>
            </li>
          ))}

          {canAdd ? (
            <li>
              <button
                type="button"
                onMouseEnter={() => setHighlight(matches.length)}
                onClick={() => choose(matches.length)}
                className={`flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-[14px] transition-colors ${
                  highlight === matches.length ? "bg-brand-soft" : ""
                }`}
              >
                <span className="font-semibold text-brand">
                  Add &ldquo;{value.trim()}&rdquo;
                </span>
                <span className="text-[12px] text-ink-faint">
                  to the database
                </span>
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
