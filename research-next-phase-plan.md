# Research Next-Phase Plan

This plan covers the next two improvements:

1. domain-tuned research quality
2. separating the Live Research doc from the Final Research doc

The goal is to improve coaching-quality research first, while making the research process observable and debuggable during a run.

## Goals

- Tune research for one high-value domain family before generalizing.
- Keep the final research artifact as canonical JSON.
- Add a separate Live Research tab that shows structured progress while research is running.
- Make weak runs diagnosable from docs alone.

## Domain Strategy

Start with `object_manipulation` as the pilot domain.

Why:
- It matches `Juggling`, which is the current target.
- It needs coaching cues that generic prompts often miss: object path, release timing, rhythm, recovery, and isolation drills.
- It provides a good template for other coordination-heavy skills later.

## Workstream 1: Domain-Tuned Research

### Phase 1. Domain inference

Files:
- `lib/research-types.ts`
- `lib/research.ts`

Changes:
- Add a domain field to the research brief.
- Add a domain field to dossier metadata.
- Infer domain from the skill during brief creation.

Initial domain set:
- `object_manipulation`
- `body_movement`
- `instrument_practice`
- `other`

Implementation notes:
- Start with rule-based inference for stability.
- Only use Gemini to infer domain later if the rules are too weak.

### Phase 2. Domain-specific evidence retrieval

Files:
- `lib/gemini.ts`
- `lib/research-types.ts`

Changes:
- Route grounded web retrieval prompts through domain-specific prompt builders.
- Keep the evidence-unit contract fixed, but vary the required evidence emphasis by domain.

For `object_manipulation`, retrieval must emphasize:
- visible object path / trajectory
- release timing or rhythm
- hand position and recovery patterns
- common misses and what they imply
- drills that isolate one component at a time

Success criteria:
- better mistake-to-drill linkage
- better observable proper-form cues
- less generic progression language

### Phase 3. Domain-specific synthesis rules

Files:
- `lib/research.ts`

Changes:
- Add domain-specific synthesis instructions before the final dossier prompt.
- For `object_manipulation`, bias toward:
  - control before complexity
  - rhythm and repeatability
  - recovery after misses
  - observable cues that a camera can check

### Phase 4. Domain-specific quality gates

Files:
- `lib/research.ts`

Changes:
- Keep the generic quality gates.
- Add domain overlay gates.

Initial `object_manipulation` gates:
- at least 4 path / trajectory cues
- at least 4 rhythm or timing cues
- at least 4 recovery or failure-mode mistakes
- at least 3 isolation drills

If these fail:
- trigger section-specific repair
- log domain gate failures into `researchQuality`

### Phase 5. Gold-set evaluation

Files:
- optional script under `scripts/` later

Test set:
- `Juggling`
- `Coin roll`
- `Yo-yo basics`
- `Basic poi spinning`

Evaluation dimensions:
- observable specificity
- mistake usefulness
- drill usefulness
- stage progression quality
- source coverage quality

## Workstream 2: Live Research Doc vs Final Research Doc

### Current state

The research doc currently has:
- `Research Log`
- `Final Research`

This mixes two separate jobs:
- run visibility
- canonical archival output

### Target doc model

The research doc should have three tabs:

1. `Research Log`
- append-only event history

2. `Live Research`
- replace-based structured summary of current state

3. `Final Research`
- canonical JSON dossier

### Phase 1. Add a Live Research tab

Files:
- `lib/google-docs.ts`
- `lib/research-types.ts`
- `lib/research.ts`
- `src/app/api/research/route.ts`

Changes:
- extend `TabbedResearchDoc` with `liveResearchTabId`
- create a third tab when initializing the research doc
- persist `liveResearchTabId` in workspace refs

### Phase 2. Add a live-doc state model

Files:
- `lib/research-types.ts`
- `lib/research.ts`

Add a `ResearchRunState` type with:
- `stage`
- `domain`
- `passSummaries`
- `evidenceCounts`
- `discardedEvidenceCount`
- `provisionalProperForm`
- `provisionalMistakes`
- `provisionalDrills`
- `provisionalProgression`
- `qualityGateFailures`
- `openQuestions`
- `contradictions`

### Phase 3. Render the Live Research tab

Files:
- `lib/research.ts`

Add:
- `buildLiveResearchDocBlocks(runState)`
- `updateLiveResearchWorkspace(...)`

The Live Research tab should show:
- current stage
- inferred domain
- retrieval pass status
- evidence kept vs discarded
- strongest current proper-form signals
- strongest current mistakes
- strongest current drills
- current gate failures
- open questions / contradictions

This tab should be human-readable, not JSON-first.

### Phase 4. Update the Live Research tab at stage boundaries

Files:
- `src/app/api/research/route.ts`

Update after:
- learner profile
- research brief
- each web retrieval pass completion
- evidence consolidation
- repair
- final synthesis

Implementation notes:
- use `replaceTabContent()` for the Live Research tab
- do not append endlessly

### Phase 5. Finalization behavior

Files:
- `lib/research.ts`

At completion:
- `Research Log` remains append-only history
- `Live Research` is marked complete and left as the final summary state
- `Final Research` contains only canonical JSON dossier

## Recommended Order

1. Add the `Live Research` tab and workspace plumbing.
2. Add `ResearchRunState` and live-doc rendering.
3. Update the route to refresh the live tab at stage boundaries.
4. Add domain inference to the research brief.
5. Add `object_manipulation` retrieval prompts.
6. Add domain-specific synthesis guidance.
7. Add domain-specific quality gates.
8. Run the gold-set evaluation loop and tune.

## Local Verification Plan

After implementation, verify in this order:

1. `npx tsc --noEmit`
- expected current blocker: stale `tests/lib/gemini.test.ts`

2. no-key structural probe
- confirm the live-run state can be built
- confirm the doc block builders produce valid structures
- confirm the dossier still maps into `SkillModel`

3. with-key bounded probe
- run `Juggling`
- inspect:
  - domain inference
  - evidence counts
  - domain gate failures
  - live-doc content at intermediate stages
  - final JSON dossier quality

4. manual doc inspection
- confirm:
  - `Research Log` is append-only
  - `Live Research` is replace-based and readable
  - `Final Research` is canonical JSON only

## Success Criteria

- `Juggling` research clearly improves in observable cues, drills, and mistake diagnosis.
- The user can understand what research is doing from the Live Research tab.
- The Final Research tab stays clean and machine-readable.
- When a run is weak, the docs reveal whether the problem is retrieval, filtering, repair, or synthesis.
