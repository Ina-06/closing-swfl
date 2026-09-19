"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * A time, picked off three wheels.
 *
 * The same shape as the clock in the phone's alarm app, and deliberately so:
 * hours, minutes, AM/PM, spun with a thumb. It is not an `<input type="time">`
 * because that control is two different things depending on what is holding it
 * — a proper wheel on an iPhone, a pair of tiny spinner arrows in a desktop
 * browser — and the one screen in this app where a time is typed rather than
 * stamped has to behave the same on both. Karim is on a phone and whoever is
 * checking the night afterwards is not.
 *
 * Built on CSS scroll snapping rather than on drag maths. The browser already
 * knows how a flick decelerates on the hardware it is running on, and every
 * hand-written version of that is worse on some device nobody tested. Every row
 * is also a real button, so the wheel can be tapped straight to a number and is
 * reachable without a thumb at all.
 */

/** Row height, in pixels. The wheel's geometry is all worked out from this. */
const ITEM = 44;
/** Rows visible at once. Odd, so there is a middle one to select under. */
const ROWS = 5;
const HEIGHT = ITEM * ROWS;
/** Enough blank above and below that the first and last row can reach the band. */
const PAD = ITEM * Math.floor(ROWS / 2);

export type Meridiem = "AM" | "PM";

export type ClockValue = {
  /** 1–12, as it is read out loud. */
  hour: number;
  minute: number;
  meridiem: Meridiem;
};

const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);
const MERIDIEMS: Meridiem[] = ["AM", "PM"];

/** A wall-clock `HH:mm` as the three things the wheels spin. */
export function clockFrom24(hhmm: string): ClockValue {
  const [rawHour, rawMinute] = hhmm.split(":").map(Number);
  const hour24 = Number.isFinite(rawHour) ? rawHour : 0;
  const minute = Number.isFinite(rawMinute) ? rawMinute : 0;

  return {
    // Midnight and noon are both 12 on a clock face, not 0.
    hour: hour24 % 12 === 0 ? 12 : hour24 % 12,
    minute,
    meridiem: hour24 < 12 ? "AM" : "PM",
  };
}

/** The wheels, back as the 24-hour numbers stationInstant wants. */
export function clockTo24(value: ClockValue): { hours: number; minutes: number } {
  const base = value.hour % 12;
  return {
    hours: value.meridiem === "PM" ? base + 12 : base,
    minutes: value.minute,
  };
}

