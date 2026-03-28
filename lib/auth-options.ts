import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

export const googleOAuthConfigured = Boolean(
  googleClientId?.trim() && googleClientSecret?.trim() && process.env.NEXTAUTH_SECRET?.trim()
);

export const authOptions: NextAuthOptions = {
  providers: googleOAuthConfigured
    ? [
        GoogleProvider({
          clientId: googleClientId!,
          clientSecret: googleClientSecret!,
          authorization: {
            params: {
              scope: [
                "openid",
                "email",
                "profile",
                "https://www.googleapis.com/auth/documents",
                "https://www.googleapis.com/auth/drive.file",
                "https://www.googleapis.com/auth/calendar.events",
              ].join(" "),
              access_type: "offline",
              prompt: "select_account consent",
              max_age: 0,
            },
          },
        }),
      ]
    : [],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).accessToken = token.accessToken;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
