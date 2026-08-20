import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "arrived" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-ink-inverse hover:bg-brand-hover border border-transparent",
  /* Green means done — the same green the closer's Arrived button uses. */
  arrived:
    "bg-arrived text-ink-inverse hover:brightness-110 border border-transparent",
  secondary:
    "bg-surface text-ink border border-line-strong hover:border-ink-faint hover:bg-sunken",
  ghost:
    "bg-transparent text-ink-muted border border-transparent hover:bg-sunken hover:text-ink",
};

/* min-h values, not fixed heights: a wrapped label must never clip. */
const SIZES: Record<Size, string> = {
  sm: "min-h-8 px-2.5 text-[12px] gap-1.5 rounded-md",
  md: "min-h-10 px-3.5 text-[13px] gap-2 rounded-lg",
  lg: "min-h-12 px-5 text-[15px] gap-2 rounded-lg",
};

/**
 * The look, on its own.
 *
 * Exported because one control in the app has to be a real anchor rather than a
 * button — View, which opens the sheet in the browser's own PDF viewer. That
 * only works as a link the browser navigates, not as script run on a tap. It
 * still has to sit next to Share and look like its equal, so it borrows the
 * same classes instead of a copy of them that will drift.
 */
export function buttonClass(
  variant: Variant = "secondary",
  size: Size = "md",
  className = "",
) {
  return `inline-flex items-center justify-center font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${SIZES[size]} ${VARIANTS[variant]} ${className}`;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={buttonClass(variant, size, className)}
    >
      {loading ? (
        <span className="size-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
      ) : null}
      {children}
    </button>
  );
}
