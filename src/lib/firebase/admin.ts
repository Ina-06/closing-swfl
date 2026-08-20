import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Server-side Firebase, for privileged work only.
 *
 * This module must never be imported from a client component — it carries the
 * service account, which bypasses every security rule. It is used by
 * /api/login to mint role-carrying custom tokens, by /api/keys for the one-time
 * codes, and by the PDF and spreadsheet routes to read a night's entries
 * without the caller having to be trusted with a query.
 *
 * FIREBASE_SERVICE_ACCOUNT_KEY holds the entire downloaded JSON key file, as
 * one value. Base64 is also accepted, because some shells mangle a pasted
 * multi-line JSON blob.
 */
function readServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not set.");
  }

  const json = raw.trim().startsWith("{")
    ? raw
    : Buffer.from(raw, "base64").toString("utf8");

  let parsed: { project_id?: string; client_email?: string; private_key?: string };
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON. Paste the whole downloaded key file, including the outer braces.",
    );
  }

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY is missing project_id, client_email or private_key.",
    );
  }

  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    // Some hosting UIs turn the escaped \n inside the key into literal
    // backslash-n. Firebase needs real newlines or the signature fails.
    privateKey: parsed.private_key.replace(/\\n/g, "\n"),
  };
}

let adminApp: App | undefined;

function getAdminApp(): App {
  if (!adminApp) {
    adminApp = getApps().length
      ? getApps()[0]
      : initializeApp({ credential: cert(readServiceAccount()) });
  }
  return adminApp;
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}
