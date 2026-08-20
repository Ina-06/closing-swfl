# Closing — SWFL

Driver closing sheet for an Amazon delivery station. Replaces two things: the
dispatcher's WhatsApp posts, and the closer's handwritten paper grid.

Two roles, one codebase:

- **`/dispatch`** — laptop. Roster, per-driver ETA/returns entry, All Returning.
- **`/closer`** — phone. Live arrivals, van checks, End Day → PDF.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router), TypeScript, React 19 |
| Styling | Tailwind CSS v4 |
| Database / realtime | Firebase Firestore |
| Privileged server work | Firebase Admin SDK in route handlers |
| PDF | `@react-pdf/renderer`, Node runtime |
| Spreadsheet | `exceljs`, server-side |
| Hosting | Vercel |

## Local development

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run dev
```

Open http://localhost:3000.

Without `.env.local` the login screen tells you what is missing instead of
pretending to work.

To check the closer screen from your phone on the same Wi-Fi, run
`npm run dev -- -H 0.0.0.0` and visit `http://<your-laptop-ip>:3000/closer`.

## Layout

```
src/
  app/
    layout.tsx            fonts, design tokens, AuthProvider
    page.tsx              login — one key, three role buttons
    api/login/route.ts    server-side key check → Firebase custom token
    (dispatch)/           desktop chrome
      layout.tsx
      dispatch/page.tsx
    (closer)/             phone chrome, safe-area aware
      layout.tsx
      closer/page.tsx
  components/
    RoleGate.tsx          keeps the wrong role off the wrong screen
  lib/
    constants.ts          station timezone, metrics, date helpers
    auth/AuthProvider.tsx session state + role claim
    firebase/client.ts    browser SDK (public config)
    firebase/admin.ts     Admin SDK — server only, never imported by a client
firestore.rules           the actual security boundary
```

`(dispatch)` and `(closer)` are route groups: they give each role its own
persistent chrome without adding a segment to the URL.

## Conventions

- **Semantic color only.** Tokens live in `src/app/globals.css`; components use
  `bg-surface`, `text-ink-muted`, `border-overdue-line` — never a raw hex.
- **Tabular numbers.** Any column of figures (ETA, van, counts, clock-out) gets
  the `tnum` class so digits line up.
- **One timezone.** All times render through `STATION_TIMEZONE`. The device
  clock is never trusted, and clock-out uses `serverTimestamp()`.
- **One night, not one date.** Session ids come from `stationNightKey()`, which
  counts anything before 4am as still belonging to the previous night. A van
  stamped in at 00:40 lands on the sheet it belongs to.
- **Nothing typed is ever lost.** Raw input is stored verbatim alongside any
  parsed structure; parse failures warn softly inline and still save.
- **Sessions are never deleted.** Closing sets `status: 'closed'`.
- **The key is checked on the server.** `/api/login` compares it to
  `APP_ACCESS_KEY` and mints a custom token carrying a `role` claim;
  `firestore.rules` enforces what each role may read and write.

## The `jose` override

`package.json` pins `jose` to v5. Do not remove it without testing a deployed
build.

`firebase-admin` 14 depends on `jwks-rsa` 4, which does `require('jose')` from
CommonJS while asking for `jose` 6 — and `jose` 6 is ESM-only. Node throws
`ERR_REQUIRE_ESM` the moment `firebase-admin/auth` is imported, so every login
500s. It does not reproduce on a recent local Node, which supports
`require(esm)`; it only shows up on the deployment runtime. `jose` 5 still
ships a CommonJS build and has the four functions `jwks-rsa` calls.

To reproduce the old failure on purpose:
`node --no-experimental-require-module -e "require('firebase-admin/auth')"`.

## Firestore rules

`firestore.rules` is not applied by deploying the app. After editing it, paste
it into Firebase console → Firestore Database → Rules → Publish.

## Phases

| | Phase | State |
| --- | --- | --- |
| 0 | Scaffold and deploy | ✅ |
| 1 | Firebase wiring and auth | ✅ |
| 2 | Driver database and roster entry | ✅ |
| 3 | Dispatcher entry form | ✅ |
| 4 | Closer live list | — |
| 5 | Closer detail sheet | — |
| 6 | All Returning + returns spreadsheet | — |
| 7 | End Day, PDF, archive | — |
| 8 | One-time closer keys | — |
| 9 | Offline and polish | — |
