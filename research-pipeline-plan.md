# Research Pipeline Plan

## Goal

Implement the next version of the Glitch research system so it can:

1. Take in user skill, goal, level, preferences, and constraints.
2. Parse that input into a structured learner profile with Gemini.
3. Ask targeted clarification questions only when the missing information materially changes the research plan.
4. Run bounded web and YouTube research.
5. Synthesize the findings into a reusable coaching model.
6. Save the research output into formatted Google Docs stored inside a deterministic Google Drive folder structure.
7. Reuse cached research intelligently so the system does not waste tokens and cost.

This extends the current project direction in [Project.md](/Users/jt/Desktop/Glitch/Project.md) rather than changing it. The core idea remains the same: research-first coaching, Google Workspace as memory, and a structured skill model used later during live coaching.

The schema for this plan is now locked in code at [research-types.ts](/Users/jt/Desktop/Glitch/lib/research-types.ts). Any implementation work should treat that file as the canonical contract unless we explicitly revise the plan.

---

## Product Alignment

### What already matches `Project.md`

- Research-first coaching remains the core differentiator.
- YouTube and web research remain the primary knowledge sources.
- The output remains a structured coaching model, not a generic summary.
- Google Docs remains the persistent memory layer.
- Google Drive remains the storage and organization layer.
- The final research output continues to feed live coaching and post-session memory.

### What this plan adds

- A learner-preference parsing step before research.
- A bounded clarification loop before retrieval.
- Explicit separation between:
  - user profile / preferences
  - raw research evidence
  - synthesized coaching conclusions
- A deterministic Google Drive folder structure.
- A more formal caching and cost-control strategy.

---

## Target User Flow

### Phase 1: Intake

User provides:

- skill
- goal
- experience level
- learning preferences
- constraints
- environment or equipment context

Example:

- Skill: knife skills
- Goal: improve rocking cut
- Level: beginner
- Preferences: visual feedback, calm coaching
- Constraints: only 10 minutes at a time, standard chef's knife

### Phase 2: Learner Profile Parsing

Gemini parses the raw user input into a structured learner profile.

This should produce a normalized object, not free-form prose.

### Phase 3: Clarification Loop

Gemini decides whether clarification is needed.

Rules:

- Ask only if the answer changes source selection, safety guidance, or teaching strategy.
- Ask a maximum of 3 questions.
- Prefer multiple-choice when possible.
- Skip clarification if confidence is already high.

### Phase 4: Research Brief

After intake and clarification, the system generates a structured research brief that includes:

- what the user is trying to achieve
- what counts as success
- what form details matter most
- what sources should be prioritized
- what constraints should affect the teaching plan

### Phase 5: Retrieval

Run web and YouTube research in parallel.

Web research should gather:

- fundamentals
- proper form
- common mistakes
- progression order
- safety considerations

YouTube research should gather:

- top candidate tutorial videos
- the best 2-3 videos for deeper analysis
- timestamps for the most useful moments
- technique demonstrations worth referencing in live coaching

### Phase 6: Synthesis

Gemini synthesizes the evidence into:

- a structured skill research model
- a coach-ready summary
- a session-ready teaching strategy
- recommended progression steps

### Phase 7: Workspace Persistence

The system creates or updates Google Drive folders and formatted Google Docs:

- research doc
- progress doc

The research doc becomes the durable source of truth.
The progress doc becomes the evolving user-facing or coach-facing progression record.

---

## Functional Scope

### In Scope

- User preference parsing
- Clarification question generation
- Clarification answer processing
- Google web research
- YouTube discovery
- Bounded per-video analysis
- Structured synthesis
- Formatted Google Docs generation
- Google Drive folder creation and organization
- Caching strategy
- Read-back validation from Docs

### Out of Scope for first pass

- Google Slides export
- autonomous endless research loops
- advanced asset upload workflows
- multi-user collaboration logic
- long-term automated doc refreshes

---

## Proposed Drive Structure

Use a deterministic folder structure so files are easy to find and update.

