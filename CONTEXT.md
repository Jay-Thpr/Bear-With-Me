# Project Context

## What This Project Is

This repository is an in-progress build of an AI coaching product that helps a learner practice a skill with live feedback, persistent progress tracking, and AI-generated supporting materials.

The current branch implements a hackathon-oriented version of that idea:

- FastAPI backend
- Vite + React frontend
- Shared public skill pool instead of per-user accounts
- Gemini-powered research generation
- Gemini Live realtime coaching
- Gemini image-based annotated form correction
- Persistent skill/progress/session-summary storage in SQLite by default

The implementation is already opinionated around a specific product direction: a generalized coaching engine that can research a skill, guide a live practice session, and remember what has happened across sessions.

## Origin And Product Thesis

The broader concept came from ideation for the UCLA Glitch x DeepMind "Build With Gemini" hackathon.

The important constraints and motivations from that ideation:

- Gemini media capabilities must be central, not decorative.
- Google ecosystem integration should be meaningful, not a bolt-on.
- The product should feel like a real system direction, not a thin chat wrapper.
- The strongest target outcome is helping people understand and improve at complex activities.

The idea that emerged was a real-time self-training coach that could work across domains such as:

- cooking
- basketball / movement
- coding
- music
- other practice-heavy skills

The core thesis is:

1. The system researches a skill first instead of pretending to already know everything.
2. It then coaches the learner live using that synthesized knowledge plus current camera/mic input.
3. It escalates feedback intelligently, using voice for fast corrections and annotated visuals when words are not enough.
4. It persists what happened so future sessions become more personalized.

The pitch-level framing is not "AI tutor for one vertical." It is "a coaching engine that can teach itself a new skill domain, then coach a learner through practice."

## Why This Direction Matters

The intended differentiators from generic AI wrappers are:

- Research-first coaching rather than static hardcoded expertise
- Realtime multimodal observation rather than text-only advice
- Annotated corrections on the learner's own frame rather than generic tutorials
- Persistent progression across sessions instead of stateless chats
- Integration with user workflows and artifacts rather than isolated conversations

The ideation process identified the most defensible "magic moment" as:

- taking a frame from the learner's live session
- generating a corrected visual or markup directly on that frame
- showing exactly what to change in the learner's own body/tool/posture context

That is the clearest example of something stronger than "watch a tutorial" or "ask a chatbot."

## Product Vision vs Current Branch

There is a difference between the full product vision and what this branch currently implements.

### Full vision from ideation

- skill research using Gemini plus grounded external sources
- tutorial discovery from YouTube before any generated tutorial content
- multi-tier intervention logic
- user model + skill model carried across sessions
- structured session summaries with evidence
- Google Docs / Calendar / Drive loop
- generalizable coaching across many skill types

### What this branch concretely implements

- creation of a skill with a Gemini-generated research dossier
- storage of that dossier in the backend database
- assembly of a live coaching system instruction from research + recent progress
- browser-based live coaching session using Gemini Live
- manual and tool-triggered annotated still generation via Gemini image model
- post-session persistence of progress stats and session summaries
- optional Google Docs export attempt for session summaries
- shared skill pool model with no auth gate

### What is scaffolded or implied but not fully realized

- rich tiered intervention policy with explicit escalation memory
- robust user disagreement handling
- deep per-user personalization model beyond simple stored progress
- full Google Workspace loop in the frontend
- YouTube tutorial analysis pipeline
- Google Search-grounded research ingestion
- generated tutorial fallback with Veo

This means the current codebase should be understood as a strong prototype of the coaching engine, not the full original concept.

## Current User Experience

From the frontend currently on this branch, the user flow is approximately:

1. Open the home page and enter the app.
2. Pick a skill from the shared skill board or create a new one.
3. On onboarding, submit:
   - skill title
   - next-session goal
   - starting level
   - optional category preset
4. Backend generates a research dossier with Gemini and saves the skill.
5. User lands on a dashboard showing journey/progression for the selected skill.
6. User starts a live session with camera + mic.
7. Frontend requests an ephemeral Live token from the backend.
8. Backend builds a system instruction from:
   - base coach rules
   - stored skill metadata
   - latest research row
   - recent summaries
   - recent progress events
9. Gemini Live provides realtime voice guidance.
10. User or model can trigger annotated form correction.
11. Ending the session persists progress, summary, and updated stats.
12. User sees a level-up / post-session state.

## Domain Focus For Demo Purposes

The original ideation identified cooking, especially knife skills, as a strong demo domain because:

- the movements are visible
- corrections are spatial
- 1 FPS-style visual updates are still usable
- the activity is easy for judges to understand
- annotated stills are compelling in this context

The code reflects this implicitly:

