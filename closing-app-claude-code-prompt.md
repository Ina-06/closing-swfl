# Build Prompt — Driver Closing Web App

## How we are working together

We are building this application **in phases**. This is a hard rule.

At the end of **every** phase you must:

1. Stop writing code.
2. Print a short summary of what you built in that phase.
3. Print a **"Your turn"** checklist — anything I need to do on my side (create a Firebase project, paste an env var, click something in a console, connect a repo, etc.), written as literal click-by-click steps, assuming I have not used that console before.
4. Print a **"Test this"** checklist — the exact things I should click/type to verify the phase works, and what I should expect to see.
5. Explicitly ask me whether it works and whether I want changes.

**Do not start the next phase until I reply and tell you to continue.** If I report a bug or ask for a change, fix it inside the current phase and re-run the gate. Never batch two phases together, even if a phase feels small. Never skip ahead "to save time."

Also: commit to git at the end of each phase with a clear message, and tell me the commit message you used.

If anything in this spec is ambiguous when you reach it, ask me before guessing.

---

## What this app is for

I dispatch Amazon delivery drivers (DAs) at a delivery station. Right now, when a driver finishes his route he texts me his ETA and whether he has returns. I then post him in a WhatsApp group called "closing" so that the closer at the station (Karim) knows who is coming back and when.

When the driver physically arrives at the station, Karim writes his details by hand on a paper grid — name, clock-out time, van number, van issues, and checkmarks for cell phone / key / fuel — then photographs the paper at the end of the night and posts the photo to the group.

**This app replaces both halves of that: my WhatsApp posts, and Karim's paper sheet.**

There is a photo of the current paper sheet as the reference for the final PDF layout. Columns on the paper are: `# | Name | Time | Van | Cell | Key | Fuel | Infra | Rtr | Res | Brk | Van Issues`. We are **dropping the Brk (breaks) column** — it is not needed.

### The two roles

**Dispatcher (me) — laptop/desktop.**
- At the start of the wave I enter the full roster of drivers on shift today (I copy the names out of Cortex). Some drivers are "BUDs" who only work a few hours and leave early.
- As each driver texts me that he is finishing, I enter him one at a time: ETA, returns, performance arrow, metric, infractions, rescues.
- When every driver has told me he is heading back, I hit **All Returning**, which notifies Karim and generates a returns spreadsheet.

**Closer (Karim) — phone. Mobile UX is the priority, not an afterthought.**
- He sees every driver I have sent, live, sorted by ETA.
- When a driver walks up to him, he taps that driver, taps **Arrived**, and that timestamp becomes the clock-out time.
- He then types the van number and any van issues, and toggles Cell / Key / Fuel to ✓ or ✗.
- When everyone is in, he hits **End Day**, which generates the PDF version of the paper sheet. He downloads it and posts it to the WhatsApp group.

### Field meanings (do not rename these in the UI)

- **ETA** — typed plainly by me as `9:45`. No pickers, no relative-time parsing, no dropdowns. A text input.
- **Returns** — one free-text block, e.g. `2R 1 RNI 1 Can't find address` or `3R 2 Unsafe due to dog 1 Damaged` or `0R`. Parsing rules are below.
- **Performance** — an up or down arrow, for good or bad performance.
- **Metric** — one of `O.I.`, `A`, `JA`, `JB`, `B`, `WB` (on it, above, just above, just below, below, well below) — how early or late the driver finished his route.
- **Infractions** — any infractions the driver picked up.
- **Rescues** — a signed number. `+2` means he gave two rescues, `-1` means he received one.
- **Cell / Key / Fuel** — Karim's checks, each ✓ or ✗.
- **Van issues** — free text typed by Karim, e.g. `Right passenger blinker out`, `Cargo door does not open/close`, `Rear right needs air`.

---

## Returns parsing

The returns field is one text input, typed fast, mid-wave. It must never block me or throw an error.

Format: `<total>R <count> <reason> <count> <reason> ...`

