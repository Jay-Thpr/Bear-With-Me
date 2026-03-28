# Track D — Post-Session + Workspace Writes
**Owner:** Person D (Product)
**Start:** Hour 0 — build against the demo data stub. Don't wait for Track A or B.
**Integration:** At Hour ~16, swap stubs for real data sources (session log from Track B, skill model from Track A).

---

## What You're Building

Everything that happens after "End Session":
1. Generate a post-session summary using Gemini (what improved, what needs work, recommended next focus)
2. Append that summary to the existing Google Doc skill model
3. Create a Google Calendar event for the next practice session
4. Return the assembled summary to the post-session report page for display

You also need the in-memory session log API that Track B's WS server POSTs coaching observations to during the live session.

---

## What Already Exists

| File | What it does |
|---|---|
| `lib/google-docs.ts` | `createSkillDoc(title, content)` — creates a new Google Doc. You'll add `appendSessionSummary()` to this. |
| `lib/auth.ts` | `getGoogleAuth()` — service account auth. You need to add Calendar scope to this. |
| `data/cooking-skill-demo.json` | Pre-computed skill model — use as test fixture while building. The shape has `sessionPlan`, `commonMistakes`, etc. |
| `src/app/post-session-report/page.tsx` | Post-session UI — fully built, currently hardcoded. You wire it to real data. |
| `package.json` | `googleapis` already installed (covers Docs + Calendar + Drive) |

**Run dev with:** `npm run dev`

---

## Environment Variables

```bash
GEMINI_API_KEY=                      # Required — for summary generation
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=     # or GOOGLE_SERVICE_ACCOUNT_JSON
GOOGLE_DRIVE_FOLDER_ID=              # Optional — target Drive folder for assets
```

**Important:** You need to add the Calendar scope to `lib/auth.ts`. Currently it only has Docs + Drive. Add `https://www.googleapis.com/auth/calendar` to the scopes array:

```typescript
// lib/auth.ts — update the scopes array
scopes: [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/calendar", // ADD THIS
],
```

---

## The `SkillModel` and `UserModel` types

You need these to write the summary. Get the canonical version from `lib/types.ts` once Track A creates it. For now, use this inline:

```typescript
// Paste into your new lib files until lib/types.ts exists
interface SkillModel {
  metadata: { skill: string; goal: string; level: string; createdAt: string };
  sessionPlan: {
    primaryFocus: string;
    successIndicators: string[];
  };
  commonMistakes: Array<{ issue: string; severity: string; correction: string }>;
  properForm: Record<string, string>;
}

interface SessionObservation {
  tier: number;           // 1=acknowledge, 2=verbal correct, 3=visual, 4=tutorial
  description: string;    // what was observed or said
  timestamp: string;      // session time MM:SS
  createdAt: string;      // ISO timestamp
}

interface SessionSummary {
  skill: string;
  sessionNumber: number;
  date: string;
  duration: string;
  whatWeFocused: string[];
  whatImproved: Array<{ area: string; evidence: string }>;
  needsWork: Array<{ area: string; priority: "high" | "medium" | "low" }>;
  skillsMastered: number;
  recommendedNextFocus: string;
  coachingNotes: string;
}
```

---

## Task D1 — Session log API (in-memory store)

Track B's WS server POSTs to this during the live session. You also expose a GET endpoint for the summary generator.

**New file:** `src/app/api/session/log/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

// In-memory — good enough for hackathon (single demo session)
const sessionLog: Array<{
  tier: number;
  description: string;
  timestamp: string;
  createdAt: string;
}> = [];

export async function POST(req: NextRequest) {
  try {
    const { tier, description, timestamp } = await req.json();
    sessionLog.push({
      tier: Number(tier),
      description: String(description),
      timestamp: String(timestamp),
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ log: sessionLog, count: sessionLog.length });
}

// Exported for use in summary route (same process)
export { sessionLog };
```

**New file:** `src/app/api/session/status/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

const skillStatuses: Map<string, string> = new Map();

export async function POST(req: NextRequest) {
  const { area, status } = await req.json();
  skillStatuses.set(area, status);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ statuses: Object.fromEntries(skillStatuses) });
}

export { skillStatuses };
```

---

## Task D2 — Post-session summary generation

**New file:** `lib/post-session.ts`

