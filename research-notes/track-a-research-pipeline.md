# Track A — Research Pipeline Upgrade
**Owner:** Person A (Tech)
**Start:** Hour 0 — no dependencies, begin immediately
**Unlocks:** Track B needs your `SkillModel` interface + `assembleSystemPrompt()`. Track D needs your session plan shape. Agree on interfaces, then both sides can stub and build independently.

---

## What You're Building

The current pipeline in `src/app/api/research/route.ts` does:
1. Find YouTube URLs (Gemini search grounding)
2. Analyze all videos in one batch call
3. Synthesize into **plain text**

You're upgrading it to the full 9-step pipeline that produces a **structured `SkillModel` JSON object** — the single source of truth for the entire system. Every other track depends on this shape.

---

## What Already Exists (don't rebuild these)

| File | What it does |
|---|---|
| `lib/gemini.ts` | `findTutorialUrls()`, `analyzeSkillVideos()`, `synthesizeSkillDoc()` — all working, just need upgrading |
| `lib/google-docs.ts` | `createSkillDoc(title, content)` — creates a Google Doc, writes chunked text, returns URL |
| `lib/auth.ts` | `getGoogleAuth()` — service account auth for Docs + Drive |
| `lib/youtube.ts` | `searchYouTubeTutorials(skill)` — YouTube Data API fallback, used if Gemini grounding returns < 3 URLs |
| `prompts/skill-research.ts` | `buildDiscoveryPrompt()`, `buildAnalysisPrompt()`, `buildSynthesisPrompt()` — prompt templates |
| `src/app/api/research/route.ts` | Main research API route — currently 3-step, returns plain text skill doc |
| `data/cooking-skill-demo.json` | Pre-computed demo fallback — activate with `GLITCH_USE_DEMO_DOC=true` |

**Run dev with:** `npm run dev` (starts Next.js + WebSocket server concurrently)
**Test the current pipeline:** `curl -X POST http://localhost:3000/api/research -H 'Content-Type: application/json' -d '{"skill":"knife skills"}'`

---

## Environment Variables (set in `.env.local`)

```bash
GEMINI_API_KEY=               # Required — Gemini API key from AI Studio
GOOGLE_SERVICE_ACCOUNT_KEY_PATH= # or GOOGLE_SERVICE_ACCOUNT_JSON
GOOGLE_DRIVE_FOLDER_ID=       # Optional — moves docs into this Drive folder
YOUTUBE_API_KEY=              # Optional — fallback if grounding misses YouTube URLs
GLITCH_USE_DEMO_DOC=true      # Dev shortcut — skip Gemini, return cooking-skill-demo.json
```

---

## The Core Interface — Settle This First

Share this with everyone. `SkillModel` is the type all tracks build against.

**Create `lib/types.ts`** — new file, no other logic:

```typescript
export interface SkillModel {
  metadata: {
    skill: string;
    goal: string;
    level: string;
    createdAt: string;
    illustration: string; // URL or base64 data URI, or "/fallback-skill-icon.png"
  };
  teachingStrategy: {
    approach: string;
    learningStyle: string;
    successCriteria: string;
    pacingNotes: string;
  };
  properForm: Record<string, string>; // { "grip": "thumb and index finger pinch the spine..." }
  commonMistakes: Array<{
    issue: string;          // observable description — what the camera sees
    severity: "high" | "medium" | "low";
    correction: string;     // specific fix action
    videoReference?: { url: string; timestamp: string };
  }>;
  progressionOrder: string[];
  safetyConsiderations: string[];
  videoReferences: Array<{
    url: string;
    title: string;
    bestMoments: Array<{
      timestamp: string;
      description: string;
      useCase: string; // "when to show this during live coaching"
    }>;
  }>;
  sessionPlan: {
    primaryFocus: string;
    secondaryFocus: string;
    warmupActivity: string;
    keyCheckpoints: string[];
    successIndicators: string[];
  };
  webSources: Array<{ title: string; url: string }>;
}

export interface UserModel {
  totalSessions: number;
  mastered: string[];
  improving: Array<{ area: string; trend: string }>;
  needsWork: Array<{ area: string; priority: number }>;
  preferences: {
    pushesBackOn: string[];
    respondsWellTo: string[];
    coachingStyle: string;
  };
}

export interface ResearchPipelineResult {
  skillModel: SkillModel;
  systemPrompt: string;
  illustrationUrl: string;
  docUrl: string | null;
  skillModelJson: string; // JSON.stringify(skillModel) — passed to WS server
}
```

