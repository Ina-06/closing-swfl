"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorNote, Label, SoftWarning, TextInput } from "@/components/ui/Field";
import { FLAGS, FlagTag } from "@/components/ui/FlagToggle";
import {
  MetricPicker,
  PerformanceToggle,
  RescuesStepper,
} from "@/components/dispatch/EntryControls";
import { DriverPicker, type PickerOption } from "@/components/dispatch/DriverPicker";
import { addDriver } from "@/lib/db/drivers";
import { addEntry, returnsFields } from "@/lib/db/entries";
import { describeReturns, parseReturns } from "@/lib/returns";
import { nameKey } from "@/lib/names";
import type { Metric } from "@/lib/constants";
import type { Driver, Entry, Session } from "@/lib/types";

const BLANK = {
  eta: "",
  returns: "",
  performance: null as "up" | "down" | null,
  metric: null as Metric | null,
  infractions: "",
  rescues: 0,
};

/**
 * One driver, entered as he calls in.
 *
 * Built for a dispatcher on the phone with a driver, typing with one hand.
 * Enter submits from anywhere in the form and focus lands back on the name
 * field, so the next driver can be typed without touching the mouse.
 */
export function EntryForm({
  nightKey,
  session,
  entries,
  drivers,
  uid,
}: {
  nightKey: string;
  session: Session;
  entries: Entry[];
  drivers: Driver[];
  uid: string;
}) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<PickerOption | null>(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const etaRef = useRef<HTMLInputElement>(null);

  const enteredIds = useMemo(
    () => new Set(entries.map((entry) => entry.driverId)),
    [entries],
  );

  const rosterByDriver = useMemo(
    () => new Map(session.roster.map((row) => [row.driverId, row])),
    [session.roster],
  );

  /**
   * Everyone the dispatcher might type, roster or not. A driver who is not on
   * tonight's roster is still offered — people get added to a wave late, and
   * refusing the name would just mean it gets typed somewhere worse.
   */
  const options = useMemo<PickerOption[]>(
    () =>
      drivers.map((driver) => ({
        driverId: driver.id,
        fullName: driver.fullName,
        nameKey: driver.nameKey,
        roster: rosterByDriver.get(driver.id),
        entered: enteredIds.has(driver.id),
      })),
    [drivers, rosterByDriver, enteredIds],
  );

  const parsed = parseReturns(form.returns);
  const preview = describeReturns(parsed);

  /** The picker's selection, or an exact typed match if they never opened it. */
  const resolved =
    picked ?? options.find((option) => option.nameKey === nameKey(name)) ?? null;

  const duplicate = resolved ? enteredIds.has(resolved.driverId) : false;

  function reset() {
    setName("");
    setPicked(null);
    setForm(BLANK);
    nameRef.current?.focus();
  }

  async function handleAddNew(fullName: string) {
    setError(null);
    try {
      const driverId = await addDriver(fullName);
      setName(fullName);
      setPicked({ driverId, fullName, nameKey: nameKey(fullName), entered: false });
      setNote(`${fullName} added to the driver database.`);
      etaRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that driver.");
    }
  }

  async function submit() {
    if (saving) return;

    if (!resolved) {
      setError(
        name.trim()
          ? `${name.trim()} is not in the database yet — pick "Add" from the list.`
          : "Which driver?",
      );
      nameRef.current?.focus();
      return;
    }

    setSaving(true);
    setError(null);
    setNote(null);
    try {
      await addEntry(
        nightKey,
        entries,
        {
          driverId: resolved.driverId,
          fullName: resolved.fullName,
          roster: resolved.roster,
          eta: form.eta.trim(),
          performance: form.performance,
          metric: form.metric,
          infractions: form.infractions.trim(),
          rescues: form.rescues,
          ...returnsFields(parsed),
        },
        uid,
      );
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That entry did not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="rounded-xl border border-line bg-surface p-5 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1.5">
          <Label>Driver</Label>
          <DriverPicker
            value={name}
            onChange={(next) => {
              setName(next);
              setPicked(null);
              setError(null);
            }}
            options={options}
            onPick={(option) => {
              setPicked(option);
              setName(option.fullName);
              setError(null);
              etaRef.current?.focus();
            }}
            onAddNew={handleAddNew}
            inputRef={nameRef}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="eta">ETA</Label>
          <TextInput
            id="eta"
            ref={etaRef}
            value={form.eta}
            onChange={(event) => setForm({ ...form, eta: event.target.value })}
            placeholder="9:45"
            autoComplete="off"
            spellCheck={false}
            className="tnum h-11 w-full py-0 font-mono sm:w-28"
          />
        </div>
      </div>

      {resolved ? (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
          <span>{resolved.fullName}</span>
          {resolved.roster
            ? FLAGS.filter((flag) =>
                flag === "bud"
                  ? resolved.roster!.isBud
                  : flag === "trn"
                    ? resolved.roster!.isTrainer
                    : resolved.roster!.isRescuer,
              ).map((flag) => <FlagTag key={flag} flag={flag} />)
            : (
              <span className="rounded-full border border-line bg-sunken px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                Not on tonight&rsquo;s roster
              </span>
            )}
        </p>
      ) : null}

      <div className="mt-4 space-y-1.5">
        <Label htmlFor="returns" hint="2R 1 RNI 1 Can't find address">
          Returns
        </Label>
        <TextInput
          id="returns"
          value={form.returns}
          onChange={(event) => setForm({ ...form, returns: event.target.value })}
          placeholder="0R"
          autoComplete="off"
          spellCheck={false}
          className="h-11 py-0"
        />
        {preview ? (
          <p className="text-[13px] text-ink-muted">{preview}</p>
        ) : null}
      </div>

      {parsed.mismatch ? (
        <div className="mt-2">
          <SoftWarning>{parsed.warning}</SoftWarning>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-4">
        <div className="space-y-1.5">
          <Label>Performance</Label>
          <PerformanceToggle
            value={form.performance}
            onChange={(performance) => setForm({ ...form, performance })}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Metric</Label>
          <MetricPicker
            value={form.metric}
            onChange={(metric) => setForm({ ...form, metric })}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Rescues</Label>
          <RescuesStepper
            value={form.rescues}
            onChange={(rescues) => setForm({ ...form, rescues })}
          />
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        <Label htmlFor="infractions">Infractions</Label>
        <TextInput
          id="infractions"
          value={form.infractions}
          onChange={(event) =>
            setForm({ ...form, infractions: event.target.value })
          }
          placeholder="None"
          autoComplete="off"
          className="h-11 py-0"
        />
      </div>

      {duplicate ? (
        <div className="mt-4">
          <SoftWarning>
            {resolved?.fullName} is already on tonight&rsquo;s sheet. Adding
            again will make a second row — edit the existing one instead if you
            meant to change it.
          </SoftWarning>
        </div>
      ) : null}

      {note ? (
        <p className="mt-4 rounded-md border border-brand-line bg-brand-soft px-3 py-2 text-[13px] text-brand">
          {note}
        </p>
      ) : null}
      {error ? (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" size="lg" loading={saving}>
          Add to sheet
        </Button>
        <span className="text-[12px] text-ink-faint">
          Enter saves and jumps back to the name.
        </span>
      </div>
    </form>
  );
}
