# Parallel Build Framework — Real-Time Self-Training Coach

**Hackathon:** UCLA Glitch x DeepMind
**Team:** 4 people | **Constraint:** ~24-hour build
**As of:** 2026-03-27

---

## What's Already Built

| File | Status | What it does |
|---|---|---|
| `src/app/skill-selection/page.tsx` | ✅ UI done | Skill input, level, goal selection |
| `src/app/session-prep/page.tsx` | ✅ UI done | Pre-session config, context toggles |
| `src/app/research-loading/page.tsx` | ✅ UI done | Loading screen (needs real SSE wiring) |
| `src/app/session-briefing/page.tsx` | ✅ UI done | Pre-session briefing (needs real data) |
| `src/app/live-coaching/page.tsx` | ✅ UI done | Live session UI (needs WS connection) |
| `src/app/post-session-report/page.tsx` | ✅ UI done | Post-session summary (needs real data) |
| `src/app/api/research/route.ts` | ✅ Wired | 3-step pipeline + demo fallback |
| `lib/gemini.ts` | ✅ Working | findTutorialUrls, analyzeSkillVideos, synthesizeSkillDoc |
| `lib/google-docs.ts` | ✅ Working | createSkillDoc (chunked write) |
| `lib/auth.ts` | ✅ Working | Service account auth |
| `lib/youtube.ts` | ✅ Working | YouTube Data API fallback search |
| `server/index.ts` | ⚠️ Stub | WebSocket server exists, not wired to Gemini Live |
| `data/cooking-skill-demo.json` | ✅ Done | Pre-seeded demo fallback |

---

## What Still Needs to Be Built

### Organized by Track (each track can run in parallel)

---

## Track A — Research Pipeline Upgrade
**Owner:** Person A (Tech)
**Unlocks:** Track B (needs SkillModel JSON), Track D (needs session plan)
**Can start:** Hour 0

### A1 — Structured SkillModel JSON output
The current pipeline produces plain text. Upgrade `synthesizeSkillDoc` to emit the full typed `SkillModel` JSON defined in `research-pipeline-implementation.md` Step 6.

**File:** `lib/gemini.ts` → `synthesizeSkillDoc()`
**Also update:** `src/app/api/research/route.ts` to return `skillModel` as parsed JSON, not raw string
**Output shape:** `SkillModel` interface (metadata, teachingStrategy, properForm, commonMistakes, progressionOrder, videoReferences, sessionPlan, webSources)

### A2 — Per-video deep analysis (parallel execution)
Currently `analyzeSkillVideos` passes all URLs in one request. Switch to per-video calls run in `Promise.all()` to match the `VideoAnalysis` interface in Step 5b.

**File:** `lib/gemini.ts` → new `analyzeYouTubeVideo(url, skill, goal)` + `analyzeAllVideos()`
**Status updates:** emit per-video as each completes (feeds A5 SSE)

### A3 — Web research (Google Search grounding)
Add `conductWebResearch()` as a dedicated step that runs in parallel with YouTube discovery. Returns `WebResearchResult` (properForm, commonMistakes, progressionSteps, sources).

**File:** `lib/gemini.ts` → new `conductWebResearch(skill, goal, level, preferences)`
**Config:** `tools: [{ googleSearch: {} }]`, `responseMimeType: "application/json"`

### A4 — Skill illustration (Nano Banana)
Generate a visual icon per skill. Runs in parallel with A3/A2 in the orchestrator.

**File:** `lib/gemini.ts` → new `generateSkillIllustration(skill)`
**Model:** `gemini-2.5-flash-preview-04-17` with `responseModalities: ["IMAGE", "TEXT"]`
**On failure:** return `/fallback-skill-icon.png` — never block the pipeline

### A5 — SSE status streaming from research API
The research-loading page needs real-time status updates ("Analyzing Jacques Pépin video...").

**File:** `src/app/api/research/route.ts` → upgrade to `ReadableStream` (SSE)
**File:** `src/app/research-loading/page.tsx` → wire `EventSource` to consume status events
**Events to emit:** step start, per-video analyzed, synthesis complete, doc URL ready

### A6 — System prompt assembler
The function that takes `SkillModel` + `UserModel` and produces the Gemini Live system prompt.