---

## Task A1 — Upgrade `synthesizeSkillDoc` to return `SkillModel` JSON

**File:** `lib/gemini.ts`

Current `synthesizeSkillDoc()` returns plain text. Replace it with a call that returns the full `SkillModel` object.

```typescript
// Replace synthesizeSkillDoc() with this:
export async function synthesizeSkillModel(
  skill: string,
  goal: string,
  level: string,
  webResearch: string,        // raw JSON string from conductWebResearch (or empty string)
  videoAnalyses: string[],    // array of raw JSON strings from analyzeYouTubeVideo
  illustrationUrl: string
): Promise<SkillModel> {
  if (!process.env.GEMINI_API_KEY) {
    // Return demo model for dev
    const { default: demoDoc } = await import("../data/cooking-skill-demo.json");
    return demoDoc as unknown as SkillModel;
  }

  const ai = getAI();

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: `You are synthesizing research into a structured coaching plan for "${skill}".

GOAL: ${goal}
LEVEL: ${level}

WEB RESEARCH:
${webResearch || "Not available"}

VIDEO ANALYSES:
${videoAnalyses.join("\n\n---\n\n") || "Not available"}

Rules:
1. MERGE duplicate information from web + video sources
2. For each common mistake, if any video shows a correction, add videoReference with url + timestamp
3. All properForm descriptions must be OBSERVABLE from a camera (specific body parts, angles, positions)
4. sessionPlan must be tailored to this user's level and goal
5. Return ONLY valid JSON — no markdown, no extra text

Return a JSON object matching this exact shape:
{
  "metadata": { "skill": "${skill}", "goal": "${goal}", "level": "${level}", "createdAt": "${new Date().toISOString()}", "illustration": "${illustrationUrl}" },
  "teachingStrategy": { "approach": "...", "learningStyle": "...", "successCriteria": "...", "pacingNotes": "..." },
  "properForm": { "aspect_name": "precise observable description" },
  "commonMistakes": [{ "issue": "observable", "severity": "high|medium|low", "correction": "specific fix", "videoReference": { "url": "...", "timestamp": "MM:SS" } }],
  "progressionOrder": ["step 1", "step 2"],
  "safetyConsiderations": ["..."],
  "videoReferences": [{ "url": "...", "title": "...", "bestMoments": [{ "timestamp": "MM:SS", "description": "...", "useCase": "when to show this" }] }],
  "sessionPlan": { "primaryFocus": "...", "secondaryFocus": "...", "warmupActivity": "...", "keyCheckpoints": ["..."], "successIndicators": ["..."] },
  "webSources": [{ "title": "...", "url": "..." }]
}`,
    config: { responseMimeType: "application/json" },
  });

  return JSON.parse(response.text) as SkillModel;
}
```

---

## Task A2 — Add `conductWebResearch()` (Google Search grounding)

**File:** `lib/gemini.ts` — add this function

```typescript
export async function conductWebResearch(
  skill: string,
  goal: string,
  level: string
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    return `{"fundamentals":"Core technique for ${skill}","properForm":{},"commonMistakes":[],"progressionSteps":[],"safetyConsiderations":[],"sources":[]}`;
  }

  const ai = getAI();

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: `Research how to coach someone in "${skill}", goal: "${goal}", level: ${level}.

Use Google Search to find:
1. Core technique fundamentals
2. Proper form — OBSERVABLE descriptions only (what a camera can see: body parts, angles, positions)
3. Common mistakes (observable) and their corrections
4. Progression order (4-6 stages)
5. Safety considerations

