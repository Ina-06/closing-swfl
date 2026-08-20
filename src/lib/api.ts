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
 * What became of a file we tried to hand over.
 *
 * `failed` is its own answer rather than a thrown error: nothing went wrong
 * with the sheet, it is still in hand, and the only thing to do about it is
 * tap again. That is a sentence on the screen, not an exception.
 */
export type HandOff = "shared" | "saved" | "failed";

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
 * longer counts the tap as user-initiated, throws NotAllowedError, and what
 * used to happen next was a fall back to a download the phone could not do.
 */
export async function shareOrSave(
  blob: Blob,
  filename: string,
  text: string,
): Promise<HandOff> {
  const file = new File([blob], filename, { type: blob.type });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename, text });
      return "shared";
    } catch (error) {
      // Cancelling the sheet throws AbortError. That is a decision, not a
      // failure, so it must not turn into a download he did not ask for.
      if (error instanceof Error && error.name === "AbortError") {
        return "shared";
      }
      if (shareSheetOnly()) return "failed";
    }
  }

  if (shareSheetOnly()) return "failed";

  saveBlob(blob, filename);
  return "saved";
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
