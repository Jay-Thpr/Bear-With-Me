# Research Improvement Implementation Plan

This document records the current research-quality implementation plan and the first-pass changes that landed.

## Goals

- Build the final research artifact from scored evidence units instead of broad summaries.
- Optimize for internal coaching quality, not low-latency UX.
- Keep the final research artifact as canonical JSON.
- Make weak runs observable through explicit quality gates and repair reporting.

## Implemented

1. Strict evidence-unit retrieval
- Web research prompts now ask for atomic evidence units such as `proper_form`, `mistake`, `drill`, `progression`, `safety`, `coaching_cue`, and `source_claim`.
- Evidence units carry beginner-usefulness, specificity, observability, and source-confidence metadata.

2. Evidence normalization and scoring
- Retrieval output is normalized before synthesis.
- Weak evidence can be marked as discarded.
- Consolidation dedupes repeated claims and surfaces possible contradictions.

3. Stronger coaching structures
- Progression is now stage-based through `progressionStages`.
- Diagnostics are treated as a first-class section alongside common mistakes.
- Tutorial references remain lightweight enrichment only.

4. Deterministic quality gates
- The dossier tracks thresholds for proper form, mistakes, drills, progression stages, diagnostics, and source coverage.
- Missing sections are recorded in `researchQuality`.

5. Section-specific repair
- Repair now targets one missing section at a time instead of rerunning a broad patch.

6. Run-level observability
- Web retrieval now reports pass-level timing, evidence kept, and evidence discarded.
- Research quality now reports gate failures, evidence counts, and repaired sections.

## Next

- Tighten live Gemini prompts so grounded retrieval produces denser evidence with less repair.
- Improve contradiction handling beyond simple duplicate-detail detection.
- Add richer source-claim corroboration counts.
- Revisit thresholds after a few real runs and tune them against coaching usefulness.