**File:** `lib/session-context.ts` → new file, exports `assembleSystemPrompt(skillModel, userModel)`
**Used by:** WebSocket server (Track B) at session start

### A7 — Calendar context pull
Pull free/busy from Google Calendar to suggest practice times. Optional (skip gracefully if no auth).

**File:** `lib/google-calendar.ts` → new file, exports `getCalendarContext(auth, daysAhead)`
**Runs in parallel** with A3 and A2 in the research orchestrator

---

## Track B — Live Session (WebSocket + Gemini Live)
**Owner:** Person B (Tech)
**Depends on:** A6 for system prompt shape (interface only — can stub during dev)
**Can start:** Hour 0 (stub the system prompt string, wire real one at integration)

### B1 — Gemini Live connection in WebSocket server
Wire `server/index.ts` to open a Gemini Live session when a client connects.

**File:** `server/index.ts`
**SDK:** `@google/genai` — `ai.live.connect({ model: "gemini-2.5-flash", config: { systemInstruction, tools } })`
**Session lifecycle:** open on WS connect, close on WS disconnect
**System prompt:** accept via the first message from client (`{ type: "session_start", skillModelJson, userModelJson }`)

### B2 — Video frame forwarding (browser → WS → Gemini Live)
Browser captures webcam at 1 FPS, sends as base64, server forwards to Gemini Live.

**File:** `src/app/live-coaching/page.tsx` → add `setInterval` frame capture via `canvas.toDataURL()`
**File:** `server/index.ts` → forward `inlineData` video chunk to Live session
**Rate:** 1 FPS (1000ms interval)
**Format:** JPEG base64 at reduced quality (0.7) to minimize payload size

### B3 — Audio bidirectional stream
Browser sends mic audio chunks; Gemini Live sends audio back for playback.

**File:** `src/app/live-coaching/page.tsx` → `MediaRecorder` on mic stream, send chunks over WS
**File:** `server/index.ts` → forward audio to Gemini Live; receive audio response, send back to browser
**Client playback:** `AudioContext` + `decodeAudioData` on received base64 PCM

### B4 — Function call handler
Gemini Live emits function calls. Server intercepts and dispatches to Next.js API routes.

**File:** `server/index.ts` → listen for `toolCall` in Live session messages
**Functions to handle:**

| Function | Dispatches to | Returns |
|---|---|---|
| `log_observation(tier, description, timestamp)` | `POST /api/session/log` | `{ ok: true }` |
| `generate_annotation(correction, bodyPart)` | `POST /api/annotate` | `{ imageUrl }` |
| `reference_tutorial(url, timestamp, reason)` | inline — return from skill model | `{ url, timestamp }` |
| `update_skill_status(area, status)` | `POST /api/session/status` | `{ ok: true }` |

After handling, send `toolResponse` back to Live session so it can continue.

### B5 — Intervention tier tracking (UI feedback)
Forward the tier level of each observation to the browser for display in the coaching log.

**File:** `server/index.ts` → after `log_observation`, send `{ type: "log_entry", tier, message }` to browser WS
**File:** `src/app/live-coaching/page.tsx` → append to log state on receive

---

## Track C — Annotation (Nano Banana)
**Owner:** Can be Person B or C
**Depends on:** nothing — fully independent
**Can start:** Hour 0

### C1 — Frame capture utility
Grab the current video frame as base64 JPEG.

**File:** `lib/capture-frame.ts` → `captureFrame(videoElement): string` (base64)
**Used by:** `/api/annotate` route (passes frame in request body from server)

### C2 — `/api/annotate` route
Receives a correction description + captured frame base64, sends to Nano Banana, returns annotated image URL.

**File:** `src/app/api/annotate/route.ts` → new file
**Input:** `{ frameBase64: string, correction: string, bodyPart: string }`
**Calls:** Gemini image gen with `responseModalities: ["IMAGE"]`
**Prompt:** "Draw [correction] on this image. Circle [bodyPart]. Add a directional arrow showing corrected position."
**Output:** `{ imageUrl: string }` (base64 data URI or Drive URL)
**Fallback:** if generation fails, return `{ imageUrl: null }` — coach narrates instead

### C3 — Annotated frame display in live UI
Show the annotated frame in the visual aid panel when received.

