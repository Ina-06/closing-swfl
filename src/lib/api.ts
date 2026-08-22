"use client";

import { getClientAuth } from "@/lib/firebase/client";

/**
 * How long any of our own routes gets before we give up on it.
 *
 * Generous, because the sheet route renders a PDF before it answers. But finite,
 * because a phone in a metal building can hold a request open indefinitely and
 * nothing in this app is worth a button that never comes back — a control stuck
 * mid-press is worse than one that says it failed.
 */
const TIMEOUT_MS = 45_000;

/** Rejects when the controller fires, so a hung promise cannot outlive it. */
function untilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")), {
      once: true,
    });
  });
}

/**
 * Call one of our own routes as the signed-in user.
 *
 * The id token goes in the header and is verified server-side against the same
 * role claim firestore.rules reads, so a route is exactly as hard to reach as a
 * document is. Nothing here trusts the browser to say who it is.
 *
 * Both halves are under the same clock. Minting the token can hang on a phone
 * that has lost the network just as easily as the request can, and either one
 * hanging leaves whatever called this waiting forever.
 */
export async function postAuthed(path: string, body: unknown): Promise<Response> {
  const user = getClientAuth().currentUser;
  if (!user) throw new Error("Signed out. Sign in again and retry.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const token = await Promise.race([
      user.getIdToken(),
      untilAborted(controller.signal),
    ]);

    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      // The route sends JSON on failure and a file on success, so this only ever
      // parses the failure shape.
      const payload: { error?: string } = await response.json().catch(() => ({}));
      throw new Error(payload.error ?? `That request failed (${response.status}).`);
    }

    return response;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        "That took too long — the signal may have dropped. Try it again.",
      );
    }
    throw error instanceof Error
      ? error
      : new Error("That request did not go through.");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether handing a file to this device has to go through the share sheet.
 *
 * True on iOS and iPadOS. It is the platform being detected and not the
 * browser, because every browser on an iPhone is WebKit underneath — Chrome
 * there behaves exactly as Safari does.
 *
 * There is no feature test for this. `download` is present on every anchor on
 * every platform; what differs is that WebKit treats a click on one pointing at
 * a `blob:` url as a *navigation* to that url rather than as a download. A
 * navigation is something a content blocker extension can refuse, and Karim's
 * does — "The URL was blocked by a content blocker" is what he gets instead of
 * a PDF. So on these devices the share sheet is not the nicer route, it is the
 * only one, and a failed share must be reported rather than quietly turned into
 * a download that cannot work.
 */
