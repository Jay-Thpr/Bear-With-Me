import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createSkillDoc } from "../../../../../lib/google-docs";
import { getUserOAuthClient } from "../../../../../lib/getUserAuth";

export async function POST() {
  const oauthClient = await getUserOAuthClient();

  if (!oauthClient) {
    return NextResponse.json(
      { error: "You must sign in with Google before running this test." },
      { status: 401 }
    );
  }

  try {
    const now = new Date();
    const tomorrowAtTwo = new Date(now);
    tomorrowAtTwo.setDate(now.getDate() + 1);
    tomorrowAtTwo.setHours(14, 0, 0, 0);

    const end = new Date(tomorrowAtTwo);
    end.setMinutes(end.getMinutes() + 30);

    const [docUrl, calendarUrl] = await Promise.all([
      createSkillDoc(
        `Glitch OAuth Test - ${now.toLocaleString()}`,
        [
          "This is a Google OAuth integration test from the Glitch app.",
          "",
          `Created at: ${now.toString()}`,
          `Scheduled test event for: ${tomorrowAtTwo.toString()}`,
        ].join("\n"),
        oauthClient
      ),
      google
        .calendar({ version: "v3", auth: oauthClient })
        .events
        .insert({
          calendarId: "primary",
          requestBody: {
            summary: "Glitch OAuth Test",
            description: "Calendar write test from the Glitch app.",
            start: { dateTime: tomorrowAtTwo.toISOString() },
            end: { dateTime: end.toISOString() },
          },
        })
        .then((res) => res.data.htmlLink || null),
    ]);

    return NextResponse.json({
      success: true,
      docUrl,
      calendarUrl,
      scheduledFor: tomorrowAtTwo.toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Google test failed." },
      { status: 500 }
    );
  }
}