```
2R  1 RNI  1 Can't find address
│   └────────────────────────┘
│         reasons, each with its own count
└─ total number of returns
```

Rules:
- Leading token matching `\d+R` is the total return count. `0R` means no returns.
- Everything after that splits into reason segments, each of the form `<count> <text>`.
- Sum the segment counts and compare to the leading total. If they disagree (e.g. `3R 2 Damaged`), save anyway and show a **soft amber warning** next to the field. Never block the save, never pop a modal.
- **Always store the raw string verbatim** alongside the parsed structure. If the parse fails entirely, store the raw text, set count to null, flag it, and move on. Nothing I type is ever lost.
- The PDF shows the number of returns; the Excel shows the parsed breakdown.

---

## Stack (fixed — do not substitute)

- **Next.js (App Router), TypeScript, React** — one codebase, two route groups: `/dispatch/*` and `/closer/*`.
- **Tailwind CSS** for styling.
- **Firebase Firestore** for the database and realtime sync.
- **Firebase Storage** for generated PDFs and spreadsheets.
- **Firebase Admin SDK** in Next.js API routes for anything privileged.
- **`@react-pdf/renderer`** for the PDF, generated server-side in a Node runtime route.
- **`exceljs`** for the returns spreadsheet, generated server-side.
- **GitHub** for version control, **Vercel** for deployment.

---

## Auth design

Keep it simple for humans, but do not leave the database open.

There is **one shared key**, stored in an environment variable `APP_ACCESS_KEY`. The login page has a single key field and three role buttons: **Dispatcher**, **Closer**, **One-time closer**.

- Dispatcher and Closer both use `APP_ACCESS_KEY`.
- One-time closer uses a 6-digit code instead (see below).

Flow — do it this way, not by checking the key in the browser:

1. Login page posts the key and chosen role to `POST /api/login`.
2. The server compares against the env var (or, for one-time codes, against the hashed code in Firestore).
3. On success the server uses the Admin SDK to `createCustomToken(uid, { role })`.
4. The client calls `signInWithCustomToken()`.
5. Firestore security rules read `request.auth.token.role` to decide what can be written.

This keeps the single-field experience I asked for while making it impossible for someone with the Firebase project ID to read or write my data directly.

**One-time closer keys.** For nights when someone other than Karim closes once. On my dispatcher screen there is a **Generate closer key** button. It opens a modal showing a **6-digit code with a copy button** so I can paste it into WhatsApp. The code is stored hashed with `expiresAt = now + 12 hours`, is single-use, and can be revoked from the same modal. A one-time closer has exactly the same permissions as the closer, and their token stops working after 12 hours.

Sessions for Dispatcher and Closer should be long-lived — neither of us should be re-entering a key mid-wave.

---

## Firestore data model

```
drivers/{id}
  fullName            // canonical, always displayed in full
  active
  isBudDefault
  createdAt

sessions/{YYYY-MM-DD}
  date, wave, managedBy
  status: 'open' | 'allReturning' | 'closed'
  totalExpected
  allReturningAt, closedAt
  pdfUrl, returnsXlsxUrl

sessions/{sid}/entries/{entryId}
  seq, driverId, fullName, isBud

  // dispatcher-owned
  eta                 // "9:45"
  returnsRaw          // "2R 1 RNI 1 Can't find address"
  returnsCount        // 2
  returnsReasons      // [{count:1, text:"RNI"}, {count:1, text:"Can't find address"}]
  returnsMismatch     // bool, drives the amber warning
  performance         // 'up' | 'down'
  metric              // 'OI' | 'A' | 'JA' | 'JB' | 'B' | 'WB'
  infractions         // string
  rescues             // number, signed

  // closer-owned
  status              // 'enroute' | 'arrived'
  clockOut            // serverTimestamp
  van                 // string
  vanIssues           // string
  cell, key, fuel     // true | false | null
  addedByCloser       // bool — unannounced arrival flag

  updatedAt, updatedBy

accessKeys/{id}
  codeHash, expiresAt, usedAt, revoked
```

