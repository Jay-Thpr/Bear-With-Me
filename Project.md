# Project Summary: Real-Time Self-Training Coach

## Hackathon
UCLA Glitch x DeepMind

## One-Liner
A real-time AI coaching engine that researches any skill from scratch, then coaches you through live video with personalized, progressive feedback — using Google Workspace as its memory.

---

## Core Concept

The system is not a coaching app for one activity — it's a **coaching engine** that can teach itself any skill and then teach you. The user picks a skill (cooking, basketball, guitar, coding, etc.), the system researches that skill by analyzing YouTube tutorials and web resources, builds an internal understanding of what "good" looks like, and then coaches the user in real-time through a live video session with voice feedback and visual annotations.

What separates this from "point a camera at Gemini" is the **system around it**: the research layer that bootstraps expertise, the tiered intervention logic, the annotated frame corrections, the session memory, the progression tracking across sessions, and the Workspace integration that makes it all persistent.

---

## GenMedia Used

| API | Role |
|---|---|
| **Gemini Live** | Core real-time coaching — watches user via video feed, delivers voice feedback, maintains conversational coaching session |
| **Nano Banana** | Generates annotated frames — takes a still from the user's live video and draws spatial corrections (e.g., circles on wrist position, arrows showing corrected trajectory) |
| **Veo** | Reserved for generated tutorial content only if no suitable YouTube tutorial exists (edge case, not primary) |

---

## Google Workspace Integration

| Product | Role |
|---|---|
| **YouTube** | Research phase — system finds and analyzes tutorial videos to build its understanding of proper technique for any given skill |
| **Google Docs** | Persistent memory — stores the skill model (what good technique looks like), the user model (what this specific user struggles with), and post-session summaries with annotated frames showing progression |
| **Google Calendar** | Practice scheduling — after each session, the system proposes and creates the next practice session based on the user's progress and optimal learning spacing |
| **Google Drive** | Asset storage — annotated frames, session summaries, curated tutorial links |

---

## System Architecture

### Phase 1: Research (Pre-Coaching)

```
User selects skill ("knife skills")
        ↓
Gemini + Google Search grounding
  → searches for technique fundamentals, common mistakes, progression steps
        ↓
Gemini + YouTube video understanding
  → analyzes tutorial videos, extracts what proper form looks like
        ↓
Structured skill document generated
  → proper form, common mistakes, progression order, reference timestamps
        ↓
Skill document saved to Google Docs
```

The skill document is structured, not free-form. It includes specific form descriptions, ranked common mistakes, a suggested progression order, and references to specific moments in tutorial videos. This document becomes the coaching agent's expertise.

### Phase 2: Live Coaching Session

```
Session starts → skill model + user model injected into Live API system prompt
        ↓
Live video feed (1 FPS) + audio from user
        ↓
Gemini perceives what user is doing
        ↓
Compares against skill model + session goals
        ↓
Intervention decision engine (see tiers below)
        ↓
Function calls to backend:
  - log_observation()
  - generate_annotation() → triggers Nano Banana
  - update_progress()
        ↓
User can also speak to the system:
  - "Can you show me that again?"
  - "What am I doing wrong?"
  - "I think that was fine" (feedback/pushback)
```

### Intervention Tiers (Escalating)

The system doesn't randomly choose how to give feedback. It escalates through tiers based on what's needed:

1. **Ambient acknowledgment** — "Good, that one was better." Recognizes improvement. Voice only. Critical for not feeling like the system only criticizes.
2. **Quick verbal correction** — "More wrist flick on the next one." Small adjustment, keeps flow going. Voice only.
3. **Annotated frame** — System pauses flow, grabs a frame from the live video, sends it to Nano Banana to draw spatial corrections (circles, arrows, overlays showing corrected form). For when verbal isn't enough or the correction is spatial. ~3-8 second generation time.
4. **Tutorial reference** — "This is a technique issue. Watch this clip." Surfaces a specific YouTube tutorial (with timestamp) from the research phase. For fundamental misunderstandings, not small tweaks.

**Escalation logic:** If the system gives a Tier 2 correction three times and the user isn't adjusting, it escalates to Tier 3 (annotated frame). If that doesn't click, it escalates to Tier 4 (tutorial). This escalation logic is a key reasoning layer that demonstrates pipeline depth.

### Phase 3: Post-Session

