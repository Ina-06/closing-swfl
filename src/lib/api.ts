"use client";

import { getClientAuth } from "@/lib/firebase/client";

/**
 * Call one of our own routes as the signed-in user.
 *
 * The id token goes in the header and is verified server-side against the same
 * role claim firestore.rules reads, so a route is exactly as hard to reach as a
 * document is. Nothing here trusts the browser to say who it is.
 */
export async function postAuthed(path: string, body: unknown): Promise<Response> {
  const user = getClientAuth().currentUser;
  if (!user) throw new Error("Signed out. Sign in again and retry.");

  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    // The route sends JSON on failure and a file on success, so this only ever
    // parses the failure shape.
    const payload: { error?: string } = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? `That request failed (${response.status}).`);
  }

  return response;
}

/**
 * Hand a file to whatever the phone uses to send things.
 *
 * On a phone this is the system share sheet, which is where WhatsApp lives —
 * the same two taps Karim already uses to post a photo of the paper sheet.
 * Anywhere without it, and on a cancelled share, it falls back to a download.
 *
 * The blob must already be in hand when this is called. Fetching inside the
 * click and then sharing loses the user gesture on iOS, and the share sheet
 * silently never opens.
 */
export async function shareOrSave(
  blob: Blob,
  filename: string,
  text: string,
): Promise<"shared" | "saved"> {
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
    }
  }

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