**File:** `src/app/live-coaching/page.tsx` → `showVisualAid === "annotated"` state is already wired
**Wire:** set `annotatedFrameUrl` state when WS sends `{ type: "annotation", imageUrl }`

---

## Track D — Post-Session + Workspace Writes
**Owner:** Person D (Product)
**Depends on:** A1 for SkillModel interface (can stub with `cooking-skill-demo.json`)
**Can start:** Hour 0

### D1 — Session log API + in-memory store
Simple in-memory log per session (adequate for hackathon).

**File:** `src/app/api/session/log/route.ts` → new file
**Stores:** array of `{ tier, description, timestamp }` keyed by sessionId
**GET endpoint:** return full log for a session (used by post-session page)

### D2 — Post-session summary generation
After session ends, use Gemini to synthesize the observation log into a structured summary.

**File:** `lib/post-session.ts` → new file, exports `generateSessionSummary(skillModel, sessionLog)`
**Output:** `{ whatWeFocused, whatImproved, needsWork, recommendedNextFocus }`
**Also updates user model** — "mastered grip, now focus on blade angle"

### D3 — Write summary to Google Docs
Append session summary to the existing skill doc (or create post-session doc).

**File:** `lib/google-docs.ts` → add `appendSessionSummary(docId, summary)` function
**Format:** section headed "SESSION [N] — [date]" appended at bottom of existing skill doc

### D4 — Google Calendar — create next session
After post-session summary, create a calendar event for next practice.

**File:** `lib/google-calendar.ts` → add `scheduleNextSession(auth, skillName, suggestedTime)`
**Spacing logic:** new technique → tomorrow; reinforcement → 3 days out
**Returns:** event URL for display on post-session report

### D5 — Wire post-session report page to real data
The post-session page currently shows static mock data.

**File:** `src/app/post-session-report/page.tsx` → fetch from `/api/session/summary?sessionId=...`
**File:** `src/app/api/session/summary/route.ts` → new route, orchestrates D2 + D3 + D4
**Trigger:** called when user clicks "End Session" in live-coaching page

---

## Track E — Frontend Integration Points
**Owner:** Person C (Design/Tech) — can start stubs immediately, wire at integration

### E1 — Session-prep → research-loading → session-briefing flow
The skill selection data needs to flow through query params or session storage.

**Current gap:** `session-prep` submits → needs to POST to `/api/research` (SSE) → update loading page → redirect to `session-briefing` with skill model
**File:** `src/app/research-loading/page.tsx` → implement `EventSource` on mount, accumulate status messages, redirect on `done` event
**File:** `src/app/session-briefing/page.tsx` → read skill model from sessionStorage (set by research-loading on complete)

### E2 — Session-briefing → live-coaching
Pass skillModel + sessionId via sessionStorage or URL param to live-coaching.

**File:** `src/app/session-briefing/page.tsx` → on "Start Session" click, store skillModel in sessionStorage, navigate to `/live-coaching`
**File:** `src/app/live-coaching/page.tsx` → read skillModel from sessionStorage, send as `session_start` message to WS

### E3 — Live-coaching WebSocket connection
The page has camera working but no WS connection.

**File:** `src/app/live-coaching/page.tsx` → add `useEffect` to connect `WebSocket("ws://localhost:3001")`
**On connect:** send `{ type: "session_start", skillModelJson }`
**On message:** dispatch by `type` (log_entry, annotation, audio, error)

### E4 — End session → post-session flow
"End Session" button needs to POST the session log and navigate.

**File:** `src/app/live-coaching/page.tsx` → on end: send `{ type: "session_end" }` to WS, POST to `/api/session/summary`, navigate to `/post-session-report?sessionId=...`

---

## Integration Wave (Hour ~16-18)

By this point each track should be individually functional:

| Track | Deliverable at integration |
|---|---|
| A | `POST /api/research` returns `SkillModel` JSON + SSE status stream |
| B | WS server accepts `session_start`, connects to Gemini Live, streams audio back |
| C | `POST /api/annotate` returns annotated image base64 |
| D | `POST /api/session/summary` generates + saves summary, creates calendar event |
| E | All pages connected end-to-end with real data flow |