```
Session ends
        ↓
Post-session summary generated → saved to Google Docs
  - What we focused on (session goals)
  - What improved (with annotated frames as evidence)
  - What still needs work (prioritized)
  - Recommended focus for next session
  - Visual timeline (if multi-session: form on day 1 vs today)
        ↓
User model updated in Docs
  - "User has corrected grip issues, now working on blade angle"
  - "User pushes back on pace corrections — may have preferred rhythm"
        ↓
Next session proposed + created in Google Calendar
  - Spacing based on skill type (new technique → practice tomorrow;
    reinforcement → 3 days out)
        ↓
Assets saved to Google Drive
  - Annotated frames, curated tutorial playlist, session notes
```

### Phase 4: Between Sessions

- Pre-session notification with prep content: "Tomorrow we're focusing on dice cuts. Watch this 90-second clip beforehand."
- Gentle nudges if practice lapses, based on Calendar awareness
- Weekly/biweekly progress reports with visual progression

### Phase 5: Returning User (Multi-Session)

```
Returning user starts new session
        ↓
System loads:
  - Skill model (what good looks like — stable)
  - User model (what THIS user struggles with — evolving)
  - Session history (what was covered, what improved)
        ↓
Session goals adjusted automatically:
  - Stops correcting things user has mastered
  - Pushes into new areas when ready
  - Adapts to user's feedback patterns
```

---

## Two-Tier Context Model

| Layer | Content | Update Cadence |
|---|---|---|
| **Skill Model** | What proper technique looks like for this skill. Built from research. | Created once during research, rarely updated |
| **User Model** | What this specific user struggles with, has improved on, prefers. | Updated after every session |

Both are injected into the Live API system prompt at session start.

---

## Technical Constraints & Design Decisions

| Constraint | Impact | Design Decision |
|---|---|---|
| Live API processes video at **1 FPS** | Can't reliably capture fast movements (e.g., basketball shot arc) | Demo with a slower-paced activity (cooking) where 1 FPS is sufficient. Pitch as activity-agnostic. |
| Live API sessions limited to **~10 minutes** | Can't do 45-minute practice sessions | Structure as focused coaching rounds. 10 minutes is actually a good demo length. |
| Nano Banana annotation takes **3-8 seconds** | Can't do rapid-fire visual corrections | Coach says "hold on, let me show you something" — creates a natural coaching pause. Only used for spatial corrections, not every piece of feedback. |
| YouTube URL feature is **in preview** | Could have quirks | Low risk for a hackathon — it's free and documented. |

---

## Demo Strategy

### Primary Demo: Cooking (full flow)
- Show the research phase briefly — system watches a YouTube tutorial, builds understanding
- Live coaching session: user does knife work on camera
- System gives verbal feedback, escalates to an annotated frame showing grip correction
- Session ends, summary generated in Docs, next session scheduled in Calendar

### Secondary Demo: Speed round (prove generalizability)
- 60-second version with a completely different skill
- System researches from scratch, starts coaching
- Even if rougher, proves this isn't a cooking app

### Pre-loaded Demo Asset: Returning user
- Show a user profile with 5 sessions of history
- Demonstrate how session 6 is different from session 1 — the system has stopped correcting mastered skills and is pushing into new territory
- Visual progression timeline with annotated frames from across sessions

---

## Key Differentiators

1. **Research-first coaching** — the system teaches itself before teaching you. Most competitors will hardcode domain knowledge or rely on Gemini's training data. This system bootstraps expertise dynamically from YouTube and web sources.

2. **Annotated frames of YOUR technique** — the "money shot." Taking a frame of your actual hands/body and drawing corrections directly on it. No YouTube tutorial does this. No existing coaching app does this.

3. **Intervention escalation logic** — not random feedback, but a reasoning system that decides what level of intervention is appropriate and escalates when corrections aren't landing.

4. **Multi-session progression** — the system gets smarter about you over time. Session 1 is generic. Session 5 knows your tendencies.

5. **Activity-agnostic architecture** — same engine, any skill. The research layer means it's not limited to pre-trained domains.

---

## Risk Areas to Watch

| Risk | Mitigation |
|---|---|
| Live feedback feels generic ("good job") | Ensure system prompt forces specific, observation-based comments. Test extensively. |
| Gemini misreads the video at 1 FPS | User can push back ("that was actually fine"). Choose demo activity carefully. |
| Annotated frame doesn't look right | Have fallback to verbal-only correction. Test Nano Banana prompts in advance. |
| Research phase produces shallow skill model | Invest time in prompt engineering for the research synthesis step. Structure matters more than volume. |
| Judges see it as "just Gemini with a camera" | Make sure demo shows research phase, annotated frame, and post-session summary — the full pipeline, not just the live part. |
| Other teams build similar real-time coaching | Research layer + progression model + annotated frames are the moat. Emphasize system depth. |