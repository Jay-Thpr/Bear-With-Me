# Roadmap: Glitch — Real-Time Self-Training Coach

**Milestone:** v1 — Hackathon MVP (UCLA Glitch x DeepMind)
**Timeline:** ~24 hours
**Granularity:** Coarse
**Execution:** Parallel where possible

---

## Phase 1: Foundation + Research Pipeline

**Goal:** Project scaffolding running and the research phase working end-to-end — user picks a skill, system analyzes YouTube tutorials, structured skill doc appears in Google Docs.

**Why first:** Everything downstream (live session, post-session) depends on the skill doc existing. Also the highest-risk prompt engineering work — get it right early.

**Requirements:** RES-01, RES-02, RES-03, RES-04, RES-05, UI-01

**Deliverables:**
- Next.js 14 project initialized with Tailwind + TypeScript
- Node.js WebSocket server scaffolded in `/server`
- Google service account credentials configured
- Skill selection UI (user types a skill, triggers research)
- Gemini + YouTube research pipeline (search grounding + video analysis)
- Structured skill document written to Google Docs
- Pre-computed cooking skill doc committed as demo fallback

**Canonical refs:**
- `Project.md` — full system architecture
- `Decisions.md` — stack and scope decisions

**Team:** Person A (research pipeline) + Person C (frontend scaffold + skill selection UI)

**Plans:** 5 plans

Plans:
- [ ] 01-01-PLAN.md — Project scaffold, server skeleton, Vitest test infrastructure
- [ ] 01-02-PLAN.md — Google service account auth + Docs write helper
- [ ] 01-03-PLAN.md — Gemini three-step research pipeline + YouTube fallback
- [ ] 01-04-PLAN.md — Skill selection UI (UI-01) + cooking demo fallback JSON
- [ ] 01-05-PLAN.md — POST /api/research route wiring full pipeline end-to-end

---

## Phase 2: Live Coaching Session

**Goal:** User on camera, Gemini Live watching, giving real-time verbal feedback with escalating interventions — Tier 1 through Tier 4 all working.

**Why second:** Core demo moment. Needs Phase 1's skill doc to inject into system prompt. Highest complexity phase.

**Requirements:** LIVE-01, LIVE-02, LIVE-03, LIVE-04, LIVE-05, LIVE-06, LIVE-07, LIVE-08, LIVE-09, LIVE-10, UI-02

**Deliverables:**
- WebSocket server connects browser webcam → Gemini Live (1 FPS frame streaming)
- Skill model + user model injection into Gemini Live system prompt
- Tier 1–2: Gemini Live voice output working in session UI
- `generate_annotation()` function call → Gemini image gen → annotated frame displayed
- `surface_tutorial()` function call → returns YouTube URL + timestamp from skill doc
- Tier 3 escalation logic: verbal correction × 3 → trigger annotated frame
- Tier 4 escalation logic: annotation doesn't land → surface tutorial
- Verbal fallback when annotation generation fails
- User voice input works mid-session (pushback, questions)
- Session UI: camera preview, coaching transcript, annotated frame display panel

**Canonical refs:**
- `Project.md` §Intervention Tiers
- `Project.md` §Live Coaching Session architecture
- `Decisions.md` §Architecture Decisions

**Team:** Person B (WebSocket + Gemini Live + intervention logic) + Person C (session UI)

---

## Phase 3: Post-Session + Workspace Integration

**Goal:** Session ends and everything saves automatically — summary to Docs, next session to Calendar, assets to Drive. Pre-seeded returning user demo asset ready.

**Why third:** Completes the demo pipeline. Independent from Phase 2 internals — can be built in parallel once Workspace auth is set up.

**Requirements:** POST-01, POST-02, POST-03, POST-04, POST-05, POST-06, DEMO-01, DEMO-02, DEMO-03, UI-03, UI-04

**Deliverables:**
- Post-session summary generation (Gemini summarizes session observations)
- Summary saved to Google Docs (structured: goals, improvements, needs work, next focus)
- User model updated in Google Docs after each session
- Next session created in Google Calendar (spacing logic: new technique → tomorrow, reinforcement → 3 days)
- Annotated frames + session assets saved to Google Drive
- Pre-seeded returning user: 5 sessions of fake history in Docs with progression timeline
- Returning user demo view in UI (session history, progression annotated frames)
- Post-session summary screen in UI

**Canonical refs:**
- `Project.md` §Post-Session
- `Project.md` §Two-Tier Context Model
- `Decisions.md` §MVP Scope Cut

**Team:** Person D (Workspace writes + Calendar + Drive) + Person C (post-session UI + returning user view)

---

## Phase 4: Between-Session Experience *(Stretch)*

**Goal:** System stays present between sessions — pre-session prep notification, nudges if practice lapses, weekly progress report.

**Why stretch:** Nice differentiator but zero demo risk if skipped. Only start if Phases 1–3 are solid and time remains.

**Requirements:** BTW-01, BTW-02, BTW-03

**Deliverables:**
- Pre-session Calendar notification with prep content (tutorial clip link)
- Lapse nudge logic (check Calendar → if overdue, trigger notification)
- Weekly progress report generated and saved to Docs

**Canonical refs:**
- `Project.md` §Between Sessions

---

## Phase 5: Multi-Session Intelligence *(Stretch)*

**Goal:** Real returning-user logic — user model actually updates after each session, session goals adapt automatically, system stops correcting mastered skills.

**Why stretch:** Pre-seeded demo covers the concept. Only build if Phase 4 is done with time to spare.

**Requirements:** MULT-01, MULT-02, MULT-03

**Deliverables:**
- Returning user session start: loads skill model + user model + session history from Docs
- Session goals auto-adjusted based on history
- User model update loop after each session (replaces pre-seeded demo asset)
- Feedback pattern adaptation (pace, pushback patterns stored in user model)

**Canonical refs:**
- `Project.md` §Returning User
- `Project.md` §Two-Tier Context Model

---

## Execution Order & Parallelism

```
Hour 0–2:   Phase 1 starts (Person A: research pipeline | Person C: project scaffold)
Hour 0–2:   Phase 3 starts in parallel (Person D: Workspace auth + Docs/Calendar/Drive skeleton)
Hour 2–10:  Phase 2 starts (Person B: WebSocket + Gemini Live | Person C: session UI)
Hour 10–16: Phase 2 integration + Phase 3 completion
Hour 16–18: Full pipeline integration test (research → live → post-session)
Hour 18–20: Demo hardening, fallback testing, prompt engineering polish
Hour 20–22: Phase 4 stretch (if time allows)
Hour 22–24: Phase 5 stretch (if time allows) + demo rehearsal
```

---

## Risk Flags

| Risk | Phase | Mitigation |
|------|-------|------------|
| Gemini Live feedback feels generic | 2 | Tight system prompt with observation-based forcing — test early |
| Annotated frame generation looks wrong | 2 | Test Gemini image gen prompts in Phase 1 warmup; verbal fallback always ready |
| YouTube URL feature (preview) has quirks | 1 | Test in Phase 1; fallback to Gemini training data if needed |
| Research phase produces shallow skill doc | 1 | Invest in research synthesis prompt structure |
| WebSocket + Gemini Live integration complexity | 2 | Person B starts this in hour 1, not hour 8 |

---
*Roadmap created: 2026-03-27*
*Milestone: v1 Hackathon MVP*