- onboarding defaults to "Knife skills"
- default goal references dicing vegetables evenly and safely
- dashboard content and visual language currently skew toward cooking examples

Even though the pitch is generalized, the current product feel is best described as "general coaching engine demoed through cooking."

## Architecture Overview

### Frontend

Stack:

- React
- TypeScript
- Vite
- React Router

Main route structure in `frontend/src/App.tsx`:

- `/`
- `/select-skill`
- `/onboarding`
- `/dashboard`
- `/session`
- `/level-up`

Important frontend concepts:

- The active skill is carried through route state and session storage.
- The dashboard reflects backend stats for a selected skill.
- The session page manages:
  - camera/mic lifecycle
  - Gemini Live connection
  - realtime captions
  - manual form-correction capture
  - session duration tracking
  - backend session completion call

### Backend

Stack:

- FastAPI
- SQLModel / SQLAlchemy
- SQLite by default
- Gemini API integrations

Backend entrypoint:

- `backend/app/main.py`

Routers currently mounted:

- health
- auth
- skills
- sessions
- research
- live
- annotations
- characters

The app uses startup DB initialization and permissive CORS for local development / hackathon usage.

## Data Model

The database models in `backend/app/db_models.py` define the actual persistent memory of the product.

### Skill

Represents the main entity being practiced.

Key fields:

- `id`
- `user_sub`
- `title`
- `notes`
- `context`
- `stats_sessions`
- `stats_practice_seconds`
- `stats_level`
- `stats_progress_percent`
- `stats_mastered`
- `stats_day_streak`
- `last_practice_at`
- timestamps

Important note:

- The current branch uses a shared pool model rather than per-user isolation.
- `user_sub` is still present structurally, but the backend treats skills as public/shared.

### SkillResearch

Stores versioned research dossiers for a skill.

This is the concrete implementation of the "system researches the skill first" idea.

Key value:

- the system can persist domain understanding separately from the live session itself

### SkillProgressEvent

Append-only event log for milestones, sessions, notes, and level-like progression.

This is the backbone for:

- longitudinal memory
- recent signals injected into coaching context
- future timeline visualizations

### SkillSessionSummary

Stores structured post-session results separately from generic progress events.

This is important because it gives the product a more durable narrative memory of each practice session.

## Shared Skill Pool Model

This branch intentionally removed a sign-in gate for hackathon simplicity.

Practical implications:

- everyone sees the same skill catalog
- anyone can create/update/delete by id
- the system behaves like a public demo board, not a private coaching account

This is useful for speed and demos, but it also means:

- progression is not actually per-user in the product sense
- skill memory is tied to the shared skill record
- privacy and ownership are not solved

When reasoning about future architecture, this should be treated as a hackathon-mode shortcut, not a finished product decision.

## Research Layer

The research system is implemented in `backend/app/services/skill_research_gemini.py`.

### What it currently does

- Uses Gemini text generation to create a structured markdown dossier.
- Requests sections such as:
  - overview
  - core concepts
  - skill decomposition
  - milestones
  - practice design
  - common mistakes
  - resources
  - safety / ethics
- Stores the output in `SkillResearch`.

### Why this matters

This is the strongest architectural bridge from the original ideation into actual code.

It creates a skill-specific knowledge artifact that can be:

- shown
- stored
- versioned
- summarized
- reused in future sessions

### Important limitation

The current implementation does not yet do the full research vision from ideation.

It does not currently:

- explicitly use Google Search grounding
- ingest YouTube URLs and analyze actual tutorial videos
- build a deeply structured skill model with provenance from external sources

So today it is best understood as "Gemini-generated research dossier" rather than "fully grounded research pipeline."

## Live Coaching Context Assembly

One of the most important backend services is `backend/app/services/live_context.py`.

This service turns stored app state into a system instruction for Gemini Live.

### What goes into the live context

- base coach behavior
- skill title / goal / level / category
- current stats
- latest research digest
- recent session summaries
- recent progress events

### Why this is important

This is the current implementation of the "context injection over fine-tuning" decision from ideation.

Instead of training a specialized model, the app:

1. stores domain and practice information in the database
2. compresses it into prompt context
3. injects it into the live session at connect time

That design preserves:

- generalizability
- debuggability
- transparency
- branch-local iteration speed

### Coach behavior encoded in the base prompt

The live system prompt already encodes a few critical product choices:

- feedback should be concise and specific
- the coach is allowed to request form-correction stills
- when the tool is used, drawable coaching suggestions must be explicit
- annotated stills are rate-limited and should not be spammed

This is a lightweight but meaningful embodiment of the intervention-tier concept.

## Live Session Flow

The live session experience is primarily implemented in:

- `frontend/src/pages/SessionPage.tsx`
- `frontend/src/hooks/useGeminiLiveSession.ts`
- backend live token + context endpoints