```text
Glitch/
  {User Identity}/
    {Skill Slug}/
      Research/
        skill-research-doc
      Progress/
        skill-progress-doc
      Assets/
        session-images
        generated-annotations
```

### Notes

- The user identity can initially be derived from signed-in Google email.
- The skill slug should be normalized from the selected skill.
- `Research` and `Progress` should be separate folders for clarity.

---

## Proposed Docs Structure

### Research Doc

Suggested sections:

1. Title
2. Skill Overview
3. Learner Profile
4. Clarification Answers
5. Web Research Findings
6. YouTube Research Findings
7. Proper Form
8. Common Mistakes
9. Progression Order
10. Safety Notes
11. Coaching Strategy
12. Recommended First Session Focus
13. Source Appendix

### Progress Doc

Suggested sections:

1. Title
2. Current Status
3. Active Focus Areas
4. Improvements
5. Needs Work
6. Recommended Next Step
7. Session Updates

### Formatting Requirements

Use Docs formatting rather than plain inserted text whenever possible:

- Title
- Heading 1
- Heading 2
- paragraphs
- bullet lists

This keeps the docs readable for both demo purposes and operational reuse.

---

## Data Contracts

These should be locked before deeper implementation.

Status:

- Locked in [research-types.ts](/Users/jt/Desktop/Glitch/lib/research-types.ts)
- New implementation work should reuse those interfaces instead of introducing overlapping ad hoc shapes

### LearnerProfile

```ts
interface LearnerProfile {
  skill: string;
  goal: string;
  level: "beginner" | "intermediate" | "advanced";
  preferences: {
    learningStyle: string;
    coachingTone: string;
    pacingPreference: string;
  };
  constraints: {
    timeAvailable: string;
    equipment: string[];
    environment: string;
    physicalConstraints?: string[];
  };
  successCriteria: string;
}
```

### ClarificationQuestion

```ts
interface ClarificationQuestion {
  id: string;
  question: string;
  type: "multiple_choice" | "free_text";
  options?: string[];
  reason: string;
}
```

### ResearchSource

```ts
interface ResearchSource {
  type: "web" | "youtube";
  title: string;
  url: string;
  summary: string;
}
```

### VideoFinding

```ts
interface VideoFinding {
  url: string;
  title: string;
  bestMoments: Array<{
    timestamp: string;
    description: string;
    useCase: string;
  }>;
  techniques: string[];
  mistakes: string[];
}
```

### SkillResearchModel

```ts
interface SkillResearchModel {
  metadata: {
    skill: string;
    goal: string;
    level: string;
    createdAt: string;
  };
  learnerProfile: LearnerProfile;
  properForm: Record<string, string>;
  commonMistakes: Array<{
    issue: string;
    severity: "high" | "medium" | "low";
    correction: string;
    reference?: { url: string; timestamp?: string };
  }>;
  progressionOrder: string[];
  safetyConsiderations: string[];
  coachingStrategy: {
    approach: string;
    pacing: string;
    escalationNotes: string;
  };
  sessionPlan: {
    primaryFocus: string;
    secondaryFocus: string;
    checkpoints: string[];
  };
  webSources: ResearchSource[];
  videoSources: VideoFinding[];
}
```

---

## Clarification Strategy

### Purpose

Clarification exists to reduce ambiguity that would materially affect:

- research direction
- safety guidance
- teaching style
- source selection

### Rules

- Maximum 3 clarification questions.
- Ask 0 questions if confidence is already sufficient.
- Prefer structured answers over open text.
- Stop early once confidence is high enough.

### Good clarification examples

- What knife are you using?
- Is your goal technique, speed, or safety-first basics?
- Do you want visual demonstrations first or correction-as-you-practice?

### Bad clarification examples

- generic personality questions
- low-value preference questions
- anything that does not change the research or coaching strategy

---

## Research Strategy

### Web Research

Bounded retrieval targets:

- 5 to 8 useful web sources
- synthesize only the strongest evidence
- prefer observable and coachable descriptions

### YouTube Research

Bounded retrieval targets:

