import { google } from "googleapis";

/**
 * Returns a GoogleAuth instance configured with the service account credentials.
 * Credentials are loaded from env vars — never committed to the repo.
 *
 * Two options:
 *   GOOGLE_SERVICE_ACCOUNT_KEY_PATH — path to the JSON key file on disk
 *   GOOGLE_SERVICE_ACCOUNT_JSON    — the key file contents as an inline JSON string
 *
 * Scopes cover Docs + Drive (needed for createSkillDoc in google-docs.ts).
 *
 * TODO: Set one of the following in .env.local before running in production:
 *   GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/path/to/service-account.json
 *   GOOGLE_SERVICE_ACCOUNT_JSON=<base64-decoded JSON string of the service account key>
 * TODO: Set GOOGLE_SERVICE_ACCOUNT_EMAIL in .env.local (used for Drive sharing if needed)
 */
export function getGoogleAuth() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!keyFile && !keyJson) {
    throw new Error(
      "Missing Google service account credentials in env. " +
        "Set GOOGLE_SERVICE_ACCOUNT_KEY_PATH or GOOGLE_SERVICE_ACCOUNT_JSON."
    );
  }

  return new google.auth.GoogleAuth({
    ...(keyFile ? { keyFile } : { credentials: JSON.parse(keyJson!) }),
    scopes: [
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/calendar",
    ],
  });
}

/**                                    
 * Use this in API routes that run during a user session.
 * Pass the OAuth client if available, otherwise falls back to service account.                                   
 */                                                                                                               
export function buildAuth(oauthClient: any | null) {                                                              
  if (oauthClient) return oauthClient;                                                                            
  return getGoogleAuth(); // service account fallback
}
