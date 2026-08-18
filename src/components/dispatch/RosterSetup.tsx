"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorNote, Label, SoftWarning, TextArea, TextInput } from "@/components/ui/Field";
import { FLAGS, FLAG_TITLE } from "@/components/ui/FlagToggle";
import { RosterRow, type RosterDraft } from "@/components/dispatch/RosterRow";
import { addDriver } from "@/lib/db/drivers";
import { createSession, saveRoster } from "@/lib/db/sessions";
import { findSuggestion, nameKey, parseRoster } from "@/lib/names";
import type { Driver, RosterEntry, Session } from "@/lib/types";

let draftCounter = 0;
function newDraft(
  name: string,
  flags: Partial<RosterDraft["flags"]> = {},
): RosterDraft {
  draftCounter += 1;
  return {
    id: `row-${draftCounter}`,
    name,
    flags: { bud: false, trn: false, res: false, ...flags },
  };
}

/**
 * The dispatcher's first screen of the night: paste the roster out of Cortex,
 * check what it matched, start the night.
 *
 * Nothing is written to Firestore until the last button. Up to that point the
 * whole roster is local state the dispatcher can edit freely.
 */
export function RosterSetup({
  nightKey,
  drivers,
  uid,
  existing,
  onDone,
  onCancel,
}: {
  nightKey: string;
  drivers: Driver[];
  uid: string;
  /** Present when re-opening the roster on a session that already exists. */
  existing?: Session;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState<"paste" | "review">(
    existing ? "review" : "paste",
  );
  const [pasted, setPasted] = useState("");
  const [managedBy, setManagedBy] = useState(existing?.managedBy ?? "");
  /** Only ever printed, in the PDF header beside the date. */
  const [shift, setShift] = useState(existing?.shift ?? "");
  const [rows, setRows] = useState<RosterDraft[]>(() =>
    existing
      ? existing.roster.map((entry) =>
          newDraft(entry.fullName, {
            bud: entry.isBud,
            trn: entry.isTrainer,
            res: entry.isRescuer,
          }),
        )
      : [],
  );
  const [addingId, setAddingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const driverByKey = useMemo(() => {
    const map = new Map<string, Driver>();
    for (const driver of drivers) map.set(driver.nameKey, driver);
    return map;
  }, [drivers]);

  /**
   * Matching is derived, never stored. Adding a driver to the database or
   * fixing a spelling re-resolves the row on the next render, so there is no
   * stale "unrecognised" state to clear by hand.
   */
  const resolved = useMemo(
    () =>
      rows.map((row) => {
        const match = driverByKey.get(nameKey(row.name)) ?? null;
        return {
          row,
          match,
          suggestion: match ? null : findSuggestion(row.name, drivers),
          // Flags are whatever the dispatcher set on this row. Nothing on the
          // driver record overrides them — who is a BUD, training or on
          // rescues is a fact about tonight.
          flags: row.flags,
        };
      }),
    [rows, driverByKey, drivers],
  );

  const unmatched = resolved.filter((item) => !item.match);
  const counts = {
    bud: resolved.filter((item) => item.flags.bud).length,
    trn: resolved.filter((item) => item.flags.trn).length,
    res: resolved.filter((item) => item.flags.res).length,
  };

  function updateRow(id: string, next: RosterDraft) {
    setRows((current) => current.map((row) => (row.id === id ? next : row)));
  }

  async function addRowToDatabase(id: string) {
    const item = resolved.find((candidate) => candidate.row.id === id);
    if (!item) return;

    setAddingId(id);
    setError(null);
    try {
      await addDriver(item.row.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that driver.");
    } finally {
      setAddingId(null);
    }
  }

  async function addAllUnmatched() {
    setSaving(true);
    setError(null);
    try {
      for (const item of unmatched) {
        if (!item.row.name.trim()) continue;
        await addDriver(item.row.name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add those drivers.");
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    const usable = resolved.filter((item) => item.row.name.trim());
    if (usable.length === 0) {
      setError("There is nobody on the roster yet.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const roster: RosterEntry[] = [];
      for (const item of usable) {
        // Anything still unrecognised joins the database now — the dispatcher
        // pasted it out of Cortex, so it is a real driver either way.
        const driverId =
          item.match?.id ??
          (await addDriver(item.row.name));

        roster.push({
          driverId,
          // The stored spelling wins, so the sheet stays consistent night to night.
          fullName: item.match?.fullName ?? item.row.name.trim(),
          isBud: item.flags.bud,
          isTrainer: item.flags.trn,
          isRescuer: item.flags.res,
        });
      }

      // Editing an existing night only touches the roster fields. Going
      // through createSession would reset the status and wipe the pdf url on a
      // session that has already had All Returning called.
      const write = existing ? saveRoster : createSession;
      await write({ nightKey, managedBy, shift, roster, updatedBy: uid });
      onDone();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save tonight's roster.",
      );
      setSaving(false);
    }
  }

  if (step === "paste") {
    return (
      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <header className="border-b border-line px-5 py-5 sm:px-7">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-brand">
            Start of the wave
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">
            Paste tonight&rsquo;s roster
          </h1>
          <p className="mt-1.5 max-w-prose text-[14px] leading-relaxed text-ink-muted">
            Straight out of Cortex, one name per line. Numbering, transporter
            ids in brackets and ALL CAPS all get cleaned up — you will see
            exactly what each line became before anything is saved.
          </p>
        </header>

        <div className="space-y-5 px-5 py-5 sm:px-7">
          <div className="grid max-w-xl gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="managed-by">Managed by</Label>
              <TextInput
                id="managed-by"
                value={managedBy}
                onChange={(event) => setManagedBy(event.target.value)}
                placeholder="Who is running the wave"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="shift" hint="optional">
                Shift
              </Label>
              <TextInput
                id="shift"
                value={shift}
                onChange={(event) => setShift(event.target.value)}
                placeholder="Cycle 1"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="roster-paste" hint="one name per line">
              Roster
            </Label>
            <TextArea
              id="roster-paste"
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              rows={12}
              spellCheck={false}
              className="font-mono text-[14px] leading-relaxed"
              placeholder={"Jordan Alvarez\nSam Whitfield\nPriya Raghunathan"}
            />
          </div>

          {error ? <ErrorNote>{error}</ErrorNote> : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                const names = parseRoster(pasted);
                if (names.length === 0) {
                  setError("Nothing to read in there yet — paste the names first.");
                  return;
                }
                setError(null);
                setRows(names.map((name) => newDraft(name)));
                setStep("review");
              }}
            >
              Match {parseRoster(pasted).length || ""} names
            </Button>
            {onCancel ? (
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <header className="border-b border-line px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {existing ? "Edit the roster" : "Check the roster"}
          </h1>
          <p className="tnum font-mono text-[12px] text-ink-muted">
            {rows.length} drivers
            {FLAGS.filter((flag) => counts[flag] > 0)
              .map((flag) => ` · ${counts[flag]} ${flag.toUpperCase()}`)
              .join("")}
          </p>
        </div>
        {unmatched.length > 0 ? (
          <p className="mt-1.5 text-[14px] font-semibold text-warn">
            {unmatched.length}{" "}
            {unmatched.length === 1 ? "name is" : "names are"} not recognised
          </p>
        ) : (
          <p className="mt-1.5 text-[14px] text-ink-muted">
            Every name matched a driver in the database.
          </p>
        )}
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-faint">
          {FLAGS.map((flag) => (
            <span key={flag}>
              <span className="font-mono font-semibold">{flag.toUpperCase()}</span>{" "}
              {FLAG_TITLE[flag].toLowerCase()}
            </span>
          ))}
        </p>
      </header>

      <ul className="max-h-[55vh] overflow-y-auto">
        {resolved.map((item, index) => (
          <RosterRow
            key={item.row.id}
            index={index}
            draft={{ ...item.row, flags: item.flags }}
            match={item.match}
            suggestion={item.suggestion}
            adding={addingId === item.row.id}
            onChange={(next) => updateRow(item.row.id, next)}
            onRemove={() =>
              setRows((current) =>
                current.filter((row) => row.id !== item.row.id),
              )
            }
            onAddToDatabase={() => addRowToDatabase(item.row.id)}
          />
        ))}
      </ul>

      <div className="space-y-4 border-t border-line px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRows((current) => [...current, newDraft("")])}
          >
            + Add a name
          </Button>
          {unmatched.length > 1 ? (
            <Button size="sm" variant="secondary" onClick={addAllUnmatched}>
              Add all {unmatched.length} to database
            </Button>
          ) : null}
        </div>

        {unmatched.length > 0 ? (
          <SoftWarning>
            {unmatched.length === 1 ? "One name is" : `${unmatched.length} names are`}{" "}
            still unrecognised. You can start the night anyway — they will be
            added to the driver database as they are spelled here.
          </SoftWarning>
        ) : null}

        {!managedBy.trim() ? (
          <SoftWarning>
            Managed by is empty — that part of the PDF header will be blank. You
            can fill it in later.
          </SoftWarning>
        ) : null}

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" onClick={submit} loading={saving}>
            {existing ? "Save the roster" : `Start the night · ${rows.length} drivers`}
          </Button>
          <Button
            variant="ghost"
            onClick={() => (existing ? onCancel?.() : setStep("paste"))}
            disabled={saving}
          >
            {existing ? "Cancel" : "Back to the paste box"}
          </Button>
        </div>
      </div>
    </section>
  );
}