### Browser-side responsibilities

- start and stop camera/mic
- stream PCM audio
- periodically stream video frames to Gemini Live
- display model captions and user transcript snippets
- allow manual "capture & annotate"
- preserve elapsed session duration
- end session and persist backend results

### Backend responsibilities

- mint ephemeral Live tokens
- choose the configured Live model
- specialize the system instruction to the selected skill

### Important implementation details

- If no skill id is available, the backend falls back to a generic coach prompt.
- The frontend persists active skill identifiers in session storage.
- The session end flow computes duration using both tick count and wall-clock fallback.
- Session notes are assembled from the latest user/model captions.

## Annotated Form Correction

This is one of the most product-critical features on the branch.

Implemented in:

- `backend/app/routers/annotations.py`
- `backend/app/services/form_annotation.py`
- `frontend/src/hooks/useGeminiLiveSession.ts`

### Current behavior

- capture the current video frame from the frontend
- send it to the backend as base64 JPEG
- backend calls the Gemini image model
- backend asks the model to visualize corrected form, not just draw symbols
- frontend displays the returned image and short notes

### Why this feature matters

This is the clearest expression of the original ideation's "sleeper hit":

- the system works directly on the learner's own frame
- visual correction is used for spatial/form issues that words handle poorly
- it feels meaningfully different from a generic voice assistant

### Product nuance already encoded in prompts

The image prompt tries to avoid low-value markup by preferring:

- corrected pose visualization
- ghosted target outlines
- directionality only when useful
- alignment with the coach's existing verbal suggestion

That is an important product decision. The system is trying to create a teaching artifact, not just graffiti on top of a frame.

### Operational constraints

- one successful annotation every 30 seconds
- overlapping requests are blocked
- large image payloads are rejected

This rate limiting exists both for UX control and likely cost / latency control.

## Session Completion And Progression

The progression logic is implemented in `backend/app/routers/skills.py` and `backend/app/services/session_progress_gemini.py`.

### What happens when a session ends

1. The backend evaluates the session.
2. Gemini estimates:
   - `progress_delta`
   - `mastered_delta`
   - `coach_note`
3. Skill aggregate stats are updated.
4. Progress percent may roll over into one or more level-ups.
5. Day streak is updated based on `last_practice_at`.
6. A `session` progress event is appended.
7. A `SkillSessionSummary` row is created.
8. Optional Docs export is attempted.

### Why this matters

This is the first practical implementation of a persistent user progression model, even if the current shared-pool hackathon structure means it is not truly per-user.

### Current limitations

The evaluation is still relatively simple compared to the full ideation:

- progress is estimated from session metadata and notes, not a deeply structured user model
- escalation history is not yet a first-class concept
- the system does not explicitly track recurring mistakes or accepted/rejected corrections over time

Still, the code already has the right shape for those future additions.

## Google Workspace Positioning

Google Workspace integration was a central part of the original hackathon concept.

### What the idea wanted

- Docs for summaries and progression artifacts
- Calendar for practice planning and reminders
- Drive or Photos-like artifact persistence

### What this branch currently appears to support

- session summary export to Google Docs is attempted in the backend
- auth/router scaffolding exists

### What is not yet central in the visible product flow

- Calendar creation from the frontend journey loop
- strong Docs-centric UX in the frontend
- Drive/Photos artifact browsing

So Workspace is present in concept and partially in backend service shape, but it is not yet the dominant user-facing loop on this branch.

## Character / Avatar Layer

The repo also includes character generation and mascot-related UI.

Implemented elements include:

- `/api/characters/generate`
- background removal flow
- character visuals in the skill-selection experience
- bear mascot assets

This appears to serve two purposes:

1. give the app a stronger hackathon-demo personality
2. create a more game-like or coach-avatar feel

This is secondary to the core coaching engine, but it is part of the product presentation layer.

## Frontend Product Shape

### Skill selection

The skill-select screen is not a plain form list. It presents:

- preset skill rings
- category inference from stored skill metadata
- title/notes fallback inference when category is missing
- drag/drop interaction centered on a bear character

This is more theatrical than utilitarian. It is clearly optimized for demo presence.

### Dashboard

The dashboard presents the learner journey as:

- level
- streak
- total practice time
- mastered count
- progress bar
- stylized upcoming content / journey framing

The data model underneath is real, but some visible content is still partially illustrative or hardcoded.

### Session page

The session page is the most functionally central screen. It combines:

- live camera preview
- live coach captions
- session timer
- realtime control state
- manual annotated still capture
- side panels for focus and progress framing

This page is the main product demo surface.

## Current Technical Constraints

These constraints matter for both implementation decisions and demo strategy.

### Gemini Live realities

From the original research and the current design assumptions:

