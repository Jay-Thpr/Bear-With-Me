# Current System Reference

## Purpose

This document captures the current Glitch system as implemented in the repo.

Use it as a future reference for:

- product flow
- technical architecture
- research pipeline behavior
- Google Workspace integration
- live coaching integration
- storage structure

This is meant to describe the current working system, not the original high-level concept only.

---

## Project Summary

Glitch is a research-first AI coaching system.

The current implementation supports:

1. intake of what the user wants to learn, skill level, and time constraint
2. learner-profile parsing with Gemini
3. bounded web and YouTube research
4. synthesis into a structured coaching model
5. saving research output into Google Docs and Drive
6. live coaching through Gemini Live
7. post-session summary and Calendar scheduling

---

## Current Tech Stack

### Frontend

- Next.js 14 App Router
- React 18
- TypeScript
- Tailwind CSS
- Framer Motion

### Realtime / Live Session

- Gemini Live API
- browser-direct websocket connection to Gemini Live via ephemeral token
- custom browser audio/video utilities in `src/lib/live/`

### Backend / Server

- Next.js route handlers
- Node runtime for research and token routes
- legacy `ws` server still exists in `server/` but is no longer the active browser path

### Google / Workspace

- NextAuth with Google OAuth
- Google Docs API
- Google Drive API
- Google Calendar API
- optional YouTube Data API fallback

### AI / Research

- `@google/genai`
- Gemini 2.5 Flash for parsing, research, and synthesis
- Gemini image model for annotation and skill illustration

---

## Current High-Level User Flow

### 1. Sign-In Gate and Landing Page

Route:

- `/`

Behavior:

- If the user is signed out, `/` shows a dedicated Google sign-in screen.
- If the user is signed in, `/` becomes the primary structured intake surface.
- The signed-in experience is a fixed three-field form.
- The user provides:
  - what they want to learn
  - their skill level
  - their time constraint to learn
- Submitting the form stores the intake in `sessionStorage` and routes into the research-loading flow.

Primary file:

- [page.tsx](/Users/jt/Desktop/Glitch/src/app/page.tsx)

---

### 2. Research Intake

The frontend stores research intake in `sessionStorage` under:

- `researchIntake`

The intake currently includes:

- `skill`
- `goal`
- `level`
- `constraints`

Canonical input type:

- [research-types.ts](/Users/jt/Desktop/Glitch/lib/research-types.ts)

---

### 3. Research Pipeline

The frontend sends intake to:

- `POST /api/research`

The research route performs:

1. Google Drive / Docs workspace initialization in parallel with learner-profile parsing
2. learner-profile parsing
3. research brief creation
4. illustration generation
5. web research
6. YouTube discovery and bounded video analysis
7. synthesis into `SkillResearchModel`
8. mapping into the legacy `SkillModel` used by live coaching
9. final Google Workspace writes

Relevant files:

- [route.ts](/Users/jt/Desktop/Glitch/src/app/api/research/route.ts)
- [research.ts](/Users/jt/Desktop/Glitch/lib/research.ts)
- [research-types.ts](/Users/jt/Desktop/Glitch/lib/research-types.ts)

---

### 4. Research Output

The route returns:

- `researchModel`
- `skillModel`
- `skillModelJson`
- `systemPrompt`
- `docUrl`
- `progressDocUrl`
- `rootFolderUrl`

The frontend stores:

- `skillModelJson`
- `systemPrompt`
- `docId`
- `illustrationUrl`

Then it transitions into:

- `/session-briefing?skill=...`

---

### 5. Session Briefing

Route:

- `/session-briefing`

Behavior:

- Reads `skillModelJson` from `sessionStorage`
- Displays session goal / focus
- Starts live session

Primary file:

- [page.tsx](/Users/jt/Desktop/Glitch/src/app/session-briefing/page.tsx)

---

### 7. Live Coaching

Route:

- `/live-coaching`

Behavior:

1. Requests ephemeral Gemini Live token from:
   - `/api/live/ephemeral-token`
2. Connects browser directly to Gemini Live
3. Streams:
   - 1 FPS JPEG frames
   - 16kHz mic PCM
4. Receives:
   - 24kHz audio output
   - tool calls

Tool calls currently supported:

- `log_observation`
- `generate_annotation`
- `show_tutorial`

Primary files:

- [page.tsx](/Users/jt/Desktop/Glitch/src/app/live-coaching/page.tsx)
- [geminiLiveClient.ts](/Users/jt/Desktop/Glitch/src/lib/live/geminiLiveClient.ts)
- [micPcmStreamer.ts](/Users/jt/Desktop/Glitch/src/lib/live/micPcmStreamer.ts)
- [pcmPlayback.ts](/Users/jt/Desktop/Glitch/src/lib/live/pcmPlayback.ts)
- [route.ts](/Users/jt/Desktop/Glitch/src/app/api/live/ephemeral-token/route.ts)

Important architecture note:

- The browser does not currently use `server/index.ts` for live coaching.
- The browser connects directly to Gemini Live.
- The `server/` websocket bridge is legacy/fallback code.

---

### 8. Annotation

Annotation is handled through:

- `POST /api/annotate`

Behavior:

1. frontend captures current frame
2. sends frame + correction info to route
3. route calls Gemini image generation
4. returns annotated image
5. live coaching UI displays it

Primary file:

- [route.ts](/Users/jt/Desktop/Glitch/src/app/api/annotate/route.ts)

---

### 9. Post-Session

Route:

- `/post-session-report`

Behavior:

1. page calls:
   - `POST /api/session/summary`
2. summary route:
   - reads session log
   - reads skill status map
   - generates Gemini summary
   - appends to Google Docs
   - creates Calendar event

Primary files:

- [page.tsx](/Users/jt/Desktop/Glitch/src/app/post-session-report/page.tsx)
- [route.ts](/Users/jt/Desktop/Glitch/src/app/api/session/summary/route.ts)
- [post-session.ts](/Users/jt/Desktop/Glitch/lib/post-session.ts)
- [google-calendar.ts](/Users/jt/Desktop/Glitch/lib/google-calendar.ts)
- [google-docs.ts](/Users/jt/Desktop/Glitch/lib/google-docs.ts)

---

## Current Google Workspace Structure

### Drive Folder Hierarchy

For research runs, the current system creates:

```text
Glitch Research - {skill-slug}/
  Research/
    {Skill} Research
  Progress/
    {Skill} Progress
```

Primary folder helper:

- [google-drive.ts](/Users/jt/Desktop/Glitch/lib/google-drive.ts)

---

### Research Doc Structure

The research doc is a single Google Doc with two tabs:

1. `Research Log`
2. `Final Research`

#### Research Log tab

Purpose:

- live run visibility
- append-only trace of research progress
- clarification visibility
- debugging and demo transparency

This tab is updated during the run.

#### Final Research tab

Purpose:

- clean canonical research output
- stable structured memory
- source of truth for later use

This tab is written from finalized structured output.

Important rule:

- Context injection should use only `Final Research`
- `Research Log` should never be injected into live coaching prompts

Primary file:

- [google-docs.ts](/Users/jt/Desktop/Glitch/lib/google-docs.ts)

---

### Progress Doc Structure

Separate Google Doc:

- `{Skill} Progress`

Purpose:

- ongoing learner progress tracking
- session-focus tracking
- future post-session updates

---

## Current Research Models

### Canonical research schema

The locked schema lives in:

- [research-types.ts](/Users/jt/Desktop/Glitch/lib/research-types.ts)

Important models include:

- `ResearchIntakeInput`
- `LearnerProfile`
- `ClarificationQuestion`
- `ClarificationAnswer`
- `ResearchBrief`
- `WebFinding`
- `VideoFinding`
- `ResearchEvidence`
- `SkillResearchModel`

### Live coaching compatibility model

The current live system still expects the older `SkillModel` shape in:

- [types.ts](/Users/jt/Desktop/Glitch/lib/types.ts)

So the backend currently performs:

- `SkillResearchModel` -> `SkillModel`

Adapter:

- [research.ts](/Users/jt/Desktop/Glitch/lib/research.ts)

---

## Current Auth Model

### OAuth

Google OAuth is handled through NextAuth.

Primary files:

- [auth-options.ts](/Users/jt/Desktop/Glitch/lib/auth-options.ts)
- [route.ts](/Users/jt/Desktop/Glitch/src/app/api/auth/[...nextauth]/route.ts)
- [getUserAuth.ts](/Users/jt/Desktop/Glitch/lib/getUserAuth.ts)

Current behavior:

- if signed in, Google Docs/Drive/Calendar use the user’s OAuth session
- if not signed in, the primary `/` route stops at a sign-in screen before allowing the main research chat flow
- helper layer may still fall back to service account where configured, but the intended user flow is now explicitly sign-in-first