```typescript
import { GoogleGenAI } from "@google/genai";

const GEMINI_MODEL = "gemini-2.5-flash";

function getAI() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

export interface SessionSummary {
  skill: string;
  sessionNumber: number;
  date: string;
  duration: string;
  whatWeFocused: string[];
  whatImproved: Array<{ area: string; evidence: string }>;
  needsWork: Array<{ area: string; priority: "high" | "medium" | "low" }>;
  skillsMastered: number;
  recommendedNextFocus: string;
  coachingNotes: string;
  updatedUserModel: {
    mastered: string[];
    improving: Array<{ area: string; trend: string }>;
    needsWork: Array<{ area: string; priority: number }>;
  };
}

export async function generateSessionSummary(
  skill: string,
  sessionNumber: number,
  skillModelJson: string,
  observations: Array<{ tier: number; description: string; timestamp: string }>,
  skillStatuses: Record<string, string>
): Promise<SessionSummary> {
  // Fallback for demo/dev
  if (!process.env.GEMINI_API_KEY || observations.length === 0) {
    return buildFallbackSummary(skill, sessionNumber, skillStatuses);
  }

  const ai = getAI();

  const obsText = observations
    .map(o => `[Tier ${o.tier}] ${o.timestamp} — ${o.description}`)
    .join("\n");

  const statusText = Object.entries(skillStatuses)
    .map(([area, status]) => `${area}: ${status}`)
    .join(", ");

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: `You are generating a post-session coaching report.

SKILL: ${skill}
SESSION: #${sessionNumber}
DATE: ${new Date().toLocaleDateString()}

SKILL MODEL (what we were aiming for):
${skillModelJson}

COACHING OBSERVATIONS FROM THIS SESSION (${observations.length} total):
${obsText}

SKILL STATUS UPDATES:
${statusText || "none recorded"}

Analyze the session and generate a structured summary. Look for:
- What the coach focused on most (highest-tier interventions, repeated corrections)
- What showed improvement (Tier 1 acknowledgments, status changed to "improving" or "mastered")
- What still needs work (repeated Tier 2-3 corrections without status improvement)
- The single most important thing to focus on next session

Return ONLY valid JSON:
{
  "whatWeFocused": ["focus area 1", "focus area 2"],
  "whatImproved": [{ "area": "skill area", "evidence": "specific observation that shows improvement" }],
  "needsWork": [{ "area": "skill area", "priority": "high|medium|low" }],
  "skillsMastered": 0,
  "recommendedNextFocus": "single most important thing for next session",
  "coachingNotes": "1-2 sentences about this student's progress and tendencies",
  "updatedUserModel": {
    "mastered": ["area that is now mastered"],
    "improving": [{ "area": "...", "trend": "improving" }],
    "needsWork": [{ "area": "...", "priority": 1 }]
  }
}`,
    config: { responseMimeType: "application/json" },
  });

  const parsed = JSON.parse(response.text);

  return {
    skill,
    sessionNumber,
    date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    duration: `${Math.ceil(observations.length * 0.5)} min`, // rough estimate
    ...parsed,
  };
}

function buildFallbackSummary(
  skill: string,
  sessionNumber: number,
  skillStatuses: Record<string, string>
): SessionSummary {
  const mastered = Object.entries(skillStatuses)
    .filter(([, s]) => s === "mastered")
    .map(([area]) => area);

  return {
    skill,
    sessionNumber,
    date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    duration: "~10 min",
    whatWeFocused: ["Fundamental technique", "Proper form"],
    whatImproved: [{ area: "Overall technique", evidence: "Consistent improvement throughout session" }],
    needsWork: [{ area: "Advanced technique", priority: "medium" }],
    skillsMastered: mastered.length,
    recommendedNextFocus: "Continue practicing core fundamentals with focus on consistency",
    coachingNotes: "Good session. Keep practicing regularly.",
    updatedUserModel: {
      mastered,
      improving: [],
      needsWork: [],
    },
  };
}
```

---

## Task D3 — Append session summary to Google Docs

**File:** `lib/google-docs.ts` — add this function to the existing file

