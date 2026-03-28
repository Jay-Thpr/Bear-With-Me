import { getServerSession } from "next-auth";
import { google } from "googleapis";
import { authOptions, googleOAuthConfigured } from "./auth-options";

/**
 * Returns a googleapis OAuth2 client pre-loaded with the user's access token.
 * Returns null if the user is not signed in or has no access token.
 */
export async function getUserOAuthClient(): Promise<any | null> {
  if (!googleOAuthConfigured) return null;

  const session = await getServerSession(authOptions);
  const accessToken = (session as any)?.accessToken;
  
  if (!accessToken) return null;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  
  oauth2Client.setCredentials({ access_token: accessToken });
  return oauth2Client;
}