### Required env vars for OAuth

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`

Redirect URI:

- `http://localhost:3000/api/auth/callback/google`

---

## Current Research Route Behavior

### SSE events emitted

The research route currently emits events including:

- `status`
- `illustration`
- `clarification_required`
- `done`
- `error`

### Current doc write behavior

Current behavior:

- initializes the Google Drive workspace early if OAuth is available
- creates the tabbed research doc early
- appends `status` messages live into `Research Log`
- writes canonical structured output into `Final Research` at the end
- creates separate progress doc at the end

Important caveat:

- the final structured coaching context still comes from the synthesized in-memory model, not by re-reading the doc during the same run

---

## Current Landing Page Behavior

The landing page is now an auth-gated conversational intake surface rather than a marketing splash.

It currently:

- shows a Google sign-in screen when signed out
- shows a chat-style intake UI when signed in
- supports natural back-and-forth intake with Gemini
- accumulates a structured intake draft behind the scenes
- switches from send-message mode to start-research mode when intake is sufficiently complete
- shows the latest research status near the composer while research is running
- shows a live step feed while the user waits
- shows clarification questions inline when the backend asks for them

Primary file:

- [page.tsx](/Users/jt/Desktop/Glitch/src/app/page.tsx)

---

## Current Limitations

### Clarification UI

- Works inline on the landing page.
- The older `research-loading` page still exists, but the main research start path is now centered on `/`.

### Context injection

- The route still builds `systemPrompt` directly from the synthesized `SkillModel`
- It does not yet re-read `Final Research` from Docs before prompt assembly
- Conceptually, `Final Research` is the canonical research output, but the in-memory model is still the direct source during the same run

### Caching

- The schema supports a cached research record
- A full persistent cache layer is not implemented yet

### Research log duplication

- `Research Log` is intentionally append-oriented and can be repetitive
- `Final Research` is meant to stay clean

---

## Current Important Files

### Research system

- [research.ts](/Users/jt/Desktop/Glitch/lib/research.ts)
- [research-types.ts](/Users/jt/Desktop/Glitch/lib/research-types.ts)
- [gemini.ts](/Users/jt/Desktop/Glitch/lib/gemini.ts)
- [route.ts](/Users/jt/Desktop/Glitch/src/app/api/research/route.ts)
- [route.ts](/Users/jt/Desktop/Glitch/src/app/api/research/intake/route.ts)
- [research-pipeline-plan.md](/Users/jt/Desktop/Glitch/research-pipeline-plan.md)

### Docs / Drive / Calendar

- [google-docs.ts](/Users/jt/Desktop/Glitch/lib/google-docs.ts)
- [google-drive.ts](/Users/jt/Desktop/Glitch/lib/google-drive.ts)
- [google-calendar.ts](/Users/jt/Desktop/Glitch/lib/google-calendar.ts)

### Auth

- [auth-options.ts](/Users/jt/Desktop/Glitch/lib/auth-options.ts)
- [getUserAuth.ts](/Users/jt/Desktop/Glitch/lib/getUserAuth.ts)
- [route.ts](/Users/jt/Desktop/Glitch/src/app/api/auth/[...nextauth]/route.ts)

### Live coaching

- [page.tsx](/Users/jt/Desktop/Glitch/src/app/live-coaching/page.tsx)
- [geminiLiveClient.ts](/Users/jt/Desktop/Glitch/src/lib/live/geminiLiveClient.ts)
- [route.ts](/Users/jt/Desktop/Glitch/src/app/api/live/ephemeral-token/route.ts)

### Google test surfaces

- [page.tsx](/Users/jt/Desktop/Glitch/src/app/google-test/page.tsx)
- [route.ts](/Users/jt/Desktop/Glitch/src/app/api/google/test/route.ts)
- [route.ts](/Users/jt/Desktop/Glitch/src/app/api/google/read-doc/route.ts)
- [route.ts](/Users/jt/Desktop/Glitch/src/app/api/google/workspace-docs/route.ts)

---

## Current Build Status

As of this reference document:

- `npm run build` passes

---

## Recommended Future Directions

1. Add persistent caching keyed by skill + goal + learner profile.
2. Re-read `Final Research` from Docs when needed for future sessions.
3. Enrich `Final Research` formatting and source grouping.
4. Add structured session updates into the progress doc.
5. Add stronger folder lookup/reuse rather than creating a fresh research root every time.