- discover up to 5 candidate videos
- deeply analyze top 2 to 3
- store timestamped moments, not long raw transcripts

### Retrieval Principles

- Prefer sources that clearly show technique.
- Prioritize teachability over volume.
- Preserve evidence traces so later prompts do not need to rediscover the same information.

---

## Cost and Token Strategy

If the pipeline is fully LLM-driven and unconstrained, it can become expensive. The main cost risk is repeated deep synthesis and too many video analyses.

### Cost-Control Principles

1. Use a staged pipeline.
2. Cache expensive outputs.
3. Limit YouTube deep analysis.
4. Separate retrieval from synthesis.
5. Reuse evidence across later prompt generations.
6. Re-research only when the skill setup materially changes.

### Recommended Limits

- Clarification questions: max 3
- Web sources: 5 to 8
- Deep YouTube analyses: 2 to 3
- Final synthesis: 1 primary synthesis call per research run

### Caching Targets

Cache:

- parsed learner profile
- clarification answers
- discovered URLs
- per-video analysis
- final research model
- generated research doc identifiers

### Reuse Rules

Reuse cached research if:

- skill is the same
- goal is materially the same
- level is the same
- preferences change only teaching style, not source selection

Re-run research if:

- skill changes
- goal changes substantially
- safety context changes
- equipment changes enough to affect technique

---

## System Architecture

### Pipeline Stages

1. Intake normalization
2. Learner profile parsing
3. Clarification generation
4. Clarification answer processing
5. Research brief generation
6. Parallel web and YouTube retrieval
7. Evidence normalization
8. Final synthesis into `SkillResearchModel`
9. Google Drive folder creation or lookup
10. Formatted Google Docs creation or update
11. Read-back validation
12. Store identifiers for downstream live coaching

### Persistence Model

Store both:

- raw structured evidence
- synthesized coaching conclusions

Why:

- better traceability
- easier debugging
- avoids repeated research costs
- improves explainability for demo and iteration

---

## Integration With Current App

### Current assets to reuse

- `src/app/session-prep/page.tsx`
- `src/app/research-loading/page.tsx`
- `src/app/api/research/route.ts`
- `lib/gemini.ts`
- `lib/research-types.ts`
- `lib/google-docs.ts`
- `lib/google-drive.ts`
- `lib/getUserAuth.ts`

### Likely new or expanded pieces

- learner profile parser
- clarification question generator
- clarification answer processor
- research brief generator
- research-model-to-live-model adapter
- richer folder lookup and file organization logic
- structured docs writer for research output

### UI additions likely needed

- preference intake fields
- clarification step UI
- richer research progress feed
- doc creation status and links

---

## Failure and Fallback Behavior

### Clarification failure

- If Gemini fails to generate questions, proceed with the original input.

### Retrieval failure

- If web research partially fails, continue with YouTube evidence.
- If YouTube partially fails, continue with web evidence.
- If both are weak, fall back to a minimal research model with low-confidence notes.

### Workspace failure

- If Drive folder creation fails, still allow research synthesis to complete.
- If Docs write fails, preserve the research model in app state for later retry.

### Parsing failure

- Default to a minimal normalized learner profile using raw user input.

---

## Phased Build Order

### Phase 1

- Lock schemas
- Lock folder structure
- Lock doc structure

### Phase 2

- Build learner profile parser
- Build clarification-question generator
- Build clarification-answer processing

### Phase 3

- Build bounded research orchestrator
- Add web and YouTube evidence normalization
- Add caching hooks

### Phase 4

- Build formatted research doc generator
- Build progress doc generator
- Build folder creation and file placement

### Phase 5

- Read-back validation
- Connect to research-loading UI
- Expose final research model to session briefing and live coaching

---

## Recommended Initial Deliverable

The first complete version of this feature should satisfy this statement:

> Given a skill, goal, level, and learner preferences, the app asks only the necessary clarification questions, runs bounded web and YouTube research, synthesizes a structured coaching model, and stores a formatted research doc and progress doc inside a deterministic Google Drive folder.

That is the right first milestone before adding any richer exports or autonomous refresh behavior.
