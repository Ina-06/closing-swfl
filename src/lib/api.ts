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
 * Hand a generated file to the browser's downloads.
 *
 * The object URL is revoked on the next tick rather than immediately: revoking
 * it in the same frame as the click races the download in some browsers, and a
 * spreadsheet that silently fails to arrive is worse than a few bytes held a
 * moment longer.
 */
export async function saveAs(response: Response, filename: string) {
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
