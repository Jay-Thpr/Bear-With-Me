import { NextResponse } from "next/server";

export const runtime = "nodejs";

const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL ?? "gemini-2.0-flash-live-001";

export async function POST() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey?.trim()) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set on the server." },
      { status: 503 },
    );
  }

  try {
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(Date.now() + 3 * 60 * 1000).toISOString();

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1alpha/authTokens?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            uses: 1,
            expireTime,
            newSessionExpireTime,
          },
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("[ephemeral-token] Gemini API error:", res.status, text);
      return NextResponse.json(
        { error: `Failed to create ephemeral token: ${res.status}` },
        { status: 502 },
      );
    }

    const data = await res.json();
    const accessToken = data.name as string;

    if (!accessToken) {
      return NextResponse.json({ error: "Gemini returned no token name" }, { status: 502 });
    }

    return NextResponse.json({ accessToken, liveModel: LIVE_MODEL });
  } catch (err: any) {
    console.error("[ephemeral-token] Error:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Token creation failed" }, { status: 500 });
  }
}
