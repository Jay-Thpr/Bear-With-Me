import { NextRequest, NextResponse } from "next/server";
import { appendSessionSummary } from "../../../../../lib/google-docs";
import { scheduleNextSession } from "../../../../../lib/google-calendar";
import { generateSessionSummary } from "../../../../../lib/post-session";
import { getUserOAuthClient } from "../../../../../lib/getUserAuth";

export async function POST(req: NextRequest) {
  let skill: string;
  let sessionNumber: number;
  let skillModelJson: string;
  let docId: string | undefined;

  try {
    const body = await req.json();
    skill = String(body.skill || "the skill");
    sessionNumber = Number(body.sessionNumber || 1);
    skillModelJson = String(body.skillModelJson || "{}");
    docId = body.docId ? String(body.docId) : undefined;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  try {
    const origin = req.nextUrl.origin;
    const [logRes, statusRes] = await Promise.all([
      fetch(`${origin}/api/session/log`, { cache: "no-store" }),
      fetch(`${origin}/api/session/status`, { cache: "no-store" }),
    ]);

    const [observations, skillStatuses] = await Promise.all([
      logRes.json() as Promise<Array<{ tier: number; description: string; timestamp: string }>>,
      statusRes.json() as Promise<Record<string, string>>,
    ]);

    const summary = await generateSessionSummary(
      skill,
      sessionNumber,
      skillModelJson,
      observations || [],
      skillStatuses || {}
    );

    const oauthClient = await getUserOAuthClient();

    const [docUrl, calendarUrl] = await Promise.allSettled([
      appendSessionSummary(`${skill} - Coaching Journal`, summary, docId, oauthClient),
      scheduleNextSession(skill, summary.recommendedNextFocus, sessionNumber, getSpacingDays(summary), oauthClient),
    ]).then((results) => results.map((result) => (result.status === "fulfilled" ? result.value : null)));

    return NextResponse.json({
      success: true,
      summary,
      docUrl,
      calendarUrl,
    });
  } catch {
    return NextResponse.json({ error: "Summary generation failed" }, { status: 500 });
  }
}

function getSpacingDays(summary: { needsWork: Array<{ priority: string }> }): number {
  return summary.needsWork.some((item) => item.priority === "high") ? 1 : 2;
}
