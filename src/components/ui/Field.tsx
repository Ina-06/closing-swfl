import type { ComponentPropsWithRef } from "react";

/* 16px on the control itself — anything smaller makes iOS Safari zoom on focus. */
const CONTROL =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand disabled:opacity-60";

export function Label({
  htmlFor,
  children,
  hint,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="flex items-baseline justify-between gap-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-faint"
    >
      <span>{children}</span>
      {hint ? (
        <span className="font-normal normal-case tracking-normal text-ink-faint">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

/* React 19 passes ref straight through as a prop — no forwardRef needed. */
export function TextInput({
  className = "",
  ...props
}: ComponentPropsWithRef<"input">) {
  return <input {...props} className={`${CONTROL} ${className}`} />;
}

export function TextArea({
  className = "",
  ...props
}: ComponentPropsWithRef<"textarea">) {
  return <textarea {...props} className={`${CONTROL} ${className}`} />;
}

/**
 * The soft amber warning used throughout the app.
 *
 * It is inline and it never blocks. Every place this appears, the save has
 * already happened or is still allowed to happen — see the returns parser in
 * Phase 3, which is the reason this tone exists.
 */
export function SoftWarning({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-[13px] leading-relaxed text-warn">
      {children}
    </p>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-overdue-line bg-overdue-soft px-3 py-2 text-[13px] font-medium text-overdue"
    >
      {children}
    </p>
  );
}