**Integration checklist:**
- [ ] Research pipeline returns parsed `SkillModel` JSON (not plain text)
- [ ] Live-coaching page connects to WS, sends `session_start` with skill model
- [ ] Gemini Live audio plays back in browser
- [ ] Frame capture → WS → Gemini Live pipeline works at 1 FPS
- [ ] `generate_annotation` function call triggers `/api/annotate`, returns image to UI
- [ ] "End Session" → summary in Google Docs + Calendar event created
- [ ] Session briefing shows real skill model data

---

## Parallelism Summary

```
HOUR 0──────────────────────────HOUR 16───────────────HOUR 20──

Track A: [A1─A2─A3─A4 parallel]──[A5 SSE]──[A6]──[A7]
                                                           ↘
Track B: [B1 Live conn]──[B2 video]──[B3 audio]──[B4 fn]──[integrate]
                                                           ↗
Track C: [C1]──[C2 /api/annotate]──[C3 UI]
                                                           ↗
Track D: [D1 log]──[D2 summary gen]──[D3 docs]──[D4 cal]──[D5 wire]
                                                           ↗
Track E: [E1 stubs]────────────────────────────────────[wire all]
```

**Zero dependencies between A, B, C, D at start.** All four can begin simultaneously.
**Only hard dependencies:**
- B1 needs A6's `assembleSystemPrompt` signature (agree on interface day 1, stub the content)
- E3 needs B1 to exist at a port
- E1 needs A5 to emit SSE events
- D5 needs D2 + D3 + D4 individually complete

---

## Critical Path

```
A1 (SkillModel JSON) → A6 (system prompt) → B1 (Gemini Live) → B2/B3 (video+audio) → DEMO
```

If any of these slip, the live session doesn't work. Prioritize A1 and B1 above everything else.

**Nano Banana (C2) is the highest-risk item** — test the `responseModalities: ["IMAGE"]` call first thing. If it doesn't produce clean annotations, fall back to verbal-only (Tier 3 just says the correction without showing the frame).

---

## Interface Contract (agree day 1, don't change)

These are the types all tracks share. Settle these before diverging:

```typescript
// Shared across A, B, D
interface SkillModel {
  metadata: { skill: string; goal: string; level: string; createdAt: string; illustration: string };
  teachingStrategy: { approach: string; learningStyle: string; successCriteria: string; pacingNotes: string };
  properForm: Record<string, string>;
  commonMistakes: Array<{ issue: string; severity: "high"|"medium"|"low"; correction: string; videoReference?: { url: string; timestamp: string } }>;
  progressionOrder: string[];
  safetyConsiderations: string[];
  videoReferences: Array<{ url: string; title: string; bestMoments: Array<{ timestamp: string; description: string; useCase: string }> }>;
  sessionPlan: { primaryFocus: string; secondaryFocus: string; warmupActivity: string; keyCheckpoints: string[]; successIndicators: string[] };
  webSources: Array<{ title: string; url: string }>;
}

// WS message types (browser ↔ server)
type WSMessageToServer =
  | { type: "session_start"; skillModelJson: string; userModelJson?: string }
  | { type: "video_frame"; frameBase64: string; mimeType: "image/jpeg" }
  | { type: "audio_chunk"; audioBase64: string }
  | { type: "session_end" };

type WSMessageToClient =
  | { type: "audio"; audioBase64: string }
  | { type: "log_entry"; tier: 1|2|3|4; message: string }
  | { type: "annotation"; imageUrl: string }
  | { type: "tutorial_ref"; url: string; timestamp: string; reason: string }
  | { type: "session_ready" }
  | { type: "error"; message: string };
```

---

## Demo Safety Net

| Feature | Built | Fallback if broken |
|---|---|---|
| Research pipeline | Full 9-step | `GLITCH_USE_DEMO_DOC=true` → returns `cooking-skill-demo.json` |
| Gemini Live audio | Real | Pre-recorded audio clips triggered by UI buttons |
| Nano Banana annotation | Real | Coach says "Let me describe what I see" — verbal Tier 3 |
| Google Docs write | Real | Show raw JSON in a styled code block in the UI |
| Google Calendar | Real | Show "Next session: [date]" text without creating event |
| Returning user | Pre-seeded | `data/cooking-skill-demo.json` has 5-session history pre-loaded |