Notes that matter:
- `fullName` is **denormalized onto every entry**. Editing the driver roster must never rewrite historical sheets.
- Clock-out uses `serverTimestamp()`, not the phone's clock.
- Store timestamps in UTC, render in a single fixed station timezone constant. Never use the device timezone.
- **Sessions are never deleted.** Closing sets `status: 'closed'`. There is no delete path for a session anywhere in the UI or API.

---

# The phases

## Phase 0 — Scaffold and deploy

Create the Next.js + TypeScript + Tailwind project, the GitHub repo, and a working Vercel deployment of a near-empty shell. Set up the folder structure for the two route groups. No Firebase yet.

Gate: I should be able to open a live Vercel URL on both my laptop and my phone and see the placeholder.

## Phase 1 — Firebase wiring and auth

Firebase project connected, client and Admin SDK configured, `/api/login` with custom tokens, the login page with one key field and three role buttons, role-based redirect to `/dispatch` or `/closer`, session persistence, logout, and Firestore security rules enforcing role-based field ownership.

Leave the one-time closer button visible but non-functional — it lands in Phase 8. Tell me exactly which env vars to add to Vercel and how to add the service account credentials safely.

Gate: I can log in as Dispatcher on the laptop and Closer on the phone with the same key, land in the right place, and stay logged in after a refresh.

## Phase 2 — Driver database and roster entry

Driver collection with full names. The dispatcher's first screen of the day, when no session exists yet: a large multi-line paste box where I drop the names straight out of Cortex, one per line.

On submit, match each line against the driver database. Unmatched names surface as *"3 names not recognized"* with an inline **Add to database** button per name. Every roster row gets a **BUD** toggle. Submitting creates the session and sets `totalExpected`.

Also build a simple driver management screen so I can add, rename, and deactivate drivers.

Gate: I paste a realistic roster, add the new names, mark a couple as BUDs, and a session appears in Firestore with the right count.

## Phase 3 — Dispatcher entry form

The per-driver form, built for speed. Driver autocomplete → ETA text input → returns text block with live parse preview and the amber mismatch warning → performance up/down → metric buttons → infractions → rescues stepper. **Enter submits and returns focus to the name field** so I can go straight into the next driver.

Below it, a live table of everything entered so far, with inline editing — ETAs change constantly — and a remove-entry action. Include the **Add name** path here too, for a driver not yet in the database.

Gate: I enter several drivers at realistic speed, edit an ETA, and confirm the returns parsing handles `0R`, a single reason, multiple reasons, and a deliberate mismatch.

## Phase 4 — Closer live list

The mobile screen. Full-width cards sorted by ETA, live via `onSnapshot`. Overdue drivers tinted. Header shows progress as `12/28 arrived`. Sort menu offering ETA (default), name, and arrival time.

Tapping a card opens a sheet with a large **Arrived** button that stamps the clock-out time; tapping the stamped time lets Karim correct it. Arrived drivers move to a completed group.

This must be tested on a real phone, not a desktop browser at narrow width — thumb reach, tap target sizes, and one-handed use in a parking lot are the actual requirements.

Gate: I enter a driver on the laptop and it appears on the phone within a second or two without a refresh. Tapping Arrived stamps a time, and the count updates.

## Phase 5 — Closer detail sheet

Inside the same sheet: van number input, van issues free-text field, and three toggles for Cell / Key / Fuel cycling ✓ → ✗. Read-only display of the returns, infractions, and rescues I entered, so Karim can see them but cannot change them.

Also the closer-side **Add driver** button, for a driver who arrives unannounced — same autocomplete and create-new behaviour, flagged `addedByCloser` so I can fill in the dispatch fields afterwards.

**This is the first point where the app is usable in parallel with paper. I will run a real night on it after this phase before we continue.**

Gate: Karim completes a full driver record on his phone and I see the van number and issues update live on my laptop.

## Phase 6 — All Returning and the returns spreadsheet

The dispatcher's **All Returning** button. Two effects:

