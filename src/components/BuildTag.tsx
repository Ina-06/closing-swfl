/**
 * Which build of the app this screen actually is.
 *
 * Small, faint, and at the bottom of every page, because the question it
 * answers keeps coming up and there has been no way to answer it. When Karim
 * says a button did nothing, the first thing worth knowing is whether his phone
 * is running the version that fixed it — and a phone that has restored a page
 * out of Safari's cache looks exactly like a phone that is up to date. There is
 * no other way to ask him.
 *
 * The commit is what we want, and Vercel sets it at build time. The build's own
 * clock is the fallback, because it is always there: a marker that can go blank
 * is a marker that fails on exactly the night it is needed.
 *
 * Both are written out in full rather than read from a variable. Next inlines
 * NEXT_PUBLIC_ values by literal match, so `process.env[name]` would come back
 * undefined in the browser.
 */
export function BuildTag() {
  const sha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
  const builtAt = process.env.NEXT_PUBLIC_BUILT_AT;

  return (
    <p className="pt-8 text-center font-mono text-[11px] tracking-wide text-ink-muted">
      build {sha ? sha.slice(0, 7) : (builtAt ?? "local")}
    </p>
  );
}