export function shareSheetOnly(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac. The touch points are what give it away.
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

/**
 * How long a share sheet needs to have been on screen for a person to have
 * dismissed it.
 *
 * WebKit throws AbortError for two completely different things: the sheet was
 * presented and the user closed it, and the sheet could not be presented at
 * all. There is no other way to tell them apart — same error name, same empty
 * message — but they do not take the same amount of time. A failure to present
 * comes back within a few milliseconds. A person has to watch the sheet animate
 * in, decide against it, and reach for Cancel.
 *
 * Getting it wrong in the cautious direction shows a message telling him to tap
 * again, which is a small annoyance. Getting it wrong the other way is what we
 * had: a tap that did nothing and said nothing, forever.
 */
const SHEET_WAS_SEEN_MS = 600;

/**
 * What became of a file we tried to hand over.
 *
 * `cancelled` is separate from `shared` because only one of them means the file
 * went somewhere, and separate from `failed` because he already knows about it
 * — he saw the sheet and closed it. Nothing needs saying.
 *
 * `failed` is its own answer rather than a thrown error: nothing went wrong with
 * the sheet, it is still in hand, and the only thing to do about it is tap
 * again. That is a sentence on the screen, not an exception.
 */
export type HandOff = "shared" | "cancelled" | "saved" | "failed";

/**
 * What happened, and the shortest note that says which way it happened.
 *
 * `why` exists because three nights were spent guessing between two paths that
 * produce the identical message. It is a dozen characters of shorthand meant to
 * be read back over the phone or photographed — never an explanation, and never
 * the thing Karim is expected to act on. That is what the sentence beside it is
 * for.
 */
export type Handover = { how: HandOff; why: string };

/**
 * Whether this is a Home Screen web app rather than a tab.
 *
 * Not a detail. Karim's phone reports `home`, which settles two things we had
 * been guessing at: there is no address bar on his screen, so Safari's Reload
 * Without Content Blockers is nowhere he can reach it; and the share sheet is
 * being asked for from a standalone web app, which is the one context where
 * this phone has never once opened it.
 *
 * (Modern iOS makes a Home Screen icon standalone whether or not the site ships
 * a manifest, which is why this is true here despite there being none.)
 */
function standalone(): boolean {
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

/**
 * Ask the phone once, and report exactly what came back.
 *
 * The elapsed time is half the diagnosis. WebKit throws AbortError both when a
 * person closes the sheet and when the sheet never opened, and the only thing
 * that separates them is that a person takes longer than a few milliseconds.
 */
async function offer(
  payload: ShareData,
): Promise<{ ok: boolean; name: string; ms: number }> {
  const asked = Date.now();
  try {
    await navigator.share(payload);
    return { ok: true, name: "", ms: Date.now() - asked };
  } catch (error) {
    return {
      ok: false,
      name: error instanceof Error && error.name ? error.name : "unknown",
      ms: Date.now() - asked,
    };
  }
}

/**
 * Hand a file to whatever the phone uses to send things.
 *
 * On a phone this is the system share sheet, which is where WhatsApp lives —
 * the same two taps Karim already uses to post a photo of the paper sheet.
 * Anywhere that downloads files properly, it downloads instead.
 *
 * The blob must already be in hand when this is called, and this is the whole
 * reason both callers pre-build. Fetching inside the click and then sharing
 * spends the user gesture on the network: by the time `share` is reached iOS no
 * longer counts the tap as user-initiated, throws NotAllowedError, and what used
 * to happen next was a fall back to a download the phone could not do.
 */
export async function shareOrSave(
  blob: Blob,
  filename: string,
  text: string,
): Promise<Handover> {
  const file = new File([blob], filename, { type: blob.type });
  const phone = shareSheetOnly();
  const where = standalone() ? "home" : "browser";

  /** He saw the sheet and shut it. A decision, not a failure. */
  const closed = (r: { name: string; ms: number }) =>
    r.name === "AbortError" && r.ms >= SHEET_WAS_SEEN_MS;

  if (!navigator.canShare?.({ files: [file] })) {
    // The phone will not take a PDF through the share sheet at all, so there
    // was never a sheet to open. On a desktop that is fine — it downloads
    // below. On a phone it is the end of the road, and saying so names a cause
    // that no amount of tapping Share again will change.
    if (phone) return { how: "failed", why: `${where}·no-files` };
  } else {
    /**
     * One attempt. There is only ever one to be had.
     *
     * This used to try the full payload and then fall back to the file on its
     * own, and the trace off Karim's phone is what killed that:
     * `home·AbortError7·NotAllowedError0`. The first call was refused in seven
     * milliseconds, and the second came back as NotAllowedError in none at all
     * — which is iOS saying the gesture is spent. A failed share consumes the
     * tap exactly as a successful one does, so the fallback could never have
     * worked, whatever was wrong with the payload.
     *
     * So the one attempt carries the file and nothing else. canShare is only
     * ever asked about the files, so it answering yes says nothing about
     * whether a share carrying a file *and* a caption will be accepted, and
     * iOS is measurably fussier about the pair. The caption was a nicety; the
     * date is in the filename either way.
     *
     * A laptop keeps it, because it is not the one attempt there — the
     * download below is waiting behind it.
     */
    const payload: ShareData = phone
      ? { files: [file] }
      : { files: [file], title: filename, text };

    const tried = await offer(payload);
    if (tried.ok) return { how: "shared", why: `${where}·sent·${tried.ms}ms` };
    if (closed(tried)) return { how: "cancelled", why: `${where}·closed` };

    if (phone) {
      return { how: "failed", why: `${where}·${tried.name}${tried.ms}` };
    }
  }

  saveBlob(blob, filename);
  return { how: "saved", why: `${where}·download` };
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Hand a generated file to the browser's downloads.
 *
 * The object URL is revoked on the next tick rather than immediately: revoking
 * it in the same frame as the click races the download in some browsers, and a
 * spreadsheet that silently fails to arrive is worse than a few bytes held a
 * moment longer.
 */
export async function saveAs(response: Response, filename: string) {
  saveBlob(await response.blob(), filename);
}
