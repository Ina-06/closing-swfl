"use client";

/**
 * The last resort — a crash in the root layout itself, where none of the app's
 * own chrome or styles are guaranteed to exist. It has to render its own html
 * and body, and it deliberately depends on nothing.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          padding: "3rem 1.25rem",
          textAlign: "center",
          color: "#0e1419",
          background: "#f4f6f9",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Closing could not start</h1>
        <p style={{ marginTop: 8, color: "#59636f" }}>
          Nothing has been lost. Reload and try again.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 20,
            minHeight: 48,
            padding: "0 20px",
            borderRadius: 8,
            border: 0,
            background: "#2d54e0",
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
