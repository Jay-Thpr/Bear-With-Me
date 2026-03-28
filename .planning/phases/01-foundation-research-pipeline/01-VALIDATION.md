---
phase: 1
slug: foundation-research-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None detected — Wave 0 must install Vitest |
| **Config file** | none — Wave 0 installs `vitest.config.ts` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Manual smoke test — run research pipeline with "knife skills"
- **After every plan wave:** Manual end-to-end — research → doc exists in Google Docs
- **Before `/gsd:verify-work`:** Full suite must be green (or demo rehearsal gate passed)
- **Max feedback latency:** 60 seconds (manual smoke test)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| RES-01 | 01 | 2 | RES-01 | integration | `vitest run tests/api/research.test.ts` | ❌ W0 | ⬜ pending |
| RES-02 | 01 | 2 | RES-02 | unit | `vitest run tests/lib/gemini.test.ts` | ❌ W0 | ⬜ pending |
| RES-03 | 01 | 2 | RES-03 | unit | `vitest run tests/lib/gemini.test.ts` | ❌ W0 | ⬜ pending |
| RES-04 | 01 | 2 | RES-04 | unit | `vitest run tests/lib/gemini.test.ts` | ❌ W0 | ⬜ pending |
| RES-05 | 01 | 2 | RES-05 | unit | `vitest run tests/lib/google-docs.test.ts` | ❌ W0 | ⬜ pending |
| UI-01 | 01 | 2 | UI-01 | component | `vitest run tests/components/SkillSelection.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom` — install test framework
- [ ] `vitest.config.ts` — Vitest config with jsdom environment
- [ ] `tests/lib/gemini.test.ts` — stubs for RES-02, RES-03, RES-04 with mocked `@google/genai`
- [ ] `tests/lib/google-docs.test.ts` — stubs for RES-05 with mocked `googleapis`
- [ ] `tests/api/research.test.ts` — stubs for RES-01 via Next.js route handler test
- [ ] `tests/components/SkillSelection.test.tsx` — stubs for UI-01

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Research pipeline produces coaching-quality skill doc | RES-03, RES-04 | Prompt quality requires human judgment — cannot be grep-verified | Run with "knife skills", check doc has form descriptions, common mistakes, video timestamps, progression steps |
| Google Doc appears in correct account | RES-05 | Requires Google account access | Open doc URL returned from pipeline, verify content and ownership |
| WebSocket server starts alongside Next.js dev server | Infra | Process management verification | Run `npm run dev`, verify both ports (3000 and 3001) are listening |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
