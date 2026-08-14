"use client";

import { useState } from "react";
import { METRICS, type Metric } from "@/lib/constants";

/**
 * Performance — one arrow up or down, nothing in between.
 *
 * Clicking the selected arrow clears it. Most drivers get neither, and the
 * dispatcher should never have to hunt for a "none" option.
 */
export function PerformanceToggle({
  value,
  onChange,
  size = "md",
}: {
  value: "up" | "down" | null;
  onChange: (next: "up" | "down" | null) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="flex gap-1">
      {(["up", "down"] as const).map((direction) => {
        const on = value === direction;
        const tone = on
          ? direction === "up"
            ? "border-arrived-line bg-arrived-soft text-arrived"
            : "border-overdue-line bg-overdue-soft text-overdue"
          : "border-line-strong bg-surface text-ink-faint hover:border-ink-faint hover:text-ink-muted";

        return (
          <button
            key={direction}
            type="button"
            aria-pressed={on}
            aria-label={direction === "up" ? "Good performance" : "Poor performance"}
            onClick={() => onChange(on ? null : direction)}
            className={`grid place-items-center rounded-lg border transition-colors ${
              size === "sm" ? "h-8 w-8" : "h-10 w-11"
            } ${tone}`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
              aria-hidden="true"
            >
              {direction === "up" ? (
                <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
              ) : (
                <path d="M12 5v14M5.5 12.5 12 19l6.5-6.5" />
              )}
            </svg>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Metric — how early or late the route finished.
 *
 * Six buttons rather than a dropdown: one tap, no menu to open, and the whole
 * scale stays visible so O.I. and WB never get mixed up under time pressure.
 */
export function MetricPicker({
  value,
  onChange,
}: {
  value: Metric | null;
  onChange: (next: Metric | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {METRICS.map((metric) => {
        const on = value === metric.value;
        return (
          <button
            key={metric.value}
            type="button"
            aria-pressed={on}
            title={metric.title}
            onClick={() => onChange(on ? null : metric.value)}
            className={`h-10 min-w-11 rounded-lg border px-2.5 text-[13px] font-bold transition-colors ${
              on
                ? "border-brand bg-brand text-ink-inverse"
                : "border-line-strong bg-surface text-ink-muted hover:border-ink-faint hover:text-ink"
            }`}
          >
            {metric.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Metric, compact — for the live table, where six buttons per row would push
 * the sheet off the screen. The entry form keeps the buttons: that is where
 * speed matters, and this is where corrections are made.
 */
export function MetricSelect({
  value,
  onChange,
  label,
}: {
  value: Metric | null;
  onChange: (next: Metric | null) => void;
  label: string;
}) {
  return (
    <select
      value={value ?? ""}
      aria-label={label}
      onChange={(event) =>
        onChange(event.target.value ? (event.target.value as Metric) : null)
      }
      className={`h-8 w-full rounded-md border border-line-strong bg-surface px-1.5 text-[13px] font-bold outline-none transition-colors focus:border-brand ${
        value ? "text-ink" : "text-ink-faint"
      }`}
    >
      <option value="">—</option>
      {METRICS.map((metric) => (
        <option key={metric.value} value={metric.value}>
          {metric.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Rescues — signed. `+2` gave two, `-1` received one.
 *
 * The sign is the whole point, so it is always shown, including on zero, and
 * the value stays typeable for the rare five-rescue night.
 */
const RESCUE_LIMIT = 999;

function clampRescues(next: number) {
  return Math.max(-RESCUE_LIMIT, Math.min(RESCUE_LIMIT, next));
}

function formatRescues(value: number) {
  if (value === 0) return "0";
  return value > 0 ? `+${value}` : String(value);
}

export function RescuesStepper({
  value,
  onChange,
  size = "md",
}: {
  value: number;
  onChange: (next: number) => void;
  size?: "sm" | "md";
}) {
  /**
   * While the field has focus the text is whatever was typed, not a formatted
   * number. Without that, typing a minus sign was impossible: a lone "-" is
   * not a number, so it was being wiped on the very next render before the
   * digits could be typed.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const button = size === "sm" ? "w-7 text-[15px]" : "w-10 text-[18px]";

  function step(by: number) {
    setDraft(null);
    onChange(clampRescues(value + by));
  }

  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-lg border border-line-strong bg-surface">
      <button
        type="button"
        aria-label="One fewer rescue"
        onClick={() => step(-1)}
        className={`${button} font-bold text-ink-muted transition-colors hover:bg-sunken hover:text-ink`}
      >
        −
      </button>
      <input
        value={draft ?? formatRescues(value)}
        onFocus={(event) => {
          // Start from an empty field on zero, and select whatever is there
          // otherwise. Without this the standing "0" sat in the box and typing
          // "-13" produced "-130" — the digits landed in front of it.
          setDraft(value === 0 ? "" : String(value));
          event.currentTarget.select();
        }}
        onChange={(event) => {
          // Keep a leading sign and digits only, and allow the in-between
          // states ("", "-", "+") that typing a signed number has to pass through.
          const text = event.target.value.replace(/[^\d+-]/g, "").replace(/(?!^)[+-]/g, "");
          setDraft(text);

          if (text === "" || text === "-" || text === "+") {
            onChange(0);
            return;
          }
          const parsed = Number(text);
          if (Number.isFinite(parsed)) onChange(clampRescues(parsed));
        }}
        onBlur={() => setDraft(null)}
        placeholder="0"
        aria-label="Rescues — positive given, negative received"
        inputMode="numeric"
        className={`tnum border-x border-line-strong bg-transparent text-center font-mono font-bold outline-none focus:bg-brand-soft/40 ${
          size === "sm" ? "w-12 py-1 text-[13px]" : "w-16 py-2 text-[15px]"
        } ${value === 0 ? "text-ink-faint" : "text-ink"}`}
      />
      <button
        type="button"
        aria-label="One more rescue"
        onClick={() => step(1)}
        className={`${button} font-bold text-ink-muted transition-colors hover:bg-sunken hover:text-ink`}
      >
        +
      </button>
    </div>
  );
}
