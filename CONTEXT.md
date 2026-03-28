# Skill Quest — Project Context

Last updated: 2026-03-28

---

## What This App Is

**Skill Quest** is an AI-powered skill coaching app. The user picks a skill, the app researches it deeply using Gemini + Google Search grounding + YouTube, then coaches the user live via camera and microphone using Gemini Live.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Auth | NextAuth.js v4 — Google OAuth |
| AI — Research | Gemini 1.5 Pro (grounding + YouTube data) |
| AI — Live coaching | Gemini Live (WebSocket, real-time audio/video) |
| Workspace | Google Docs + Drive API (research notes written live) |
| Styling | Tailwind CSS + custom CSS design system |
| Fonts | Press Start 2P (pixel), Outfit (UI) |

---

## Page Flow

```
/ (HomePage)
  └─ /onboarding          ← skill + goal + level form; Google sign-in gate on submit
       └─ /research-loading  ← SSE stream from research pipeline; shows live progress
            └─ /dashboard    ← PixelAvatar + XP bar + skill model goal + "Start live session"
                 └─ /session ← full Gemini Live coaching (camera + mic + tiered interventions)
```

---

## Route Groups

```
src/app/
  (nav)/               ← pages with "Skill Quest" header nav
    layout.tsx         ← nav shell: brand, links, sign-in button
    page.tsx           ← HomePage
    onboarding/        ← OnboardingPage
    dashboard/         ← DashboardPage
  (fullscreen)/        ← no nav, no padding, full viewport
    layout.tsx         ← passthrough
    session/           ← SessionPage (Gemini Live)
  research-loading/    ← root level (no nav, uses flex-1 on body)
  api/
    health/            ← GET → {status: "ok"} (homepage pill)
    research/          ← POST, SSE stream — runs research pipeline
    live/ephemeral-token  ← POST — mints Gemini Live access token
    annotate/          ← POST — generates annotated frame via Gemini Vision
    session/log        ← POST — logs coaching events during session
    auth/              ← NextAuth Google OAuth
```

---

## Research Pipeline (`lib/research.ts`)

The core of the app. Called by `src/app/api/research/route.ts` as an SSE stream.

**Flow:**
1. `conductStructuredWebResearch` — 5 focus passes via Gemini grounding model → returns `WebFinding[]` + `ResearchSource[]`
2. `conductVideoResearch` — YouTube API → returns `VideoFinding[]`
3. `synthesizeResearchModel` — Gemini 1.5 Pro synthesizes all findings into a `SkillResearchModel` JSON
4. `enforceResearchDepth` — hydrates model with raw evidence, builds `harvestedWebSources`
5. `repairResearchModelIfNeeded` — fires repair LLM calls for sections below quality gates (7 checks)
6. Google Docs write — research doc created in user's Drive; URL streamed back
7. System prompt generation — injected into `sessionStorage` for Gemini Live to use

**Key fix (done):** `webSources[].summary` was always `""`. Fixed by threading `ResearchSource[]` from `conductStructuredWebResearch` through `synthesizeResearchModel` → `repairResearchModelIfNeeded` → `enforceResearchDepth`, then building a `sourceSummaryMap` to populate summaries.

**Known issues (tracked in RESEARCH_PROGRESS.md):**
- Domain bleed: generic queries can pull off-domain results (e.g., soccer juggling for hand juggling)
- Per-pass identical summaries: all sources from same grounding pass share one summary text

---

## Gemini Live (`src/app/(fullscreen)/session/page.tsx`)

Full-screen session page. Connects to Gemini Live on mount via ephemeral token from `/api/live/ephemeral-token`.

**Three tool functions Gemini can call:**
| Tool | Tier | Effect |
|---|---|---|
| `log_observation` | 1–4 | Logs to session feed, posts to `/api/session/log` |
| `generate_annotation` | 3 | Captures video frame, sends to `/api/annotate`, shows side-by-side |
| `show_tutorial` | 4 | Shows YouTube reference in coach panel |

**Media:**
- Camera: `getUserMedia({ video })` → `videoRef`, 1 FPS JPEG frames sent to Gemini
- Mic: `MicPcmStreamer` → PCM chunks base64'd to Gemini
- Playback: `PcmPlaybackScheduler` → Gemini audio output → speaker

**Helpers** (`lib/live/`):
- `geminiLiveClient.ts` — WebSocket wrapper
- `micPcmStreamer.ts` — mic → PCM stream
- `pcmPlayback.ts` — PCM → AudioContext playback scheduler
- `pcmUtils.ts` — base64 ↔ Float32 PCM conversion

---

## Design System

All in `src/app/globals.css` alongside Tailwind.

**CSS variables:**
```
--bg: #0c0f14          dark background
--bg-elevated: #141a22  card/panel background
--accent: #38bdf8       sky blue
--accent-bright: #7dd3fc
--text: #c4cdd8
--text-strong: #f1f5f9
--text-muted: #8b97a8
--border-strong: #2a3444
--font-pixel: 'Press Start 2P'
--font-ui: 'Outfit'
```

**Utility classes:** `.btn`, `.btn--primary`, `.btn--ghost`, `.panel`, `.page`, `.page__title`, `.form-card`, `.field`, `.chip`, `.xp-bar`, `.pixel-avatar`, `.layout`, `.api-pill`

**PixelAvatar:** CSS-only 8-bit character, 5 tier palettes (gray → gold). Lives in `src/components/PixelAvatar.tsx`, styled via `.pixel-avatar--tier-{1-5}` CSS vars.

---

## Auth

Google OAuth via NextAuth. Required for research (writes to user's Google Drive). Gate is in `/onboarding` — form is always visible, sign-in is triggered on submit if not authenticated. Callback returns user to `/onboarding` with form params preserved.

`src/components/AuthProvider.tsx` wraps the app. `src/components/Header.tsx` still exists but is no longer used (replaced by `(nav)/layout.tsx`).

---

## SessionStorage Keys

| Key | Set by | Read by |
|---|---|---|
| `researchIntake` | `/onboarding` | `research-loading` |
| `skillModelJson` | `research-loading` (on `done` event) | `dashboard`, `session` |
| `systemPrompt` | `research-loading` (on `done` event) | `session` |
| `researchWorkspace` | `research-loading` (on `workspace` event) | `dashboard` |
| `illustrationUrl` | `research-loading` (on `illustration` event) | unused currently |
| `docId` | `research-loading` (on `done` event) | unused currently |

---

## Dead Pages (unlinked, not deleted)

- `src/app/live-coaching/` — replaced by `(fullscreen)/session/`
- `src/app/session-briefing/` — replaced by `(nav)/dashboard/`
- `src/app/skill-selection/` — unused
- `src/app/session-prep/` — unused
- `src/app/google-test/` — dev test page
- `src/app/post-session-report/` — end-of-session report (still wired from session end)

---

## What Still Needs Building

See `RESEARCH_PROGRESS.md` for research pipeline todos.

- **Domain bleed fix** — focus pass queries need skill-specific context to avoid off-domain grounding results
- **Real XP system** — `dashboard` shows static 8% XP; needs persistence
- **Post-session report** — exists as a page but needs real data from session log
- **Backend (Python FastAPI)** — scaffolded in `backend/` from `new_start_zlb` branch; dormant until Gemini Live needs a separate service
