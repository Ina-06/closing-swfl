"use client";

import { useState } from "react";
import { CheckChips } from "@/components/ui/Checks";
import { FLAGS, FlagTag } from "@/components/ui/FlagToggle";
import {
  MetricSelect,
  PerformanceToggle,
  RescuesStepper,
} from "@/components/dispatch/EntryControls";
import { removeEntry, returnsFields, updateEntry } from "@/lib/db/entries";
import { CHECKS, stationTimeLabel } from "@/lib/constants";
import { describeReturns, parseReturns } from "@/lib/returns";
import type { Entry } from "@/lib/types";

/**
 * Everything entered so far, editable in place.
 *
 * ETAs change constantly — a driver says 9:45 and calls back at 10:20 — so
 * every dispatcher-owned field is editable straight from the row. There is no
 * edit mode and no save button: text commits on blur or Enter, buttons commit
 * on click.
 */
export function EntriesTable({
  nightKey,
  entries,
  uid,
}: {
  nightKey: string;
  entries: Entry[];
  uid: string;
}) {
  const [error, setError] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface/50 px-5 py-12 text-center">
        <p className="text-[15px] font-semibold text-ink-muted">
          Nobody on the sheet yet
        </p>
        <p className="mt-1 text-[13px] text-ink-faint">
          The first driver you enter above lands here, and on Karim&rsquo;s
          phone at the same time.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error ? (
        <p role="alert" className="text-[13px] font-medium text-overdue">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        {/* Sized to fit a laptop without sideways scrolling. The overflow is a
            fallback for genuinely narrow windows, not the normal case. */}
        <table className="w-full min-w-[1332px] table-fixed border-collapse text-left">
          <thead>
            <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
              <Th className="w-9 text-right">#</Th>
              <Th className="w-44">Name</Th>
              <Th className="w-20">ETA</Th>
              <Th className="w-48">Returns</Th>
              <Th className="w-20">Perf</Th>
              <Th className="w-24">Metric</Th>
              <Th className="w-32">Rescues</Th>
              <Th className="w-36">Infractions</Th>
              <Th className="w-40">Note</Th>
              {/* Everything Karim owns, in one column. Read-only here — the
                  rules reject a dispatcher write to any of it. */}
              <Th className="w-40">Yard</Th>
              <Th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <EntryRow
                key={entry.id}
                nightKey={nightKey}
                entry={entry}
                /* Position in the list, not the stored seq. Removing a row and
                   re-adding the driver must not leave a hole in the numbering —
                   this column is the row number on the sheet. */
                row={index + 1}
                uid={uid}
                onError={setError}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <th className={`px-3 py-2.5 font-semibold ${className}`}>{children}</th>;
}

function EntryRow({
  nightKey,
  entry,
  row,
  uid,
  onError,
}: {
  nightKey: string;
  entry: Entry;
  /** 1-based position on the sheet. Always contiguous. */
  row: number;
  uid: string;
  onError: (message: string | null) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  async function save(fields: Parameters<typeof updateEntry>[2]) {
    onError(null);
    try {
      await updateEntry(nightKey, entry.id, fields, uid);
    } catch (err) {
      onError(
        err instanceof Error ? err.message : "That edit did not save.",
      );
    }
  }

  const parsed = parseReturns(entry.returnsRaw);
  const done = entry.status === "clockedOut";
  const inYard = entry.status === "arrived";
  const stamped = entry.clockOut !== null;

  return (
    <tr className="border-b border-line align-middle last:border-0">
      <td className="tnum px-3 py-2 text-right font-mono text-[12px] text-ink-faint">
        {row}
      </td>

      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[14px] font-semibold">{entry.fullName}</span>
          {FLAGS.filter((flag) =>
            flag === "bud"
              ? entry.isBud
              : flag === "trn"
                ? entry.isTrainer
                : entry.isRescuer,
          ).map((flag) => (
            <FlagTag key={flag} flag={flag} />
          ))}
          {entry.addedByCloser ? (
            <span className="rounded-full border border-warn-line bg-warn-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warn">
              Unannounced
            </span>
          ) : null}
        </div>
      </td>

      <td className="px-3 py-2">
        {done || inYard ? (
          /* Once he is off the road the ETA is meaningless, so it comes off
             the sheet. The stored value is left alone rather than deleted —
             put him back on the list and it is there, as it was typed. */
          <span
            className="block px-2 text-[14px] text-ink-faint"
            title={entry.eta ? `ETA was ${entry.eta}` : undefined}
          >
            —
          </span>
        ) : (
          <CellInput
            value={entry.eta}
            onCommit={(eta) => save({ eta })}
            placeholder="9:45"
            ariaLabel={`ETA for ${entry.fullName}`}
            className="tnum font-mono"
          />
        )}
      </td>

      <td className="px-3 py-2">
        <CellInput
          value={entry.returnsRaw}
          onCommit={(raw) => save(returnsFields(parseReturns(raw)))}
          placeholder="0R"
          ariaLabel={`Returns for ${entry.fullName}`}
        />
        {entry.returnsMismatch ? (
          <p className="mt-1 text-[11px] font-medium text-warn">
            {parsed.warning ?? "Counts do not add up. Saved as typed."}
          </p>
        ) : parsed.reasons.length > 0 ? (
          <p className="mt-1 text-[11px] text-ink-faint">
            {describeReturns(parsed)}
          </p>
        ) : null}
      </td>

      <td className="px-3 py-2">
        <PerformanceToggle
          size="sm"
          value={entry.performance}
          onChange={(performance) => save({ performance })}
        />
      </td>

      <td className="px-3 py-2">
        <MetricSelect
          value={entry.metric}
          label={`Metric for ${entry.fullName}`}
          onChange={(metric) => save({ metric })}
        />
      </td>

      <td className="px-3 py-2">
        <RescuesStepper
          size="sm"
          value={entry.rescues}
          onChange={(rescues) => save({ rescues })}
        />
      </td>

      <td className="px-3 py-2">
        <CellInput
          value={entry.infractions}
          onCommit={(infractions) => save({ infractions })}
          placeholder="None"
          ariaLabel={`Infractions for ${entry.fullName}`}
        />
      </td>

      <td className="px-3 py-2">
        <CellInput
          value={entry.notes}
          onCommit={(notes) => save({ notes })}
          placeholder="—"
          ariaLabel={`Note for ${entry.fullName}, shown to the closer`}
        />
      </td>

      <td className="px-3 py-2">
        {stamped ? (
          // Stamped by the closer tapping Arrived. Not editable from here —
          // that time is the record, and it is his to correct.
          <span className="flex flex-col gap-0.5">
            <span className="tnum font-mono text-[13px] font-semibold text-arrived">
              {stationTimeLabel(entry.clockOut!.toDate())}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Stamped
            </span>
          </span>
        ) : (
          <>
            <CellInput
              value={entry.clockOutManual}
              onCommit={(clockOutManual) =>
                save({
                  clockOutManual,
                  // Typing a time here is what marks him done. Clearing it only
                  // undoes that — a driver Karim already has at the van stays
                  // where Karim put him.
                  status: clockOutManual.trim()
                    ? "clockedOut"
                    : done
                      ? "enroute"
                      : entry.status,
                })
              }
              placeholder="—"
              ariaLabel={`Clock-out reported for ${entry.fullName}`}
              className="tnum font-mono"
            />
            <span
              className={`mt-0.5 inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
                done
                  ? "border-arrived-line bg-arrived-soft text-arrived"
                  : inYard
                    ? "border-brand-line bg-brand-soft text-brand"
                    : "border-line bg-sunken text-ink-faint"
              }`}
            >
              {done ? "Clocked out" : inYard ? "In the yard" : "En route"}
            </span>
          </>
        )}

        <VanReadout entry={entry} />
      </td>

      <td className="px-3 py-2 text-right">
        {confirming ? (
          <span className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={async () => {
                onError(null);
                try {
                  await removeEntry(nightKey, entry.id);
                } catch (err) {
                  onError(
                    err instanceof Error ? err.message : "Could not remove that row.",
                  );
                }
              }}
              className="rounded-md border border-overdue-line bg-overdue-soft px-2 py-1 text-[11px] font-bold text-overdue"
            >
              Remove
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md px-1.5 py-1 text-[11px] font-semibold text-ink-faint hover:text-ink"
            >
              Keep
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Remove ${entry.fullName} from the sheet`}
            className="grid size-7 place-items-center rounded-md text-ink-faint transition-colors hover:bg-overdue-soft hover:text-overdue"
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
        )}
      </td>
    </tr>
  );
}

/**
 * The van, as it lands from Karim's phone.
 *
 * Nothing here is editable and nothing here is a placeholder: until he has been
 * at the van there is genuinely nothing to say, so the row stays quiet rather
 * than filling up with empty fields.
 */
function VanReadout({ entry }: { entry: Entry }) {
  const checked = CHECKS.some((check) => entry[check.field] !== null);
  if (!entry.van && !entry.vanIssues && !checked) return null;

  return (
    <span className="mt-1.5 flex flex-col gap-1 border-t border-line pt-1.5">
      <span className="flex items-center gap-1.5">
        {entry.van ? (
          <span className="tnum font-mono text-[13px] font-bold tracking-wide">
            {entry.van}
          </span>
        ) : (
          <span className="text-[11px] font-medium text-ink-faint">No van</span>
        )}
        {checked ? <CheckChips values={entry} /> : null}
      </span>

      {entry.vanIssues ? (
        <span
          title={entry.vanIssues}
          className="line-clamp-2 text-[11px] leading-snug text-warn"
        >
          {entry.vanIssues}
        </span>
      ) : null}
    </span>
  );
}

/**
 * A text cell that edits in place.
 *
 * The local draft exists so typing is never fighting a snapshot coming back
 * from Firestore, and it re-syncs whenever the stored value changes underneath
 * — which it does, because the closer is writing to the same document.
 */
function CellInput({
  value,
  onCommit,
  placeholder,
  ariaLabel,
  className = "",
}: {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const [lastSeen, setLastSeen] = useState(value);

  // Adjust during render rather than in an effect: the stored value changed
  // underneath us and this field is not being typed in, so the draft follows.
  if (!editing && value !== lastSeen) {
    setLastSeen(value);
    setDraft(value);
  }

  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => setEditing(true)}
      onBlur={() => {
        setEditing(false);
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoComplete="off"
      spellCheck={false}
      className={`w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-faint hover:border-line focus:border-brand focus:bg-surface ${className}`}
    />
  );
}
