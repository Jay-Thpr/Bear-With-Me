import { google } from "googleapis";
import { buildAuth } from "./auth";

export async function scheduleNextSession(
  skillName: string,
  recommendedFocus: string,
  sessionNumber: number,
  spacingDays = 2,
  auth?: any
): Promise<string | null> {
  try {
    const resolvedAuth = buildAuth(auth ?? null);
    const calendar = google.calendar({ version: "v3", auth: resolvedAuth });

    const start = new Date();
    start.setDate(start.getDate() + spacingDays);
    start.setHours(10, 0, 0, 0);

    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 30);

    try {
      const event = await calendar.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: `Practice: ${skillName} - Session ${sessionNumber + 1}`,
          description: `Focus: ${recommendedFocus}\n\nCreated by your AI coach from your last session.`,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
          reminders: {
            useDefault: false,
            overrides: [{ method: "popup", minutes: 30 }],
          },
        },
      });

      return event.data.htmlLink || null;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}
