# Glitch — Real-Time Self-Training Coach

## What This Is

An AI coaching engine that teaches itself any skill from YouTube and web resources, then coaches users through live video with voice feedback, visual frame annotations, and persistent progress tracking via Google Workspace. Built for the UCLA Glitch x DeepMind hackathon.

## Core Value

A live video coaching session where the AI watches you, gives escalating feedback (verbal → annotated frame → tutorial reference), and gets smarter about you across sessions.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can select a skill and trigger the research phase (Gemini + YouTube → skill doc in Google Docs)
- [ ] Live coaching session runs via Gemini Live — user on camera, AI gives real-time verbal feedback
- [ ] Intervention escalation logic: Tier 1 (ambient) → Tier 2 (verbal) → Tier 3 (annotated frame) → Tier 4 (tutorial)
- [ ] Annotated frames generated via Gemini image generation on live video stills
- [ ] Post-session summary written to Google Docs with annotated frames and next-session focus
- [ ] Next practice session scheduled in Google Calendar
- [ ] Assets (frames, notes, tutorial links) saved to Google Drive
- [ ] Two-tier context model: skill model (stable) + user model (evolving) injected into every session
- [ ] Pre-seeded returning user demo asset (5 sessions of history) with progression timeline
- [ ] Phase 4 stretch: between-session notifications and nudges via Calendar
- [ ] Phase 5 stretch: real returning-user update loop (user model updated after each session)

### Out of Scope

- Mobile app — web-first, hackathon constraint
- OAuth login flow — service account for demo speed
- Multi-user / social features — single user coaching only
- Real-time < 1 FPS video — Live API constraint, demo with cooking accordingly
- Sessions > 10 minutes — no hard limit; Gemini Live supports unlimited session length via context compression/sliding window (confirmed: https://ai.google.dev/gemini-api/docs/live-api/session-management)

## Context

- **Hackathon:** UCLA Glitch x DeepMind — ~24 hours to build
- **Team:** 4 people (1 product, 2 tech, 1 design/tech — all can ship code)
- **Demo activity:** Cooking (knife skills) — chosen because 1 FPS is sufficient for slower movements
- **Key demo moments:** Research phase (brief), live coaching with annotated frame moment, post-session Docs/Calendar, speed round with a different skill, returning user progression
- **Biggest risk:** Gemini Live feedback feeling generic — requires tight system prompt engineering
- **Second risk:** Annotated frames (Gemini image gen) — 3-8s generation time, verbal fallback must be solid

## Constraints

- **Timeline:** ~24 hours — coarse phases, parallel execution, no time for iteration
- **Video:** Gemini Live processes at 1 FPS — fast movements unreliable; demo activity chosen accordingly
- **Session length:** No hard limit — Gemini Live supports unlimited length via context compression/sliding window
- **Auth:** Google service account only — no OAuth redirect flow
- **Annotation latency:** Gemini image gen takes 3-8s per annotated frame
- **Stack:** Next.js 14 (App Router) + Tailwind + TypeScript + Node.js WebSocket server

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js 14 (App Router) | Full-stack in one repo, Vercel deploy in 2 min, React familiarity | — Pending |
| Node.js `ws` WebSocket server alongside Next.js | Gemini Live needs persistent bidirectional stream, Next.js API routes can't hold it | — Pending |
| TypeScript throughout | Catches errors fast under pressure | — Pending |
| Tailwind CSS | No time for custom CSS | — Pending |
| Service account auth | Eliminates OAuth redirect complexity for demo | — Pending |
| Phases 4–5 as stretch goals | Core pipeline (Research → Live → Post-session) must ship first; multi-session is nice-to-have | — Pending |
| Pre-seed returning user demo | Avoids building full update loop for hackathon; demo shows progression concept | — Pending |
| Demo on cooking (knife skills) | 1 FPS handles slow deliberate movements; clear visual feedback opportunity | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone:**
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-27 after initialization*
