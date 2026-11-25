/**
 * Email, through Resend's HTTP API. Server only.
 *
 * Plain fetch rather than the SDK: one endpoint, one call, nothing to install.
 * RESEND_API_KEY is the key; the From address has to be on a domain verified
 * in Resend, or Resend refuses the send.
 *
 * https://resend.com/docs/api-reference/emails/send-email
 */

export type Email = {
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string[];
  /**
   * The same key twice within 24 hours sends once. A retried run cannot
   * email anybody twice for the same reminder.
   */
  idempotencyKey: string;
};

export async function sendEmail(email: Email): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REGISTRATION_EMAIL_FROM;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set.");
  if (!from) throw new Error("REGISTRATION_EMAIL_FROM is not set.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": email.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(email.replyTo && email.replyTo.length > 0 ? { reply_to: email.replyTo } : {}),
    }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(`Resend refused the email (${response.status}): ${body.message ?? "no reason given"}`);
  }
  return { id: body.id ?? "" };
}

/** "a@x.com, b@y.com" → ["a@x.com", "b@y.com"]. Anything without an @ is dropped. */
export function emailList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[,;\s]+/)
    .map((address) => address.trim())
    .filter((address) => address.includes("@"));
}

/** Text for an HTML body. Van fields are typed by people, so never raw. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