```typescript
/**
 * Appends a session summary section to an existing skill doc.
 * Creates a new doc if no docId is provided (first session fallback).
 */
export async function appendSessionSummary(
  title: string,
  summary: import("./post-session").SessionSummary,
  existingDocId?: string
): Promise<string> {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH && !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error("NO_CREDENTIALS");
  }

  const auth = getGoogleAuth();
  const docs = google.docs({ version: "v1", auth });

  // Build the section text
  const sectionText = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION ${summary.sessionNumber} — ${summary.date} — ${summary.duration}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHAT WE FOCUSED ON
${summary.whatWeFocused.map(f => `• ${f}`).join("\n")}

WHAT IMPROVED
${summary.whatImproved.map(i => `✓ ${i.area}: ${i.evidence}`).join("\n")}

NEEDS WORK
${summary.needsWork.map(n => `[${n.priority.toUpperCase()}] ${n.area}`).join("\n")}

SKILLS MASTERED THIS SESSION: ${summary.skillsMastered}

NEXT SESSION FOCUS
${summary.recommendedNextFocus}

COACH NOTES
${summary.coachingNotes}

USER MODEL UPDATED
Mastered: ${summary.updatedUserModel.mastered.join(", ") || "none yet"}
Improving: ${summary.updatedUserModel.improving.map(i => i.area).join(", ") || "none"}
Still needs work: ${summary.updatedUserModel.needsWork.map(n => n.area).join(", ") || "none"}
`;

  let docId = existingDocId;

  if (!docId) {
    // Create new summary doc if no existing doc
    const createRes = await docs.documents.create({
      requestBody: { title },
    });
    docId = createRes.data.documentId!;
  }

  // Append to end of document
  // First get current end index
  const docRes = await docs.documents.get({ documentId: docId });
  const endIndex = docRes.data.body?.content?.slice(-1)[0]?.endIndex ?? 1;

  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [{
        insertText: {
          location: { index: Math.max(1, endIndex - 1) },
          text: sectionText,
        },
      }],
    },
  });

  return `https://docs.google.com/document/d/${docId}`;
}
```

---

## Task D4 — Google Calendar: schedule next session

**New file:** `lib/google-calendar.ts`

If Track A builds this file too, coordinate — they may have already created it. Check `lib/google-calendar.ts` before creating.

```typescript
import { google } from "googleapis";
import { getGoogleAuth } from "./auth";

export async function scheduleNextSession(
  skillName: string,
  recommendedFocus: string,
  sessionNumber: number,
  spacingDays: number = 2 // default: practice again in 2 days
): Promise<string | null> {
  try {
    const auth = getGoogleAuth();
    const calendar = google.calendar({ version: "v3", auth });

    const start = new Date();
    start.setDate(start.getDate() + spacingDays);
    start.setHours(10, 0, 0, 0); // Default 10am

    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 30); // 30-minute session

    const event = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: `Practice: ${skillName} — Session ${sessionNumber + 1}`,
        description: `Focus: ${recommendedFocus}\n\nCreated by your AI coach from your last session.`,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 30 },
          ],
        },
      },
    });

    return event.data.htmlLink || null;
  } catch (err: any) {
    console.error("[calendar] Failed to schedule session:", err?.message);
    return null; // Non-fatal — demo continues without calendar event
  }
}
```

**Spacing logic** (pass as `spacingDays`):
- New technique / beginner: `1` (practice tomorrow)
- Reinforcement / intermediate: `2-3`
- Polish / advanced: `5-7`

For demo, default to `2` — creates an event the day after tomorrow.

---

## Task D5 — Summary API route (the main orchestrator)

**New file:** `src/app/api/session/summary/route.ts`

This is what the browser calls when the user ends a session. It orchestrates D2 + D3 + D4.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { generateSessionSummary } from "../../../../lib/post-session";
import { appendSessionSummary } from "../../../../lib/google-docs";
import { scheduleNextSession } from "../../../../lib/google-calendar";

export async function POST(req: NextRequest) {
  let skill: string, sessionNumber: number, skillModelJson: string, docId: string | undefined;

  try {
    const body = await req.json();
    skill = body.skill || "the skill";
    sessionNumber = body.sessionNumber || 1;
    skillModelJson = body.skillModelJson || "{}";
    docId = body.docId || undefined;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  try {
    // Fetch the session log (from D1)
    const logRes = await fetch("http://localhost:3000/api/session/log");
    const { log: observations } = await logRes.json();

    // Fetch skill statuses (from D1)
    const statusRes = await fetch("http://localhost:3000/api/session/status");
    const { statuses: skillStatuses } = await statusRes.json();

    // Generate summary
    const summary = await generateSessionSummary(
      skill,
      sessionNumber,
      skillModelJson,
      observations || [],
      skillStatuses || {}
    );

    // Run Docs write + Calendar create in parallel (both non-fatal)
    const [docUrl, calendarUrl] = await Promise.allSettled([
      appendSessionSummary(`${skill} — Coaching Journal`, summary, docId),
      scheduleNextSession(
        skill,
        summary.recommendedNextFocus,
        sessionNumber,
        getSpacingDays(summary)
      ),
    ]).then(results => results.map(r => r.status === "fulfilled" ? r.value : null));

    return NextResponse.json({
      success: true,
      summary,
      docUrl,
      calendarUrl,
    });

  } catch (err) {
    console.error("[session/summary] Error:", err);
    return NextResponse.json({ error: "Summary generation failed" }, { status: 500 });
  }
}

function getSpacingDays(summary: { needsWork: Array<{ priority: string }> }): number {
  const hasHighPriority = summary.needsWork.some(n => n.priority === "high");
  return hasHighPriority ? 1 : 2;
}
```