/** The wheels as the `HH:mm` the sheet keeps its draft time in. */
export function clockToInputValue(value: ClockValue): string {
  const { hours, minutes } = clockTo24(value);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** How the picked time reads back — the same words as a stamped one. */
export function clockLabel(value: ClockValue): string {
  return `${value.hour}:${String(value.minute).padStart(2, "0")} ${value.meridiem}`;
}

/**
 * One column of the wheel.
 *
 * Generic over what it is spinning so the AM/PM column is the same component as
 * the minutes, rather than a special case that drifts away from the other two.
 */
function Wheel<T extends string | number>({
  label,
  values,
  value,
  onChange,
  format,
}: {
  /** What this column is, for a screen reader. Never drawn. */
  label: string;
  values: readonly T[];
  value: T;
  onChange: (next: T) => void;
  format: (item: T) => string;
}) {
  const column = useRef<HTMLDivElement>(null);
  const settling = useRef<number | null>(null);
  const index = Math.max(0, values.indexOf(value));

  /**
   * Put the selected row under the band.
   *
   * Runs on open and whenever the value is set from outside — tapping a row,
   * or the sheet being reopened on a different time. A scroll the finger is
   * doing never reaches here, because that path sets the value to whatever it
   * has already landed on and the position is then already right.
   */
  useLayoutEffect(() => {
    const node = column.current;
    if (!node) return;
    const target = index * ITEM;
    if (Math.abs(node.scrollTop - target) < 1) return;
    node.scrollTop = target;
  }, [index]);

  useEffect(() => () => {
    if (settling.current !== null) window.clearTimeout(settling.current);
  }, []);

  /**
   * Read the wheel once it has stopped.
   *
   * Not on every scroll event: committing mid-flick would fire forty times on
   * one spin, and on the custom clock-out that is forty writes to a record
   * Karim has not finished choosing. The browser's own snapping is what lands
   * it on a row; this only has to notice where it came to rest.
   */
  function onScroll() {
    const node = column.current;
    if (!node) return;
    if (settling.current !== null) window.clearTimeout(settling.current);

    settling.current = window.setTimeout(() => {
      settling.current = null;
      const landed = Math.min(
        values.length - 1,
        Math.max(0, Math.round(node.scrollTop / ITEM)),
      );
      if (values[landed] !== value) onChange(values[landed]);
    }, 120);
  }

  return (
    <div
      ref={column}
      onScroll={onScroll}
      role="group"
      aria-label={label}
      style={{ height: HEIGHT, paddingBlock: PAD }}
      /* The scrollbar is hidden because the wheel is the scrollbar — a grey
         track down the side of a clock face reads as a second control. */
      className="snap-y snap-mandatory overflow-y-auto overscroll-contain outline-none [scrollbar-width:none] focus-visible:rounded-lg [&::-webkit-scrollbar]:hidden"
    >
      {values.map((item) => {
        const picked = item === value;

        return (
          <button
            key={String(item)}
            type="button"
            aria-pressed={picked}
            aria-label={`${label} ${format(item)}`}
            onClick={() => onChange(item)}
            style={{ height: ITEM }}
            /* Full width so a thumb landing anywhere in the row picks it, and
               tabular figures so the column does not shimmy between 11 and 12
               as it spins. */
            className={`tnum flex w-full snap-center items-center justify-center font-mono tabular-nums transition-[color,font-size] ${
              picked
                ? "text-[30px] font-bold leading-none text-ink"
                : "text-[22px] font-semibold leading-none text-ink-faint"
            }`}
          >
            {format(item)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The three wheels together, under one selection band.
 *
 * The band is drawn once across all three rather than per column, because what
 * it means is "this line is the time" — three separate highlights would read as
 * three separate answers.
 */
export function ClockWheels({
  value,
  onChange,
}: {
  value: ClockValue;
  onChange: (next: ClockValue) => void;
}) {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        style={{ height: ITEM, marginTop: -ITEM / 2 }}
        className="pointer-events-none absolute inset-x-0 top-1/2 rounded-lg border-y border-line-strong bg-sunken/70"
      />

      <div className="relative grid grid-cols-[1fr_auto_1fr_1fr] items-center">
        <Wheel
          label="Hour"
          values={HOURS}
          value={value.hour}
          onChange={(hour) => onChange({ ...value, hour })}
          format={(hour) => String(hour)}
        />

        {/* Not inside a column: it belongs to the pair, and a colon that
            scrolled with the hours would slide off the top of the wheel. */}
        <span
          aria-hidden="true"
          className="px-0.5 pb-1 font-mono text-[26px] font-bold leading-none text-ink-faint"
        >
          :
        </span>

        <Wheel
          label="Minute"
          values={MINUTES}
          value={value.minute}
          onChange={(minute) => onChange({ ...value, minute })}
          format={(minute) => String(minute).padStart(2, "0")}
        />

        <Wheel
          label="AM or PM"
          values={MERIDIEMS}
          value={value.meridiem}
          onChange={(meridiem) => onChange({ ...value, meridiem })}
          format={(meridiem) => meridiem}
        />
      </div>

      {/* Fading the ends is what makes it read as a wheel rather than as three
          short lists. Over the top of the columns, so it cannot be scrolled. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-linear-to-b from-surface to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-surface to-transparent"
      />
    </div>
  );
}

/**
 * The wheels as something that opens over the sheet.
 *
 * Its own layer above the arrival sheet, not a panel inside it. Karim opens
 * this with the driver stood in front of him and one number in mind; the record
 * behind it is not what he is reading, and a picker that pushed the sheet
 * around would move the button he is about to press next.
 */
export function ClockPickerDialog({
  title,
  blurb,
  initial,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  /** One line under the title saying what pressing confirm will do. */
  blurb: string;
  initial: ClockValue;
  confirmLabel: string;
  onConfirm: (value: ClockValue) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const panel = useRef<HTMLDivElement>(null);

  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    panel.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      // Stopped as well as handled: the sheet underneath listens for Escape
      // too, and one press should not close both.
      if (event.key === "Escape") {
        event.stopPropagation();
        close.current();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const confirm = useCallback(() => onConfirm(value), [onConfirm, value]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/55"
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="animate-sheet relative w-full max-w-sm rounded-t-2xl border-t border-line bg-surface px-4 pb-safe pt-4 outline-none sm:rounded-2xl sm:border"
      >
        <div className="pb-5">
          <h2 className="text-center text-[17px] font-bold tracking-tight">
            {title}
          </h2>
          <p className="mt-1 text-center text-[12.5px] leading-snug text-ink-muted">
            {blurb}
          </p>

          {/* The answer, in words, above the wheels that make it. A wheel is
              read three numbers at a time and this is the one place the whole
              time exists as a thing to check before pressing the button. */}
          <p
            aria-live="polite"
            className="tnum mt-3 text-center font-mono text-[20px] font-bold leading-none tracking-tight text-arrived"
          >
            {clockLabel(value)}
          </p>

          <div className="mt-3">
            <ClockWheels value={value} onChange={setValue} />
          </div>

          <div className="mt-4 flex gap-2">
            <Button
              variant="arrived"
              size="lg"
              onClick={confirm}
              className="min-h-13 flex-1 text-[16px]"
            >
              {confirmLabel}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={onClose}
              className="min-h-13"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