1. A banner pushed to Karim's phone — *"All DAs returning — 28 expected"* — with a sound and vibration, staying at the top until he dismisses it.
2. A returns spreadsheet generated server-side with `exceljs`, three columns:

| DA Name | Returns | Reason |
|---|---|---|
| Mark Lawson | 2 | 1 RNI, 1 Can't find address |
| Damien Whitfield | 3 | 2 Unsafe due to dog, 1 Damaged |

**Only include drivers with returns.** A driver with `0R` does not appear in the file at all. Full names, not initials. The file downloads immediately on my end and is also saved to Storage against the session.

Gate: I hit the button, Karim's phone alerts, and the spreadsheet downloads containing only the drivers with returns.

## Phase 7 — End Day, PDF, archive

**End Day** appears on Karim's phone once every entry is `arrived`, with a "close anyway" override that first lists who is still out. It sets the session to `closed` and generates the PDF.

The PDF reproduces the paper sheet: numbered rows, header with the date, "Managed by", wave, and shift label, then columns `# | Name | Time | Van | Cell | Key | Fuel | Infra | Rtr | Res | Van Issues`. Cell/Key/Fuel render as ✓ or ✗. Full names. Saved to Storage, `pdfUrl` written back to the session.

Then a **Share** action on the phone that hands the PDF straight to WhatsApp, and an archive screen on both sides listing past sessions with re-download links for the PDF and spreadsheet. No delete anywhere.

Gate: I complete a full mock night end to end and get a PDF that looks like the paper sheet, then re-download it from the archive the next day.

## Phase 8 — One-time closer keys

Wire up the button left dormant in Phase 1. Generate a 6-digit code, show it in a modal with a copy button, store it hashed with a 12-hour expiry, single-use, revocable. Login accepts it under the One-time closer role and grants closer permissions until it expires.

Gate: I generate a code, log in with it in a private window on another device, confirm it works, then revoke it and confirm it stops working.

## Phase 9 — Offline and polish

Firestore offline persistence enabled, with a sync indicator dot in the closer's header so Karim can see when writes are queued. Duplicate-entry guards. Loading and empty states. Error boundaries. A pass over the phone UI for tap targets and one-handed reach.

Gate: I put the phone in airplane mode mid-shift, mark two drivers arrived, turn it back on, and confirm both sync.

## Phase 10 — File storage, last

Added after Phase 7, not in the original plan.

Firebase Storage needs the Blaze plan, which needs a card, which I am not
doing. So the PDF and the returns spreadsheet are never archived as files —
the upload fails every time and the screen shows an amber warning saying so.

Nothing is lost by this today. The archive screen **rebuilds** both files on
demand from the night's entries in Firestore, so a night from three months ago
still downloads. The only thing missing is a frozen copy of what was actually
sent, and Karim may decide the WhatsApp group is that copy already.

Three ways this can go, to be decided at the end:

1. **Nothing.** Strip the Storage code, the two dead url fields and the amber
   warnings. Optionally snapshot the rendered rows into Firestore at End Day —
   about 2KB a night — so a rebuilt PDF is byte-identical to the one that was
   posted rather than reflecting later edits.
2. **Vercel Blob.** Already on Vercel, has a free allowance, no card. Same
   upload-and-store-a-url shape as the Firebase code being replaced. Check
   whether it can keep a file private — these carry full names, infractions
   and van issues.
3. **Firebase Storage after all**, if the Blaze plan turns out to be fine. The
   code for this already exists and works; it needs no changes, only a bucket.

Gate: whichever is chosen, End Day produces no warning and the archive returns
the same file twice.

---

## Non-negotiables

- **Never block me mid-wave.** Warnings are soft and inline. No modals during data entry.
- **Never lose typed text.** Raw input is always stored, even when parsing fails.
- **Never delete a session.**
- Server timestamps for clock-out; fixed station timezone for display.
- Full names everywhere — roster, closer cards, PDF, spreadsheet.
- The closer's UI is a phone UI first.

Start with **Phase 0** and stop at its gate.