Return ONLY valid JSON:
{
  "fundamentals": "2-3 sentence overview",
  "properForm": { "aspect_name": "precise observable description" },
  "commonMistakes": [{ "issue": "observable description", "severity": "high|medium|low", "correction": "specific fix" }],
  "progressionSteps": ["step 1", "step 2"],
  "safetyConsiderations": ["..."],
  "sources": [{ "title": "...", "url": "..." }]
}`,
    config: {
      responseMimeType: "application/json",
      tools: [{ googleSearch: {} }],
    },
  });

  // Augment sources with grounding metadata
  try {
    const result = JSON.parse(response.text);
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    if (chunks.length > 0) {
      result.sources = chunks
        .filter((c: any) => c.web?.uri)
        .map((c: any) => ({ title: c.web.title || c.web.uri, url: c.web.uri }));
    }
    return JSON.stringify(result);
  } catch {
    return response.text; // Pass raw text to synthesis step if parse fails
  }
}
```

---

## Task A3 — Upgrade per-video analysis (parallel execution)

**File:** `lib/gemini.ts` — replace `analyzeSkillVideos()` with two functions

The current function passes all URLs in one call. Replace with per-video calls so each can be analyzed in parallel and progress updates can be streamed.

```typescript
// Single video analysis — called in parallel via Promise.allSettled
export async function analyzeYouTubeVideo(
  videoUrl: string,
  skill: string,
  goal: string
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    return `{"url":"${videoUrl}","title":"Mock Tutorial","overallSummary":"Mock analysis","keyTechniques":[],"commonMistakesShown":[],"bestMomentsForReference":[]}`;
  }

  const ai = getAI();

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      { fileData: { fileUri: videoUrl } },
      { text: `Analyze this tutorial video for coaching someone in "${skill}" with goal "${goal}".

Extract:
1. KEY TECHNIQUES: Each distinct technique shown. Include timestamp (MM:SS), description of proper form, visual cues for what correct looks like
2. COMMON MISTAKES: If instructor shows/discusses mistakes — timestamp, mistake description, correction
3. BEST MOMENTS: 2-3 moments ideal for showing a student during live coaching ("pause, watch this part")

Return ONLY valid JSON:
{
  "url": "${videoUrl}",
  "title": "video title",
  "overallSummary": "2-3 sentences",
  "keyTechniques": [{ "technique": "name", "timestamp": "MM:SS", "description": "proper form", "visualCues": "what to look for" }],
  "commonMistakesShown": [{ "mistake": "description", "timestamp": "MM:SS", "correction": "fix" }],
  "bestMomentsForReference": [{ "timestamp": "MM:SS", "description": "what is shown", "useCase": "when to show this during coaching" }]
}` },
    ],
    config: { responseMimeType: "application/json" },
  });

  return response.text;
}

// Run all video analyses in parallel
export async function analyzeAllVideos(
  urls: string[],
  skill: string,
  goal: string,
  onVideoAnalyzed?: (title: string) => void
): Promise<string[]> {
  const results = await Promise.allSettled(
    urls.map(url => analyzeYouTubeVideo(url, skill, goal))
  );

  const analyses: string[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      try {
        const parsed = JSON.parse(result.value);
        onVideoAnalyzed?.(parsed.title || "unknown video");
        analyses.push(result.value);
      } catch {
        // Skip malformed responses
      }
    }
    // Silently skip rejected promises — don't fail the whole pipeline for one video
  }
  return analyses;
}
```

---

## Task A4 — Add `generateSkillIllustration()` (Nano Banana)

**File:** `lib/gemini.ts` — add this function

```typescript
export async function generateSkillIllustration(skill: string): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    return "/fallback-skill-icon.png";
  }

  try {
    const ai = getAI();

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-04-17", // Nano Banana image gen model
      contents: `Create a minimal, stylized illustration for the skill: "${skill}".
- Square format, clean composition
- Warm inviting color palette, dark background
- No text in the image
- Show the essential visual element (hands, tools, body position)
- App icon aesthetic — not photorealistic`,
      config: {
        responseModalities: ["IMAGE", "TEXT"],
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    return "/fallback-skill-icon.png";
  } catch (err) {
    console.error("[gemini] Illustration generation failed:", err);
    return "/fallback-skill-icon.png"; // Never block the pipeline
  }
}
```

---

## Task A5 — Upgrade the research API route (SSE streaming + full pipeline)

**File:** `src/app/api/research/route.ts` — full rewrite