---

## Task D6 — Wire the post-session report page

**File:** `src/app/post-session-report/page.tsx`

Currently hardcoded. Wire it to call `/api/session/summary` and display real data.

Add to the component:

```typescript
// Add at top of PostSessionReportContent:
const [summary, setSummary] = useState<any>(null);
const [docUrl, setDocUrl] = useState<string | null>(null);
const [calendarUrl, setCalendarUrl] = useState<string | null>(null);
const [loading, setLoading] = useState(true);

useEffect(() => {
  const skillModelJson = sessionStorage.getItem("skillModelJson") || "{}";
  const docId = sessionStorage.getItem("docId") || undefined;
  const sessionNumber = parseInt(sessionStorage.getItem("sessionNumber") || "1");

  fetch("/api/session/summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      skill,
      sessionNumber,
      skillModelJson,
      docId,
    }),
  })
    .then(r => r.json())
    .then(data => {
      setSummary(data.summary);
      setDocUrl(data.docUrl);
      setCalendarUrl(data.calendarUrl);
      setLoading(false);
    })
    .catch(err => {
      console.error("[post-session] Summary fetch failed:", err);
      setLoading(false);
    });
}, [skill]);
```

Then replace hardcoded values with real data. Key mappings:

| Hardcoded value | Replace with |
|---|---|
| `"Session 7 Complete"` | `Session ${summary?.sessionNumber || 1} Complete` |
| `"Rocking cut technique"` | `summary?.whatWeFocused?.[0]` |
| `+2 skills mastered` | `summary?.skillsMastered` |
| The "What improved" list | `summary?.whatImproved.map(...)` |
| The "Needs work" list | `summary?.needsWork.map(...)` |
| Calendar button link | `calendarUrl` |
| Google Docs button link | `docUrl` |

Show a loading state while `loading === true`:
```tsx
if (loading) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="text-zinc-400 mb-2">Saving your session...</div>
        <div className="w-8 h-1 bg-emerald-500 rounded-full animate-pulse mx-auto" />
      </div>
    </div>
  );
}
```

---

## Pre-Seeded Returning User Demo Asset

For the demo's "returning user" segment, you need a pre-loaded history in Google Docs. Do this manually before the demo:

1. Create a Google Doc titled "Knife Skills — Coaching Journal"
2. Paste in 5 fake session summaries (Session 1-5) with a progression arc:
   - Session 1: Grip and basic stance — everything needs work
   - Session 2: Grip improving, blade angle still problematic
   - Session 3: Grip mastered, working on blade angle
   - Session 4: Blade angle much better, working on speed
   - Session 5: Speed improving, ready for dice cuts
3. Copy that doc's ID (from the URL) into a config or hardcode it as `DEMO_DOC_ID` in `.env.local`

When the returning user demo runs, this history loads and the system picks up at Session 6.

---

## Testing Without Live Session Data

For dev/testing before Track B is wired:

1. POST fake observations to the session log:
```bash
curl -X POST http://localhost:3000/api/session/log \
  -H 'Content-Type: application/json' \
  -d '{"tier":2,"description":"Wrist is dropping during the stroke","timestamp":"2:30"}'

curl -X POST http://localhost:3000/api/session/log \
  -H 'Content-Type: application/json' \
  -d '{"tier":1,"description":"Good, that grip was much better","timestamp":"4:15"}'
```

2. Then trigger summary generation:
```bash
curl -X POST http://localhost:3000/api/session/summary \
  -H 'Content-Type: application/json' \
  -d '{"skill":"knife skills","sessionNumber":1,"skillModelJson":"{}"}'
```

---

## Integration Checklist

At Hour ~16, Track B sends coaching observations to `POST /api/session/log` during live sessions. Before you merge:

- [ ] `GET /api/session/log` returns the real-time log correctly
- [ ] `POST /api/session/summary` generates and saves a summary from real log data
- [ ] Google Docs append works (check the doc after running)
- [ ] Calendar event created (check calendar)
- [ ] Post-session page shows real data, not hardcoded strings
- [ ] `sessionStorage` values are set by Track E in the research-loading → session-briefing flow