- Live works well for conversational realtime guidance
- video interpretation is limited compared to dense motion analysis
- some domains are much better fits than others

This reinforces the product choice to demo with slower, visually legible tasks such as cooking.

### Annotation latency

Annotated still generation is not instantaneous.

That means it should be treated as:

- a deliberate escalation
- a momentary teaching artifact
- not a frame-by-frame correction loop

### Shared-state hackathon architecture

The lack of per-user isolation simplifies development, but it weakens the meaning of "my progress" and "my coach memory."

### Prompt-context budget

Live context assembly enforces explicit truncation thresholds.

That means future improvements need to think carefully about:

- what long-term memory deserves prompt budget
- what should be summarized vs stored raw
- which facts are essential for live coaching quality

## Key Product Decisions Already Encoded In Code

Even where the code is incomplete relative to the vision, several important product decisions are already visible and should be preserved intentionally unless there is a clear reason to change them.

### 1. Research before coaching

The product is not just "open live session and improvise."

It creates a knowledge artifact first.

### 2. Context injection over training

The system prompt is dynamically built from skill and progress state.

### 3. Visual correction is special, not constant

Annotations are rate-limited and framed as an escalation tool.

### 4. Session completion is meaningful

A session ending is not just analytics; it mutates progression state and creates memory.

### 5. Demoability matters

Several UI and flow decisions are clearly optimized for judge comprehension and visual punch.

## Gaps Between Vision And Implementation

These are the biggest gaps a future contributor should keep in mind.

### Grounded research is not yet truly grounded

The original concept emphasized:

- Google Search grounding
- YouTube tutorial analysis
- sourced skill synthesis

Current code generates a dossier, but not the full source-backed research engine.

### Multi-session intelligence is still shallow

The ideation imagined:

- session 1 generic coach
- session 5 personalized coach that knows recurring tendencies

Current code stores progress and summaries, but not a rich longitudinal learner model.

### Intervention tiers are implicit, not orchestrated

The concept included a strong tiered escalation framework.

Current implementation has pieces of it:

- voice coaching
- annotation tool
- stored context

But not a formal escalation engine with explicit thresholds and state transitions.

### Workspace loop is underexposed

Docs export exists in spirit and partly in code, but the frontend product experience does not yet fully revolve around Workspace artifacts.

### Generalization is more narrative than proven

The app is designed to be cross-domain, but the current UX and defaults still lean heavily toward cooking.

## What Future Work Should Preserve

If this project continues on this branch or evolves further, these are the highest-value invariants to preserve.

- The product should remain a coaching engine, not collapse into a generic chatbot.
- Research-generated skill context should stay first-class.
- Annotated still correction should remain a signature feature.
- Persistent progression should remain central to the system's value.
- The app should keep a clear distinction between:
  - domain knowledge
  - learner history
  - realtime interaction

## What Future Work Should Probably Add

The most leverage-rich next layers would likely be:

- stronger grounded research with source provenance
- explicit intervention-tier state machine
- richer learner model extracted from summaries/events
- better proof of cross-domain generalization
- clearer Workspace-centered loop
- more transparent display of what the system learned and why it gave a correction

## Working Mental Model For This Branch

The best concise mental model for the current branch is:

"A hackathon-mode generalized skill coaching prototype that creates a Gemini-generated research dossier for a shared skill, injects that dossier plus recent progress into a Gemini Live coaching session, uses Gemini image generation to create annotated visual corrections from the learner's own frame, and persists session progression over time."

That is the most accurate high-level description of what is both intended and actually implemented.

## Files Most Important For Orientation

### Backend

- `backend/app/main.py`
- `backend/app/config.py`
- `backend/app/db_models.py`
- `backend/app/routers/skills.py`
- `backend/app/routers/live.py`
- `backend/app/routers/annotations.py`
- `backend/app/services/skill_research_gemini.py`
- `backend/app/services/live_context.py`
- `backend/app/services/session_progress_gemini.py`
- `backend/app/services/form_annotation.py`

### Frontend

- `frontend/src/App.tsx`
- `frontend/src/api/skills.ts`
- `frontend/src/pages/SkillSelectPage.tsx`
- `frontend/src/pages/OnboardingPage.tsx`
- `frontend/src/pages/DashboardPage.tsx`
- `frontend/src/pages/SessionPage.tsx`
- `frontend/src/hooks/useGeminiLiveSession.ts`
- `frontend/src/live/geminiLiveClient.ts`

## Summary

This repo is not just a collection of Gemini demos. It is the beginning of a coherent product architecture:

- research
- realtime coaching
- visual correction
- persisted progression

The current branch is best viewed as a working prototype of that architecture, optimized for hackathon speed and demo clarity, with several of the deepest original ideas already visible in code even where the full vision is not yet complete.
