# Research Pipeline — Progress & Future Work

## What Was Done

### Bug Fix: `webSources[].summary` Always Empty
**Root cause:** `enforceResearchDepth` hardcoded `summary: ""` when building `harvestedWebSources`. The actual summaries existed in the `ResearchSource[]` returned from `conductStructuredWebResearch` (`webResearch.sources`) but were never passed downstream.

**Fix:** Threaded `webSources: ResearchSource[]` through three function signatures:
- `route.ts` → `synthesizeResearchModel(brief, webFindings, videoFindings, webResearch.sources)`
- `synthesizeResearchModel` → `repairResearchModelIfNeeded(..., webSources)`
- `repairResearchModelIfNeeded` → `enforceResearchDepth(..., webSources)`

Inside `enforceResearchDepth`, built a `sourceSummaryMap: Map<string, string>` from the `webSources` param, then used it in the `harvestedWebSources` `.map()` call.

**Status:** Verified working via live Juggling research run.

---

## Known Limitations

### Per-Pass Identical Summaries
All `webSources` from the same grounding focus pass share an identical `summary` text because the grounding model returns one `parsed.fundamentals` block per pass, not per URL. Fixing this would require fetching each URL individually — not worth it for now.

---

## Future Work

### 1. Fix Soccer/Domain Bleed in Focus Pass Queries
**Priority: High**

Focus pass 3 ("common beginner mistakes, correction cues, safety constraints") returns off-domain results when the skill name is ambiguous. For example, searching "juggling" returns soccer juggling content from `risefcsoccer.com`, `trainwdukes.ca`, `onlinesocceracademy.com`, producing irrelevant mistakes like:
- "Ankle Locked (for foot juggling)"
- "Stiff Legs (for soccer juggling)"
- "Using only dominant foot (for foot juggling)"

**Fix:** Inject the full skill context into focus pass queries. Instead of generic "common beginner mistakes", use "common beginner mistakes learning [skill]" so the grounding model anchors to the correct domain.

Location: wherever focus pass query strings are constructed in `conductStructuredWebResearch` (`lib/research.ts`).

---

### 2. Deduplicate Evidence Units
**Priority: Low**

Raw evidence collection (~60 units per run) includes near-duplicates, e.g.:
- "Rushing to add balls" / "Rushing to Add More Balls Too Quickly"

Consider a post-collection dedup pass using normalized string comparison or embedding similarity before synthesis.

---

### 3. Per-URL Summaries (Long-Term)
**Priority: Low**

Current summaries are pass-level, not URL-level. True per-URL summaries would require fetching each source URL and summarizing the content individually. Worth revisiting if source quality becomes a user-visible concern.
