# Phase 1: Foundation + Research Pipeline - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning
**Source:** Generated from PROJECT.md, ROADMAP.md, REQUIREMENTS.md

<domain>
## Phase Boundary

Phase 1 delivers the project scaffold and the full research pipeline end-to-end:
- User types a skill name in a UI → research pipeline runs → structured skill document appears in Google Docs.
- This is the foundation everything downstream depends on. The skill doc is injected into the Gemini Live system prompt in Phase 2, so it must exist and be well-structured before Phase 2 begins.
- Highest-risk prompt engineering work is here — invest in the synthesis prompt now.

</domain>

<decisions>
## Implementation Decisions

### Project Scaffold
- Next.js 14 with App Router, TypeScript, Tailwind CSS — locked decision, no alternatives
- Node.js `ws` WebSocket server scaffolded in `/server` — not yet wired to Gemini Live (that's Phase 2), but the server skeleton must exist so Person B can pick it up
- `concurrently` to run Next.js + WS server together in dev: `"dev": "concurrently \"next dev\" \"tsx server/index.ts\""`
- Service account auth only — no OAuth redirect flow (eliminates ~3 hours of setup)
- Init command: `npx create-next-app@14 . --typescript --tailwind --eslint --app --src-dir`

### Authentication
- Google service account credentials configured and available to both Next.js API routes and the WS server
- Service account needs access to: Gemini API, YouTube Data API v3, Google Docs API, Google Drive API
- Credentials loaded via env vars / `.env.local` — never committed

### Research Pipeline (Three-Step Gemini Flow)
- **Step 1 (Discovery):** Gemini `gemini-2.5-flash` with `googleSearch` grounding tool — finds relevant YouTube tutorials for the skill
- **Step 2 (Analysis):** Second Gemini call with YouTube video URLs passed as `fileData.fileUri` — Gemini reads the videos directly, no download needed for public videos
- **Step 3 (Synthesis):** Third Gemini call produces the structured skill document as JSON or Markdown with explicit output schema
- Model: `gemini-2.5-flash` (NOT `gemini-2.0-flash` — deprecated March 2026)
- SDK: `@google/genai` v1.46.0 (replaces `@google/generative-ai`)
- YouTube Data API v3 (`search.list`) as supplement to grounding for structured metadata (duration, channelId, viewCount)

### Skill Document Structure (output of synthesis step, RES-04)
- Proper form descriptions
- Ranked common mistakes
- Progression steps
- YouTube video timestamps for key moments
- This structure is the contract that Phase 2's system prompt injection will depend on — define it clearly and document the schema

### Skill Document Delivery (RES-05)
- Written to Google Docs via `googleapis` Docs API (`documents.create` + `documents.batchUpdate`)
- Service account auth handled by `googleapis` + `google-auth-library`

### Skill Selection UI (UI-01)
- Simple Next.js App Router page: text input for skill name + trigger button + status display
- Status display shows research pipeline progress (polling or streaming)
- No authentication UI — service account handles everything server-side

### Demo Fallback
- Pre-computed cooking (knife skills) skill doc committed to repo as fallback
- Used if live research is slow or fails during demo
- Cooking chosen because 1 FPS is sufficient for slower movements

### Claude's Discretion
- API route structure within Next.js App Router (e.g., `/api/research/route.ts`)
- Exact shape of status/progress updates to the UI (polling vs SSE)
- Error handling and retry logic for Gemini calls
- How the pre-computed doc is served as fallback (env flag, hardcoded path, etc.)
- File organization within `/server` skeleton

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Architecture & Decisions
- `.planning/PROJECT.md` — full system architecture, constraints, key decisions table, out-of-scope list
- `.planning/ROADMAP.md` — phase breakdown, execution order, team assignments, risk flags

### Phase 1 Research
- `.planning/phases/01-foundation-research-pipeline/01-RESEARCH.md` — verified library versions, Gemini API patterns, installation commands, architecture rationale
- `.planning/phases/01-foundation-research-pipeline/01-UI-SPEC.md` — UI design contract for the skill selection screen (UI-01)

### Requirements
- `.planning/REQUIREMENTS.md` — full requirement list; Phase 1 covers RES-01–RES-05, UI-01

</canonical_refs>

<specifics>
## Specific Ideas

- **Team split for Phase 1:** Person A owns the research pipeline (Gemini + Docs write); Person C owns the project scaffold and skill selection UI. Plans should be separable along this split.
- **Risk flag from ROADMAP:** "Research phase produces shallow skill doc" — mitigate by investing in the synthesis prompt structure (Step 3 of the pipeline). The prompt needs an explicit output schema.
- **Risk flag from ROADMAP:** "YouTube URL feature (preview) has quirks" — test Gemini's `fileData.fileUri` with YouTube URLs early; fallback to Gemini training data if URL analysis fails.
- **Execution timing:** Phase 1 starts at Hour 0 and must be far enough along by Hour 2 that Phase 2 can begin. The scaffold and research pipeline are the critical path.

</specifics>

<deferred>
## Deferred Ideas

- WebSocket server connection to Gemini Live — scaffold only in Phase 1, full wiring is Phase 2
- Annotated frame generation testing — ROADMAP notes this as a Phase 1 warmup item but it's not a Phase 1 deliverable
- Multi-user features, OAuth — explicitly out of scope for the hackathon

</deferred>

---

*Phase: 01-foundation-research-pipeline*
*Context gathered: 2026-03-27 via PROJECT.md synthesis*
