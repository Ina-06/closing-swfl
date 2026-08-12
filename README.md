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
| Database / realtime | Firebase Firestore *(Phase 1)* |
| File storage | Firebase Storage *(Phase 6)* |
| Privileged server work | Firebase Admin SDK in route handlers *(Phase 1)* |
| PDF | `@react-pdf/renderer`, Node runtime *(Phase 7)* |
| Spreadsheet | `exceljs`, server-side *(Phase 6)* |
| Hosting | Vercel |

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

To check the closer screen from your phone on the same Wi-Fi, run
`npm run dev -- -H 0.0.0.0` and visit `http://<your-laptop-ip>:3000/closer`.

## Layout

```
src/
  app/
    layout.tsx            fonts + design tokens, wraps everything
    page.tsx              role chooser (Phase 1 replaces with the login)
    (dispatch)/           desktop chrome
      layout.tsx
      dispatch/page.tsx
    (closer)/             phone chrome, safe-area aware
      layout.tsx
      closer/page.tsx
  components/
  lib/
    constants.ts          station timezone, metrics, date helpers
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
- **Nothing typed is ever lost.** Raw input is stored verbatim alongside any
  parsed structure; parse failures warn softly inline and still save.
- **Sessions are never deleted.** Closing sets `status: 'closed'`.

## Phases

| | Phase | State |
| --- | --- | --- |
| 0 | Scaffold and deploy | ✅ |
| 1 | Firebase wiring and auth | — |
| 2 | Driver database and roster entry | — |
| 3 | Dispatcher entry form | — |
| 4 | Closer live list | — |
| 5 | Closer detail sheet | — |
| 6 | All Returning + returns spreadsheet | — |
| 7 | End Day, PDF, archive | — |
| 8 | One-time closer keys | — |
| 9 | Offline and polish | — |