This is the main orchestrator. Upgrades:
- Accepts full `SkillSelectionInput` (not just `skill`)
- Returns `text/event-stream` (SSE) so the loading page gets live status updates
- Runs illustration + web research + YouTube discovery in parallel
- Returns `SkillModel` JSON (not plain text) in the final `done` event

```typescript
import { NextRequest } from "next/server";
import {
  findTutorialUrls,
  analyzeAllVideos,
  synthesizeSkillModel,
  conductWebResearch,
  generateSkillIllustration,
} from "../../../../lib/gemini";
import { createSkillDoc } from "../../../../lib/google-docs";
import { assembleSystemPrompt } from "../../../../lib/session-context";
import type { SkillModel } from "../../../../lib/types";

export const runtime = "nodejs"; // Required for SSE

export async function POST(req: NextRequest) {
  let skill: string, goal: string, level: string;
  try {
    const body = await req.json();
    skill = body?.skill?.trim() || "";
    goal = body?.goal?.trim() || `Learn ${skill}`;
    level = body?.level || "beginner";
  } catch {
    return new Response(JSON.stringify({ error: "invalid body" }), { status: 400 });
  }

  if (!skill) {
    return new Response(JSON.stringify({ error: "skill required" }), { status: 400 });
  }

  // SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (type: string, data: object | string) => {
        const payload = typeof data === "string" ? { message: data } : data;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type, ...payload })}\n\n`)
        );
      };

      try {
        // Demo fallback
        if (process.env.GLITCH_USE_DEMO_DOC === "true") {
          const { default: demoDoc } = await import("../../../../data/cooking-skill-demo.json");
          emit("status", { message: "Loading demo coaching plan..." });
          await new Promise(r => setTimeout(r, 800));
          let docUrl: string | null = null;
          try {
            docUrl = await createSkillDoc(`${skill} — Skill Model (Demo)`, JSON.stringify(demoDoc, null, 2));
          } catch {}
          emit("done", { skillModel: demoDoc, docUrl, systemPrompt: "" });
          controller.close();
          return;
        }

        emit("status", { message: `🔍 Starting research for "${skill}"...` });

        // ── PARALLEL: illustration + web research + YouTube discovery ──
        const [illustrationUrl, webResearch, videoUrls] = await Promise.all([
          generateSkillIllustration(skill).then(url => {
            emit("status", { message: "🎨 Skill illustration generated" });
            emit("illustration", { url });
            return url;
          }),
          conductWebResearch(skill, goal, level).then(result => {
            try {
              const parsed = JSON.parse(result);
              emit("status", { message: `✅ Proper form identified: ${Object.keys(parsed.properForm || {}).slice(0, 3).join(", ")}` });
              emit("status", { message: `⚠️ ${(parsed.commonMistakes || []).length} common mistakes cataloged` });
            } catch {}
            return result;
          }),
          findTutorialUrls(skill).then(urls => {
            emit("status", { message: `📺 Found ${urls.length} tutorial videos` });
            return urls;
          }),
        ]);

        // ── SEQUENTIAL: analyze each video (parallel internally) ──
        emit("status", { message: "📺 Analyzing tutorial videos..." });
        const videoAnalyses = await analyzeAllVideos(
          videoUrls,
          skill,
          goal,
          (title) => emit("status", { message: `✅ Analyzed: "${title}"` })
        );

        // ── SYNTHESIZE ──
        emit("status", { message: "🧠 Synthesizing coaching plan..." });
        const skillModel = await synthesizeSkillModel(
          skill, goal, level, webResearch, videoAnalyses, illustrationUrl
        );
        emit("status", { message: "✅ Coaching plan ready" });

        // ── SAVE TO GOOGLE DOCS ──
        emit("status", { message: "📄 Saving to Google Docs..." });
        let docUrl: string | null = null;
        try {
          docUrl = await createSkillDoc(
            `${skill} — Skill Model`,
            JSON.stringify(skillModel, null, 2)
          );
          emit("status", { message: "✅ Saved to Google Docs" });
        } catch (err: any) {
          if (err?.message !== "NO_CREDENTIALS") {
            console.error("[research] Docs write failed:", err);
          }
        }

        // ── ASSEMBLE SYSTEM PROMPT ──
        const systemPrompt = assembleSystemPrompt(skillModel, null);

        emit("done", {
          skillModel,
          skillModelJson: JSON.stringify(skillModel),
          systemPrompt,
          docUrl,
        });

      } catch (err) {
        console.error("[research] Pipeline error:", err);
        emit("error", { message: "Research pipeline failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
```

---

## Task A6 — Create `lib/session-context.ts` (system prompt assembler)

**New file.** This is the function Person B needs to boot a Gemini Live session. Create the interface first so B can stub it.

```typescript
// lib/session-context.ts
import type { SkillModel, UserModel } from "./types";

export function assembleSystemPrompt(
  skillModel: SkillModel,
  userModel: UserModel | null // null for first session
): string {
  const formLines = Object.entries(skillModel.properForm)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const mistakeLines = skillModel.commonMistakes
    .map(m => `- [${m.severity.toUpperCase()}] ${m.issue} → Fix: ${m.correction}${m.videoReference ? ` (ref: ${m.videoReference.url} at ${m.videoReference.timestamp})` : ""}`)
    .join("\n");

  const tutorialLines = skillModel.videoReferences
    .flatMap(v => v.bestMoments.map(m => `- "${m.description}" → ${v.url}&t=${m.timestamp} | use when: ${m.useCase}`))
    .join("\n");

  let prompt = `[ROLE]
You are a real-time coaching assistant. You watch the user via their camera feed (1 frame per second) and provide live voice feedback. You are warm, specific, and encouraging. You are NOT a chatbot — you are a coach standing next to the user watching them practice.

[SKILL MODEL]
Skill: ${skillModel.metadata.skill}
Goal: ${skillModel.metadata.goal}
Level: ${skillModel.metadata.level}

Proper form to watch for:
${formLines}

[COMMON MISTAKES TO WATCH FOR]
${mistakeLines}

[TEACHING STRATEGY]
Approach: ${skillModel.teachingStrategy.approach}
Learning style: ${skillModel.teachingStrategy.learningStyle}
Pacing: ${skillModel.teachingStrategy.pacingNotes}

[SESSION PLAN]
Primary focus: ${skillModel.sessionPlan.primaryFocus}
Secondary focus: ${skillModel.sessionPlan.secondaryFocus}
Warmup: ${skillModel.sessionPlan.warmupActivity}
Checkpoints:
${skillModel.sessionPlan.keyCheckpoints.map(c => `- ${c}`).join("\n")}
Success indicators:
${skillModel.sessionPlan.successIndicators.map(s => `- ${s}`).join("\n")}

[VIDEO REFERENCES]
${tutorialLines}

[SAFETY]
${skillModel.safetyConsiderations.map(s => `- ${s}`).join("\n")}
`;

  if (userModel && userModel.totalSessions > 0) {
    prompt += `
[USER HISTORY — SESSION ${userModel.totalSessions + 1}]
Previous sessions: ${userModel.totalSessions}

DO NOT correct these (mastered):
${userModel.mastered.length > 0 ? userModel.mastered.map(m => `- ${m}`).join("\n") : "- Nothing mastered yet"}

Reinforce but don't over-correct:
${userModel.improving.map(i => `- ${i.area} (${i.trend})`).join("\n")}

Prioritize corrections here:
${userModel.needsWork.map(n => `- ${n.area} (priority: ${n.priority})`).join("\n")}

User preferences:
- Pushes back on: ${userModel.preferences.pushesBackOn.join(", ") || "nothing noted"}
- Responds well to: ${userModel.preferences.respondsWellTo.join(", ") || "nothing noted"}
`;
  }

  prompt += `
[INTERVENTION RULES — FOLLOW STRICTLY]
1. One correction at a time. Never dump multiple.
2. Escalation tiers:
   - Tier 1 (ACKNOWLEDGE): Brief positive when user does something well. "Good, that was cleaner." Use frequently.
   - Tier 2 (VERBAL CORRECT): Short correction for minor issues. "Try keeping the blade tip on the board."
   - Tier 3 (VISUAL): Call generate_annotation() when correction is spatial AND you've given same verbal correction 2-3 times. Say "Hold on, let me show you something" first.
   - Tier 4 (TUTORIAL): Call reference_tutorial() for fundamental technique misunderstandings. Say "Let me show you how this should look."
3. NEVER skip tiers for a new issue.
4. Log EVERY piece of feedback via log_observation().
5. If user pushes back, acknowledge and note it. Don't argue.
6. Call update_skill_status() when you see clear improvement or mastery.

[VOICE STYLE]
Concise. Specific. Encouraging. Natural. Real-time coaching, not lectures.

[AVAILABLE FUNCTIONS]
- log_observation(tier: number, description: string, timestamp: string)
- generate_annotation(correction: string, bodyPart: string)
- reference_tutorial(url: string, timestamp: string, reason: string)
- update_skill_status(area: string, status: "needs_work" | "improving" | "mastered")
`;

  return prompt;
}
```

---

## Task A7 — Calendar context (optional, add if time allows)

**New file:** `lib/google-calendar.ts`

```typescript
import { google } from "googleapis";
import { getGoogleAuth } from "./auth";

export interface CalendarContext {
  suggestedPracticeTimes: Array<{ start: string; end: string }>;
  timeZone: string;
}

export async function getCalendarContext(daysAhead = 7): Promise<CalendarContext> {
  // Need to add calendar scope to auth — update lib/auth.ts scopes array:
  // "https://www.googleapis.com/auth/calendar.readonly"
  const auth = getGoogleAuth();
  const calendar = google.calendar({ version: "v3", auth });

  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + daysAhead);

  const freeBusy = await calendar.freebusy.query({
    requestBody: {
      timeMin: now.toISOString(),
      timeMax: future.toISOString(),
      items: [{ id: "primary" }],
    },
  });

  const busy = freeBusy.data.calendars?.primary?.busy || [];
  const freeSlots = findFreeSlots(busy, now, future, 30);

  return {
    suggestedPracticeTimes: freeSlots.slice(0, 3),
    timeZone: freeBusy.data.timeZone || "America/Los_Angeles",
  };
}

function findFreeSlots(
  busy: Array<{ start?: string | null; end?: string | null }>,
  from: Date,
  to: Date,
  minMinutes: number
): Array<{ start: string; end: string }> {
  const sorted = busy
    .filter(s => s.start && s.end)
    .sort((a, b) => new Date(a.start!).getTime() - new Date(b.start!).getTime());

  const slots: Array<{ start: string; end: string }> = [];
  let cursor = from;

  for (const slot of sorted) {
    const busyStart = new Date(slot.start!);
    if (busyStart > cursor) {
      const gapMins = (busyStart.getTime() - cursor.getTime()) / 60000;
      const hour = cursor.getHours();
      if (gapMins >= minMinutes && hour >= 8 && hour <= 21) {
        slots.push({
          start: cursor.toISOString(),
          end: new Date(cursor.getTime() + minMinutes * 60000).toISOString(),
        });
      }
    }
    const busyEnd = new Date(slot.end!);
    if (busyEnd > cursor) cursor = busyEnd;
  }
  return slots;
}
```

---

## Your Output at Integration (Hour ~16)

When Track E comes to wire the research-loading page, they need your API to:

1. Accept `POST /api/research` with body `{ skill, goal, level }`
2. Return `Content-Type: text/event-stream`
3. Emit events in this format:
   ```
   data: {"type":"status","message":"..."}\n\n
   data: {"type":"illustration","url":"data:image/..."}\n\n
   data: {"type":"done","skillModel":{...},"skillModelJson":"...","systemPrompt":"...","docUrl":"..."}\n\n
   data: {"type":"error","message":"..."}\n\n
   ```
4. `skillModel` in the `done` event must match the `SkillModel` interface exactly
5. `systemPrompt` must be the assembled string from `assembleSystemPrompt()`

Track E stores `skillModel` and `systemPrompt` in `sessionStorage` on the `done` event, then navigates to `/session-briefing`.

---

## Demo Safety Net

If the Gemini API fails or takes too long during the demo:
- Set `GLITCH_USE_DEMO_DOC=true` in `.env.local`
- The route immediately returns the pre-computed `data/cooking-skill-demo.json`
- Update that file to match the `SkillModel` interface shape so it works as a real fallback
