import { GoogleGenAI } from "@google/genai";
import type {
  ClarificationAnswer,
  ClarificationQuestion,
  EvidenceQualityMetrics,
  EvidenceSourceRef,
  ProperFormSignal,
  ProgressionStage,
  LearnerProfile,
  ResearchBrief,
  ResearchRunState,
  ResearchEvidenceUnit,
  ResearchIntakeInput,
  ResearchSource,
  SkillResearchModel,
  TutorialReference,
  VideoFinding,
  WebFinding,
} from "./research-types";
import type { SkillModel } from "./types";
import {
  conductWebResearch,
  findTutorialUrls,
  EXTRACTION_MODEL,
} from "./gemini";
import {
  appendStructuredDocContent,
  createResearchTabbedDoc,
  createStructuredDoc,
  replaceTabContent,
  type StructuredDocBlock,
} from "./google-docs";
import { createDriveFolder } from "./google-drive";

function getAI() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function inferResearchDomain(skill: string): string {
  const normalized = skill.toLowerCase();
  if (
    /(juggling|yo-yo|yoyo|coin roll|poi|spinning|pen spinning|card flourish|kendama|diabolo)/.test(
      normalized
    )
  ) {
    return "object_manipulation";
  }
  if (/(push-up|pull-up|squat|handstand|dance|running|kick|punch|yoga)/.test(normalized)) {
    return "body_movement";
  }
  if (/(piano|guitar|drums|violin|singing|trumpet)/.test(normalized)) {
    return "instrument_practice";
  }
  return "other";
}

const WEB_RESEARCH_TIMEOUT_MS = 60_000;
const QUALITY_GATES = {
  properFormSignals: 6,
  commonMistakes: 6,
  beginnerDrills: 4,
  progressionStages: 5,
  sourceCoverage: 5,
  diagnostics: 4,
};
type RepairableSection =
  | "properForm"
  | "progressionStages"
  | "commonMistakes"
  | "diagnostics"
  | "beginnerDrills"
  | "sourceCoverage"
  | "properFormSignals";

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function parseJsonFromText<T>(raw: string): T {
  const trimmed = raw.trim();
  const candidates = [
    trimmed,
    ...Array.from(trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)).map((match) => match[1].trim()),
  ];

  const firstObjectStart = trimmed.indexOf("{");
  const lastObjectEnd = trimmed.lastIndexOf("}");
  if (firstObjectStart >= 0 && lastObjectEnd > firstObjectStart) {
    candidates.push(trimmed.slice(firstObjectStart, lastObjectEnd + 1));
  }

  const firstArrayStart = trimmed.indexOf("[");
  const lastArrayEnd = trimmed.lastIndexOf("]");
  if (firstArrayStart >= 0 && lastArrayEnd > firstArrayStart) {
    candidates.push(trimmed.slice(firstArrayStart, lastArrayEnd + 1));
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try next candidate.
    }
  }

  throw new Error("Unable to parse JSON payload");
}

export async function parseLearnerProfile(input: ResearchIntakeInput): Promise<LearnerProfile> {
  if (!process.env.GEMINI_API_KEY) {
    return buildFallbackLearnerProfile(input);
  }

  const ai = getAI();
  const response = await ai.models.generateContent({
    model: EXTRACTION_MODEL,
    contents: `You are normalizing a learner's research intake for a coaching system.

Input:
${JSON.stringify(input, null, 2)}

Return ONLY valid JSON with this shape:
{
  "skill": "${input.skill}",
  "goal": "${input.goal}",
  "level": "${input.level}",
  "preferences": {
    "learningStyle": "short phrase",
    "coachingTone": "short phrase",
    "pacingPreference": "short phrase"
  },
  "constraints": {
    "timeAvailable": "short phrase",
    "equipment": ["item"],
    "environment": "short phrase",
    "physicalConstraints": ["optional item"]
  },
  "successCriteria": "1-2 sentences"
}

Rules:
- Fill gaps conservatively.
- Normalize vague user phrasing into operational coaching language.
- Do not invent niche equipment unless explicitly implied.
- Keep values concise and reusable downstream.`,
    config: {
      responseMimeType: "application/json",
    },
  });

  return JSON.parse(response.text || "{}") as LearnerProfile;
}

export async function generateClarificationQuestions(
  learnerProfile: LearnerProfile
): Promise<ClarificationQuestion[]> {
  if (!process.env.GEMINI_API_KEY) {
    return [];
  }

  const ai = getAI();
  const response = await ai.models.generateContent({
    model: EXTRACTION_MODEL,
    contents: `You are deciding whether a coaching research system needs clarification before researching a skill.

Learner profile:
${JSON.stringify(learnerProfile, null, 2)}

Return ONLY valid JSON:
{
  "questions": [
    {
      "id": "q1",
      "question": "question text",
      "type": "multiple_choice" | "free_text",
      "options": ["option 1", "option 2"],
      "reason": "why the answer materially changes the research plan"
    }
  ]
}

Rules:
- Ask at most 3 questions.
- Ask 0 questions if the profile is already specific enough.
- Only ask if the answer changes research direction, source selection, safety guidance, or teaching strategy.
- Prefer multiple choice when possible.`,
    config: {
      responseMimeType: "application/json",
    },
  });

  const parsed = JSON.parse(response.text || '{"questions": []}') as { questions?: ClarificationQuestion[] };
  return (parsed.questions || []).slice(0, 3);
}

export async function buildResearchBrief(
  learnerProfile: LearnerProfile,
  clarificationAnswers: ClarificationAnswer[] = []
): Promise<ResearchBrief> {
  const domain = inferResearchDomain(learnerProfile.skill);
  if (!process.env.GEMINI_API_KEY) {
    return {
      skill: learnerProfile.skill,
      goal: learnerProfile.goal,
      level: learnerProfile.level,
      domain,
      learnerProfile,
      priorityAreas: [learnerProfile.goal],
      sourceSelectionGuidance: ["Prefer practical beginner-friendly sources"],
      teachingImplications: ["Keep coaching concise and visual"],
      successCriteria: learnerProfile.successCriteria,
    };
  }

  const ai = getAI();
  const response = await ai.models.generateContent({
    model: EXTRACTION_MODEL,
    contents: `You are creating a research brief for a coaching-research pipeline.

Learner profile:
${JSON.stringify(learnerProfile, null, 2)}

Clarification answers:
${JSON.stringify(clarificationAnswers, null, 2)}

Return ONLY valid JSON:
{
  "skill": "${learnerProfile.skill}",
  "goal": "${learnerProfile.goal}",
  "level": "${learnerProfile.level}",
  "domain": "${domain}",
  "learnerProfile": ${JSON.stringify(learnerProfile)},
  "priorityAreas": ["short item"],
  "sourceSelectionGuidance": ["short item"],
  "teachingImplications": ["short item"],
  "successCriteria": "1-2 sentences"
}

Rules:
- priorityAreas MUST be specific to the technique, mechanics, and mistakes of "${learnerProfile.skill}" — not general pedagogical research areas. Example for juggling: "three-ball cascade throw mechanics", "common beginner timing mistakes". Never use abstract terms like "motor learning" or "scaffolding".
- sourceSelectionGuidance should name specific source types useful for this skill (instructional coaches, sport science, skill-specific tutorials).
- teachingImplications should describe what the coaching system needs to watch for during a live session.
- Keep arrays concise and operational.`,
    config: {
      responseMimeType: "application/json",
    },
  });

  const parsed = JSON.parse(response.text || "{}") as ResearchBrief;
  return {
    ...parsed,
    domain: parsed.domain || domain,
  };
}

export async function conductStructuredWebResearch(
  brief: ResearchBrief
): Promise<{
  findings: WebFinding[];
  sources: ResearchSource[];
  stats: {
    passesAttempted: number;
    passesSucceeded: number;
    evidenceUnitsCollected: number;
    evidenceUnitsDiscarded: number;
    passSummaries: Array<{
      focus: string;
      durationMs: number;
      findings: number;
      discarded: number;
      status: "fulfilled" | "rejected" | "fallback";
      reason?: string;
    }>;
  };
}> {
  const focusPasses = [
    "core mechanics and observable proper form",
    "beginner progression, prerequisite subskills, and drill sequencing",
    "common beginner mistakes, likely causes, correction cues, and safety constraints",
  ];

  const findings: WebFinding[] = [];
  const sourceMap = new Map<string, ResearchSource>();
  const passSummaries: Array<{
    focus: string;
    durationMs: number;
    findings: number;
    discarded: number;
    status: "fulfilled" | "rejected" | "fallback";
    reason?: string;
  }> = [];

  const rawPasses: Array<{ status: "fulfilled"; value: { focus: string; durationMs: number; value: string } } | { status: "rejected"; reason: unknown }> = [];
  for (const focus of focusPasses) {
    const startedAt = Date.now();
    try {
      const value = await withTimeout(
        conductWebResearch(brief.skill, brief.goal, brief.level, focus),
        WEB_RESEARCH_TIMEOUT_MS,
        `web research pass: ${focus}`
      );
      rawPasses.push({
        status: "fulfilled",
        value: { focus, durationMs: Date.now() - startedAt, value },
      });
    } catch (err) {
      rawPasses.push({ status: "rejected", reason: err });
    }
  }

  for (const [index, result] of rawPasses.entries()) {
    const focus = focusPasses[index];
    if (result.status !== "fulfilled") {
      const fallbackFinding = buildFallbackWebFinding(
        brief,
        focus,
        `Grounded retrieval failed: ${String(result.reason)}`
      );
      findings.push(fallbackFinding);
      for (const source of buildFallbackResearchSources(brief, focus)) {
        sourceMap.set(source.url, source);
      }
      passSummaries.push({
        focus,
        durationMs: WEB_RESEARCH_TIMEOUT_MS,
        findings: fallbackFinding.evidenceUnits?.length || 0,
        discarded: 0,
        status: "fallback",
        reason: String(result.reason),
      });
      continue;
    }

    try {
      const parsed = parseJsonFromText<{
        focus?: string;
        fundamentals?: string;
        prerequisites?: string[];
        findings?: ResearchEvidenceUnit[];
        openQuestions?: string[];
        contradictions?: string[];
        sources?: Array<{ title: string; url: string }>;
      }>(result.value.value);

      const normalizedEvidence = normalizeEvidenceUnits(parsed.findings || [], {
        focus: parsed.focus || focus,
        sources: parsed.sources || [],
      });
      const keptEvidence = normalizedEvidence.filter((unit) => !unit.discarded);
      const discardedCount = normalizedEvidence.length - keptEvidence.length;

      const grouped = groupEvidenceForFinding(keptEvidence);

      findings.push({
        category: parsed.focus || focus,
        title: `${brief.skill} web research: ${parsed.focus || focus}`,
        url: "google-search-grounded",
        summary: parsed.fundamentals || `Research summary for ${brief.skill}`,
        evidenceUnits: keptEvidence,
        beginnerPrinciples: grouped.coachingCues,
        prerequisites: dedupeStrings(parsed.prerequisites || []),
        properForm: grouped.properForm,
        commonMistakes: grouped.mistakes,
        progressionSteps: grouped.progression,
        drills: grouped.drills,
        safetyNotes: grouped.safety,
        openQuestions: dedupeStrings(parsed.openQuestions || []),
        contradictions: dedupeStrings(parsed.contradictions || []),
      });

      for (const source of parsed.sources || []) {
        sourceMap.set(source.url, {
          type: "web",
          title: source.title,
          url: source.url,
          summary: parsed.fundamentals || "",
          relevance: parsed.focus || focus,
        });
      }

      passSummaries.push({
        focus,
        durationMs: result.value.durationMs,
        findings: keptEvidence.length,
        discarded: discardedCount,
        status: "fulfilled",
      });
    } catch (error) {
      const fallbackFinding = buildFallbackWebFinding(
        brief,
        focus,
        `Grounded payload parse failed: ${error instanceof Error ? error.message : String(error)}`
      );
      findings.push(fallbackFinding);
      for (const source of buildFallbackResearchSources(brief, focus)) {
        sourceMap.set(source.url, source);
      }
      passSummaries.push({
        focus,
        durationMs: result.value.durationMs,
        findings: fallbackFinding.evidenceUnits?.length || 0,
        discarded: 0,
        status: "fallback",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const evidenceUnitsCollected = findings.reduce(
    (sum, finding) => sum + (finding.evidenceUnits?.length || 0),
    0
  );

  return {
    findings,
    sources: Array.from(sourceMap.values()),
    stats: {
      passesAttempted: focusPasses.length,
      passesSucceeded: passSummaries.filter((summary) => summary.status === "fulfilled").length,
      evidenceUnitsCollected,
      evidenceUnitsDiscarded: passSummaries.reduce((sum, summary) => sum + summary.discarded, 0),
      passSummaries,
    },
  };
}

export async function conductStructuredVideoResearch(
  brief: ResearchBrief,
  onVideoAnalyzed?: (title: string) => void
): Promise<{ videos: VideoFinding[]; sources: ResearchSource[] }> {
  // Short-term architecture decision:
  // the synchronous research pipeline is web-first. We keep YouTube as
  // lightweight enrichment only and intentionally avoid deep per-video parsing
  // in the blocking path because it has been too slow and too fragile.
  const urls = await findTutorialUrls(brief.skill);
  const videos: VideoFinding[] = urls.slice(0, 3).map((url, index) => {
    const title = `${brief.skill} tutorial ${index + 1}`;
    onVideoAnalyzed?.(title);
    return {
      url,
      title,
      summary:
        "Lightweight tutorial reference captured for optional learner review. Not used as primary structured coaching evidence.",
      techniques: [],
      mistakes: [],
      bestMoments: [],
    };
  });

  const sources: ResearchSource[] = videos.map((video) => ({
    type: "youtube",
    title: video.title,
    url: video.url,
    summary: video.summary,
    relevance: "Tutorial enrichment only; web-grounded evidence remains primary.",
  }));

  return { videos, sources };
}

export async function synthesizeResearchModel(
  brief: ResearchBrief,
  webFindings: WebFinding[],
  videoFindings: VideoFinding[],
  webSources: ResearchSource[] = []
): Promise<SkillResearchModel> {
  const evidenceUnits = collectResearchEvidence(webFindings, videoFindings);
  const consolidatedEvidence = consolidateResearchEvidence(evidenceUnits);

  if (!process.env.GEMINI_API_KEY) {
    return enforceResearchDepth(
      buildFallbackResearchModel(brief, webFindings, videoFindings, consolidatedEvidence),
      webFindings,
      videoFindings,
      webSources
    );
  }

  const ai = getAI();
  const response = await ai.models.generateContent({
    model: EXTRACTION_MODEL,
    contents: `You are synthesizing a high-depth, coaching-ready JSON research dossier.

Research brief:
${JSON.stringify(brief, null, 2)}

Collected evidence units:
${JSON.stringify(evidenceUnits, null, 2)}

Consolidated evidence:
${JSON.stringify(consolidatedEvidence, null, 2)}

Return ONLY valid JSON with this shape:
{
  "metadata": {
    "skill": "${brief.skill}",
    "goal": "${brief.goal}",
    "level": "${brief.level}",
    "domain": "${brief.domain || inferResearchDomain(brief.skill)}",
    "createdAt": "${new Date().toISOString()}"
  },
  "learnerProfile": ${JSON.stringify(brief.learnerProfile)},
  "evidenceCollection": {
    "units": [{"type": "proper_form", "label": "short label", "detail": "specific detail", "sourceRefs": [{ "type": "web", "title": "title", "url": "url" }]}]
  },
  "researchQuality": {
    "score": 0,
    "missingSections": ["section if genuinely weak"],
    "repairedSections": [],
    "gateFailures": ["quality gate that is still failing"],
    "evidenceCounts": { "proper_form": 0 },
    "discardedEvidenceCount": 0,
    "notes": ["short note"]
  },
  "prerequisites": ["specific prerequisite"],
  "skillDecomposition": [
    {
      "name": "subskill",
      "purpose": "why it matters",
      "observableSuccessSignals": ["observable cue"],
      "prerequisiteFor": ["next skill stage"]
    }
  ],
  "progressionStages": [
    {
      "name": "stage name",
      "prerequisite": "what should already be true",
      "stageGoal": "what to achieve in this stage",
      "successCriteria": ["observable success signal"],
      "commonBlockers": ["likely blocker"],
      "recommendedDrills": ["drill name"],
      "readyToAdvance": "what confirms readiness"
    }
  ],
  "properFormSignals": [
    {
      "aspect": "aspect name",
      "observableCue": "what a camera should see",
      "whyItMatters": "why this matters for coaching",
      "sourceRefs": [{ "type": "web", "title": "title", "url": "url" }]
    }
  ],
  "properForm": { "aspect": "observable description" },
  "commonMistakes": [
    {
      "issue": "observable issue",
      "severity": "high|medium|low",
      "correction": "specific correction",
      "likelyCause": "why beginners do this",
      "coachingCue": "short spoken cue",
      "drill": "specific drill",
      "reference": { "url": "...", "timestamp": "MM:SS" }
    }
  ],
  "progressionOrder": ["step"],
  "beginnerDrills": [
    {
      "name": "drill name",
      "objective": "what this drill teaches",
      "steps": ["step"],
      "successSignals": ["observable success signal"],
      "commonErrors": ["common error"],
      "recommendedDuration": "2-3 minutes"
    }
  ],
  "diagnostics": [
    {
      "issue": "observable issue",
      "likelyCause": "why it happens",
      "correctionCue": "what the coach should say",
      "recommendedDrill": "drill name"
    }
  ],
  "coachingCues": ["short cue"],
  "tutorialMoments": [
    {
      "url": "url",
      "title": "video title",
      "timestamp": "MM:SS",
      "focus": "what this clip teaches",
      "observableCue": "what success looks like",
      "useCase": "when to show it"
    }
  ],
  "tutorialLibrary": [
    {
      "title": "tutorial title",
      "url": "url",
      "summary": "what this reference is useful for",
      "category": "overview|drill|troubleshooting|reinforcement",
      "useCases": ["when to use this reference"]
    }
  ],
  "qualityChecklist": ["specific checklist item the system can watch during live coaching"],
  "sourceCoverage": [
    {
      "claim": "important coaching claim",
      "sources": [{ "type": "web", "title": "title", "url": "url", "timestamp": "MM:SS" }]
    }
  ],
  "safetyConsiderations": ["note"],
  "coachingStrategy": {
    "approach": "short paragraph",
    "pacing": "short paragraph",
    "escalationNotes": "short paragraph"
  },
  "sessionPlan": {
    "primaryFocus": "string",
    "secondaryFocus": "string",
    "checkpoints": ["checkpoint"]
  },
  "webSources": [{ "type": "web", "title": "title", "url": "url", "summary": "summary" }],
  "videoSources": [{
    "url": "url",
    "title": "title",
    "summary": "summary",
    "techniques": ["technique"],
    "mistakes": ["mistake"],
    "bestMoments": [{ "timestamp": "MM:SS", "description": "description", "useCase": "use case" }]
  }],
  "openQuestions": ["what remains uncertain or should be re-researched later"]
}

Rules:
- Use only evidence present in the evidence units and consolidated evidence.
- Proper form and mistakes must be observable from a camera where possible.
- Prefer concrete beginner coaching detail over generic advice.
- This is an archival JSON dossier optimized for internal coaching quality.
- Session plan must reflect the learner profile and goal.
- Include enough detail to support downstream coaching without requiring the original sources.
- Build a true diagnostic model: each mistake should say what is happening, why, what cue to say, what drill to use, and what improvement looks like when possible.
- Build stage-based progression: each stage should have prerequisite, goal, blockers, drills, and ready-to-advance criteria. Stage names must be skill-specific (e.g. "Single-ball toss exchange", "Two-ball flash"), never generic placeholders like "Build one repeatable action cycle".
- progressionOrder must list stage goal strings in order from progressionStages — do not leave it empty.
- Include at least 6 proper form signals, 6 common mistakes, 4 drills, and 5 progression stages when evidence permits.
- openQuestions must only contain genuine uncertainties — things not covered by the evidence. Do NOT ask about topics you already synthesized (e.g. "what are the most common mistakes" when you already listed them).
- safetyConsiderations must include at least 2 items relevant to this skill's physical risks.
- safetyConsiderations must not contain duplicate or near-duplicate items.
- sourceCoverage must include at least one entry per properFormSignal and one per commonMistake.
- Each sourceCoverage entry must name the specific claim and cite at least one source.
- Keep it structured and implementation-ready.`,
    config: {
      responseMimeType: "application/json",
    },
  });

  const parsed = JSON.parse(response.text || "{}") as SkillResearchModel;
  const hydrated = enforceResearchDepth(parsed, webFindings, videoFindings, webSources);
  const filteredHydrated = {
    ...hydrated,
    webSources: hydrated.webSources.filter(
      (s) => !s.url.startsWith("internal://") && s.url !== ""
    ),
    sourceCoverage: hydrated.sourceCoverage.map((entry) => ({
      ...entry,
      sources: entry.sources.filter((s) => !s.url.startsWith("internal://") && s.url !== ""),
    })),
  };
  const repaired = await repairResearchModelIfNeeded(brief, filteredHydrated, webFindings, videoFindings, webSources);
  return postProcessResearchModel(repaired);
}

async function repairResearchModelIfNeeded(
  brief: ResearchBrief,
  researchModel: SkillResearchModel,
  webFindings: WebFinding[],
  videoFindings: VideoFinding[],
  webSources: ResearchSource[] = []
): Promise<SkillResearchModel> {
  const missingSections = getMissingResearchSections(researchModel);

  if (missingSections.length === 0 || !process.env.GEMINI_API_KEY) {
    return researchModel;
  }

  const ai = getAI();
  let repairedModel = { ...researchModel };
  const repairedSections: string[] = [];

  for (const section of missingSections) {
    const response = await ai.models.generateContent({
      model: EXTRACTION_MODEL,
      contents: buildRepairPrompt(section, brief, repairedModel, webFindings, videoFindings),
      config: {
        responseMimeType: "application/json",
      },
    });

    const repair = JSON.parse(response.text || "{}") as Partial<SkillResearchModel>;
    repairedModel = mergeRepairedSection(repairedModel, section, repair);

    if (hasSectionContent(repairedModel, section)) {
      repairedSections.push(section);
    }
  }

  const hydrated = enforceResearchDepth(repairedModel, webFindings, videoFindings, webSources);
  const allRepairedSections = dedupeStrings([
    ...hydrated.researchQuality.repairedSections,
    ...repairedSections,
  ]);
  return {
    ...hydrated,
    researchQuality: {
      ...hydrated.researchQuality,
      score: computePostRepairScore(hydrated),
      repairedSections: allRepairedSections,
    },
  };
}

function computePostRepairScore(model: SkillResearchModel): number {
  const gates: [number, number][] = [
    [model.properFormSignals.length, QUALITY_GATES.properFormSignals],
    [Object.keys(model.properForm).length, QUALITY_GATES.properFormSignals],
    [model.progressionStages.length, QUALITY_GATES.progressionStages],
    [model.commonMistakes.length, QUALITY_GATES.commonMistakes],
    [model.diagnostics.length, QUALITY_GATES.diagnostics],
    [model.beginnerDrills.length, QUALITY_GATES.beginnerDrills],
    [model.sourceCoverage.length, QUALITY_GATES.sourceCoverage],
  ];
  const passed = gates.filter(([actual, required]) => actual >= required).length;
  // Scale: 0/7 gates = 40, 7/7 gates = 95
  return Math.round(40 + (passed / gates.length) * 55);
}

function getMissingResearchSections(researchModel: SkillResearchModel): RepairableSection[] {
  const missing: RepairableSection[] = [];

  if (researchModel.properFormSignals.length < QUALITY_GATES.properFormSignals) missing.push("properFormSignals");
  if (Object.keys(researchModel.properForm).length < QUALITY_GATES.properFormSignals) missing.push("properForm");
  if (researchModel.progressionStages.length < QUALITY_GATES.progressionStages) missing.push("progressionStages");
  if (researchModel.commonMistakes.length < QUALITY_GATES.commonMistakes) missing.push("commonMistakes");
  if (researchModel.diagnostics.length < QUALITY_GATES.diagnostics) missing.push("diagnostics");
  if (researchModel.beginnerDrills.length < QUALITY_GATES.beginnerDrills) missing.push("beginnerDrills");
  if (researchModel.sourceCoverage.length < QUALITY_GATES.sourceCoverage) missing.push("sourceCoverage");

  return missing;
}

function buildRepairPrompt(
  section: RepairableSection,
  brief: ResearchBrief,
  researchModel: SkillResearchModel,
  webFindings: WebFinding[],
  videoFindings: VideoFinding[]
): string {
  const sectionShape: Record<RepairableSection, string> = {
    properForm: `"properForm": { "aspect": "observable cue" }`,
    properFormSignals: `"properFormSignals": [{
      "aspect": "aspect name",
      "observableCue": "what a camera should see",
      "whyItMatters": "why it matters",
      "sourceRefs": [{ "type": "web", "title": "title", "url": "url" }]
    }]`,
    progressionStages: `"progressionStages": [{
      "name": "stage name",
      "prerequisite": "what should already be true",
      "stageGoal": "what to achieve in this stage",
      "successCriteria": ["observable success signal"],
      "commonBlockers": ["likely blocker"],
      "recommendedDrills": ["drill name"],
      "readyToAdvance": "what confirms readiness"
    }],
    "progressionOrder": ["stage name 1", "stage name 2"]`,
    commonMistakes: `"commonMistakes": [{
      "issue": "observable issue",
      "severity": "high|medium|low",
      "correction": "specific fix",
      "likelyCause": "likely cause",
      "coachingCue": "short cue",
      "drill": "specific drill",
      "reference": { "url": "url", "timestamp": "MM:SS" }
    }]`,
    diagnostics: `"diagnostics": [{
      "issue": "observable issue",
      "likelyCause": "why it happens",
      "correctionCue": "what to say live",
      "recommendedDrill": "drill name"
    }]`,
    beginnerDrills: `"beginnerDrills": [{
      "name": "drill name",
      "objective": "what it teaches",
      "steps": ["step"],
      "successSignals": ["signal"],
      "commonErrors": ["error"],
      "recommendedDuration": "2-3 minutes"
    }]`,
    sourceCoverage: `"sourceCoverage": [{
      "claim": "important coaching claim",
      "sources": [{ "type": "web", "title": "title", "url": "url", "timestamp": "MM:SS" }]
    }]`,
  };

  return `You are repairing one missing section in a coaching research dossier.

Repair target: ${section}

Skill:
${JSON.stringify(brief, null, 2)}

Current research model:
${JSON.stringify(researchModel, null, 2)}

Web findings:
${JSON.stringify(webFindings, null, 2)}

Video findings:
${JSON.stringify(videoFindings, null, 2)}

Return ONLY valid JSON with this exact key shape:
{
  ${sectionShape[section]}
}

Rules:
- Repair only the requested section.
- Use only the evidence provided.
- Prefer specific beginner coaching detail over generic advice.
- For progression stages, make the stages operational and observable.
- For diagnostics and mistakes, include likely causes and spoken correction cues when evidence allows.
- If evidence is insufficient, return the key with an empty array/object rather than inventing content.`;
}

function mergeRepairedSection(
  researchModel: SkillResearchModel,
  section: RepairableSection,
  repair: Partial<SkillResearchModel>
): SkillResearchModel {
  switch (section) {
    case "properFormSignals":
      return {
        ...researchModel,
        properFormSignals:
          researchModel.properFormSignals.length >= QUALITY_GATES.properFormSignals
            ? researchModel.properFormSignals
            : (repair.properFormSignals || researchModel.properFormSignals),
      };
    case "properForm":
      return {
        ...researchModel,
        properForm:
          Object.keys(researchModel.properForm).length >= QUALITY_GATES.properFormSignals
            ? researchModel.properForm
            : (repair.properForm || researchModel.properForm),
      };
    case "progressionStages":
      return {
        ...researchModel,
        progressionStages:
          researchModel.progressionStages.length >= QUALITY_GATES.progressionStages
            ? researchModel.progressionStages
            : (repair.progressionStages || researchModel.progressionStages),
        progressionOrder:
          researchModel.progressionOrder.length >= QUALITY_GATES.progressionStages
            ? researchModel.progressionOrder
            : (repair.progressionOrder || researchModel.progressionOrder),
      };
    case "commonMistakes":
      return {
        ...researchModel,
        commonMistakes:
          researchModel.commonMistakes.length >= QUALITY_GATES.commonMistakes
            ? researchModel.commonMistakes
            : (repair.commonMistakes || researchModel.commonMistakes),
      };
    case "diagnostics":
      return {
        ...researchModel,
        diagnostics:
          researchModel.diagnostics.length >= QUALITY_GATES.diagnostics
            ? researchModel.diagnostics
            : (repair.diagnostics || researchModel.diagnostics),
      };
    case "beginnerDrills":
      return {
        ...researchModel,
        beginnerDrills:
          researchModel.beginnerDrills.length >= QUALITY_GATES.beginnerDrills
            ? researchModel.beginnerDrills
            : (repair.beginnerDrills || researchModel.beginnerDrills),
      };
    case "sourceCoverage":
      return {
        ...researchModel,
        sourceCoverage:
          researchModel.sourceCoverage.length >= QUALITY_GATES.sourceCoverage
            ? researchModel.sourceCoverage
            : (repair.sourceCoverage || researchModel.sourceCoverage),
      };
  }
}

function hasSectionContent(researchModel: SkillResearchModel, section: RepairableSection): boolean {
  switch (section) {
    case "properForm":
      return Object.keys(researchModel.properForm).length > 0;
    case "properFormSignals":
      return researchModel.properFormSignals.length > 0;
    case "progressionStages":
      return researchModel.progressionStages.length > 0;
    case "commonMistakes":
      return researchModel.commonMistakes.length > 0;
    case "diagnostics":
      return researchModel.diagnostics.length > 0;
    case "beginnerDrills":
      return researchModel.beginnerDrills.length > 0;
    case "sourceCoverage":
      return researchModel.sourceCoverage.length > 0;
  }
}

export function mapResearchModelToSkillModel(
  researchModel: SkillResearchModel,
  illustrationUrl: string
): SkillModel {
  return {
    metadata: {
      skill: researchModel.metadata.skill,
      goal: researchModel.metadata.goal,
      level: researchModel.metadata.level,
      createdAt: researchModel.metadata.createdAt,
      illustration: illustrationUrl,
    },
    teachingStrategy: {
      approach: researchModel.coachingStrategy.approach,
      learningStyle: researchModel.learnerProfile.preferences.learningStyle,
      successCriteria: researchModel.learnerProfile.successCriteria,
      pacingNotes: researchModel.coachingStrategy.pacing,
    },
    properForm: researchModel.properForm,
    commonMistakes: researchModel.commonMistakes.map((mistake) => ({
      issue: mistake.issue,
      severity: mistake.severity,
      correction: mistake.correction,
      ...(mistake.reference?.timestamp
        ? { videoReference: { url: mistake.reference.url, timestamp: mistake.reference.timestamp } }
        : {}),
    })),
    progressionOrder: researchModel.progressionOrder,
    safetyConsiderations: researchModel.safetyConsiderations,
    videoReferences: researchModel.videoSources.map((video) => ({
      url: video.url,
      title: video.title,
      bestMoments: video.bestMoments,
    })),
    sessionPlan: {
      primaryFocus: researchModel.sessionPlan.primaryFocus,
      secondaryFocus: researchModel.sessionPlan.secondaryFocus,
      warmupActivity: `Warm up with slow, controlled ${researchModel.metadata.skill} reps.`,
      keyCheckpoints: researchModel.sessionPlan.checkpoints,
      successIndicators: researchModel.sessionPlan.checkpoints,
    },
    webSources: researchModel.webSources.map((source) => ({
      title: source.title,
      url: source.url,
    })),
  };
}

export async function updateLiveResearchWorkspace(
  documentId: string,
  liveResearchTabId: string,
  runState: ResearchRunState,
  auth: any
): Promise<void> {
  await replaceTabContent(
    documentId,
    buildLiveResearchDocBlocks(runState),
    auth,
    liveResearchTabId
  );
}

export async function persistResearchWorkspace(
  researchModel: SkillResearchModel,
  clarificationQuestions: ClarificationQuestion[],
  auth?: any
): Promise<{
  rootFolderUrl: string;
  researchDocUrl: string;
  progressDocUrl: string;
  researchDocId: string;
  researchLogTabId: string;
  liveResearchTabId: string;
  finalResearchTabId: string;
}> {
  const slug = slugify(researchModel.metadata.skill);
  const rootFolder = await createDriveFolder(`Glitch Research - ${slug}`, undefined, auth);
  const researchFolder = await createDriveFolder("Research", rootFolder.id, auth);
  const progressFolder = await createDriveFolder("Progress", rootFolder.id, auth);

  const researchBlocks = buildResearchDocBlocks(researchModel, clarificationQuestions);
  const progressBlocks = buildProgressDocBlocks(researchModel);

  const researchDoc = await createResearchTabbedDoc(
    `${researchModel.metadata.skill} Research`,
    auth,
    researchFolder.id
  );

  await appendStructuredDocContent(
    researchDoc.documentId,
    [
      { type: "title", text: `${researchModel.metadata.skill} Research Run` },
      { type: "paragraph", text: "Research started. Live updates will be appended below." },
      { type: "heading1", text: "Run Log" },
    ],
    auth,
    researchDoc.researchLogTabId
  );

  await replaceTabContent(
    researchDoc.documentId,
    buildLiveResearchDocBlocks({
      stage: "Research initialized",
      skill: researchModel.metadata.skill,
      goal: researchModel.metadata.goal,
      level: researchModel.metadata.level,
      domain: researchModel.metadata.domain,
      notes: ["Live research state will update as evidence is collected."],
    }),
    auth,
    researchDoc.liveResearchTabId
  );

  await replaceTabContent(
    researchDoc.documentId,
    researchBlocks,
    auth,
    researchDoc.finalResearchTabId
  );

  const progressDoc = await createStructuredDoc(
    `${researchModel.metadata.skill} Progress`,
    progressBlocks,
    auth,
    progressFolder.id
  );

  return {
    rootFolderUrl: rootFolder.url,
    researchDocUrl: researchDoc.url,
    progressDocUrl: progressDoc.url,
    researchDocId: researchDoc.documentId,
    researchLogTabId: researchDoc.researchLogTabId,
    liveResearchTabId: researchDoc.liveResearchTabId,
    finalResearchTabId: researchDoc.finalResearchTabId,
  };
}

export async function appendResearchLogEntry(
  documentId: string,
  researchLogTabId: string,
  message: string,
  auth: any
): Promise<void> {
  await appendStructuredDocContent(
    documentId,
    [{ type: "paragraph", text: `${new Date().toLocaleTimeString()}: ${message}` }],
    auth,
    researchLogTabId
  );
}

export async function appendResearchLogBlocks(
  documentId: string,
  researchLogTabId: string,
  blocks: StructuredDocBlock[],
  auth: any
): Promise<void> {
  await appendStructuredDocContent(documentId, blocks, auth, researchLogTabId);
}

export async function initializeResearchWorkspace(
  skill: string,
  auth: any
): Promise<{
  rootFolderUrl: string;
  researchDocUrl: string;
  researchDocId: string;
  researchLogTabId: string;
  liveResearchTabId: string;
  finalResearchTabId: string;
  progressFolderId: string;
}> {
  const slug = slugify(skill);
  const rootFolder = await createDriveFolder(`Glitch Research - ${slug}`, undefined, auth);
  const researchFolder = await createDriveFolder("Research", rootFolder.id, auth);
  const progressFolder = await createDriveFolder("Progress", rootFolder.id, auth);

  const researchDoc = await createResearchTabbedDoc(
    `${skill} Research`,
    auth,
    researchFolder.id
  );

  await appendStructuredDocContent(
    researchDoc.documentId,
    [
      { type: "title", text: `${skill} Research Run` },
      { type: "paragraph", text: "Research started. Live updates will be appended below." },
      { type: "heading1", text: "Run Log" },
    ],
    auth,
    researchDoc.researchLogTabId
  );

  await replaceTabContent(
    researchDoc.documentId,
    buildLiveResearchDocBlocks({
      stage: "Research initialized",
      skill,
      notes: ["Waiting for learner profile and research brief."],
    }),
    auth,
    researchDoc.liveResearchTabId
  );

  await replaceTabContent(
    researchDoc.documentId,
    buildResearchDocPlaceholderBlocks(skill),
    auth,
    researchDoc.finalResearchTabId
  );

  return {
    rootFolderUrl: rootFolder.url,
    researchDocUrl: researchDoc.url,
    researchDocId: researchDoc.documentId,
    researchLogTabId: researchDoc.researchLogTabId,
    liveResearchTabId: researchDoc.liveResearchTabId,
    finalResearchTabId: researchDoc.finalResearchTabId,
    progressFolderId: progressFolder.id,
  };
}

export async function finalizeResearchWorkspace(
  researchModel: SkillResearchModel,
  clarificationQuestions: ClarificationQuestion[],
  auth: any,
  researchDocId: string,
  liveResearchTabId: string,
  finalResearchTabId: string,
  progressFolderId: string
): Promise<{ progressDocUrl: string }> {
  const hydratedModel = enforceResearchDepth(researchModel, [], researchModel.videoSources);
  const researchBlocks = buildResearchDocBlocks(hydratedModel, clarificationQuestions);
  const progressBlocks = buildProgressDocBlocks(hydratedModel);

  await replaceTabContent(
    researchDocId,
    buildLiveResearchDocBlocks(buildRunStateFromResearchModel(hydratedModel, "Research complete", true)),
    auth,
    liveResearchTabId
  );

  try {
    await replaceTabContent(
      researchDocId,
      researchBlocks,
      auth,
      finalResearchTabId
    );
  } catch {
    await appendStructuredDocContent(
      researchDocId,
      researchBlocks,
      auth,
      finalResearchTabId
    );
  }

  const progressDoc = await createStructuredDoc(
    `${hydratedModel.metadata.skill} Progress`,
    progressBlocks,
    auth,
    progressFolderId
  );

  return { progressDocUrl: progressDoc.url };
}

function buildResearchDocBlocks(
  researchModel: SkillResearchModel,
  clarificationQuestions: ClarificationQuestion[]
): StructuredDocBlock[] {
  const canonicalJson = JSON.stringify(
    {
      ...researchModel,
      clarificationQuestions,
    },
    null,
    2
  );

  return [
    { type: "title", text: `${researchModel.metadata.skill} Research` },
    {
      type: "paragraph",
      text: "Canonical JSON research dossier optimized for internal coaching quality.",
    },
    { type: "heading1", text: "Research Dossier JSON" },
    ...chunkJsonIntoBlocks(canonicalJson),
  ];
}

function buildLiveResearchDocBlocks(runState: ResearchRunState): StructuredDocBlock[] {
  return [
    { type: "title", text: `${runState.skill} Live Research` },
    {
      type: "paragraph",
      text: runState.completed
        ? "Research run complete. This tab captures the final live state summary."
        : "This tab shows the current structured research state while the run is in progress.",
    },
    { type: "heading1", text: "Status" },
    {
      type: "bullets",
      items: [
        `Stage: ${runState.stage}`,
        `Skill: ${runState.skill}`,
        ...(runState.goal ? [`Goal: ${runState.goal}`] : []),
        ...(runState.level ? [`Level: ${runState.level}`] : []),
        ...(runState.domain ? [`Domain: ${runState.domain}`] : []),
        ...(typeof runState.sourceCount === "number" ? [`Grounded sources: ${runState.sourceCount}`] : []),
        ...(typeof runState.tutorialReferenceCount === "number"
          ? [`Tutorial references: ${runState.tutorialReferenceCount}`]
          : []),
      ],
    },
    ...(runState.passSummaries?.length
      ? [
          { type: "heading1" as const, text: "Retrieval Passes" },
          {
            type: "bullets" as const,
            items: runState.passSummaries.map(
              (pass) =>
                `${pass.focus}: ${pass.status}${
                  typeof pass.durationMs === "number" ? ` in ${(pass.durationMs / 1000).toFixed(1)}s` : ""
                }${
                  typeof pass.findings === "number" ? `, kept ${pass.findings}` : ""
                }${
                  typeof pass.discarded === "number" ? `, discarded ${pass.discarded}` : ""
                }${
                  pass.reason ? `, reason: ${pass.reason}` : ""
                }`
            ),
          },
        ]
      : []),
    ...(runState.evidenceCounts && Object.keys(runState.evidenceCounts).length > 0
      ? [
          { type: "heading1" as const, text: "Evidence Counts" },
          {
            type: "bullets" as const,
            items: [
              ...Object.entries(runState.evidenceCounts).map(([key, value]) => `${key}: ${value}`),
              ...(typeof runState.discardedEvidenceCount === "number"
                ? [`discarded: ${runState.discardedEvidenceCount}`]
                : []),
            ],
          },
        ]
      : []),
    ...(runState.properFormSignals?.length
      ? [
          { type: "heading1" as const, text: "Provisional Proper Form" },
          { type: "bullets" as const, items: runState.properFormSignals.slice(0, 6) },
        ]
      : []),
    ...(runState.commonMistakes?.length
      ? [
          { type: "heading1" as const, text: "Provisional Mistakes" },
          { type: "bullets" as const, items: runState.commonMistakes.slice(0, 6) },
        ]
      : []),
    ...(runState.drills?.length
      ? [
          { type: "heading1" as const, text: "Provisional Drills" },
          { type: "bullets" as const, items: runState.drills.slice(0, 6) },
        ]
      : []),
    ...(runState.progression?.length
      ? [
          { type: "heading1" as const, text: "Provisional Progression" },
          { type: "bullets" as const, items: runState.progression.slice(0, 6) },
        ]
      : []),
    ...(runState.gateFailures?.length
      ? [
          { type: "heading1" as const, text: "Current Gate Failures" },
          { type: "bullets" as const, items: runState.gateFailures },
        ]
      : []),
    ...(runState.openQuestions?.length
      ? [
          { type: "heading1" as const, text: "Open Questions" },
          { type: "bullets" as const, items: runState.openQuestions.slice(0, 6) },
        ]
      : []),
    ...(runState.contradictions?.length
      ? [
          { type: "heading1" as const, text: "Potential Contradictions" },
          { type: "bullets" as const, items: runState.contradictions.slice(0, 6) },
        ]
      : []),
    ...(runState.notes?.length
      ? [
          { type: "heading1" as const, text: "Notes" },
          { type: "bullets" as const, items: runState.notes.slice(0, 8) },
        ]
      : []),
  ];
}

function buildRunStateFromResearchModel(
  researchModel: SkillResearchModel,
  stage: string,
  completed = false
): ResearchRunState {
  return {
    stage,
    completed,
    skill: researchModel.metadata.skill,
    goal: researchModel.metadata.goal,
    level: researchModel.metadata.level,
    domain: researchModel.metadata.domain,
    sourceCount: researchModel.webSources.length,
    tutorialReferenceCount: researchModel.tutorialLibrary.length,
    evidenceCounts: researchModel.researchQuality.evidenceCounts,
    discardedEvidenceCount: researchModel.researchQuality.discardedEvidenceCount,
    gateFailures: researchModel.researchQuality.gateFailures,
    properFormSignals: researchModel.properFormSignals.map((item) => item.observableCue),
    commonMistakes: researchModel.commonMistakes.map((item) => item.issue),
    drills: researchModel.beginnerDrills.map((item) => item.name),
    progression: researchModel.progressionStages.map((item) => item.stageGoal),
    openQuestions: researchModel.openQuestions,
    notes: researchModel.researchQuality.notes,
  };
}

function buildProgressDocBlocks(researchModel: SkillResearchModel): StructuredDocBlock[] {
  return [
    { type: "title", text: `${researchModel.metadata.skill} Progress` },
    {
      type: "paragraph",
      text: "This document tracks learner progress and active coaching priorities across sessions.",
    },
    { type: "heading1", text: "Current Focus" },
    {
      type: "bullets",
      items: [
        `Primary focus: ${researchModel.sessionPlan.primaryFocus}`,
        `Secondary focus: ${researchModel.sessionPlan.secondaryFocus}`,
      ],
    },
    { type: "heading1", text: "Checkpoints" },
    {
      type: "bullets",
      items: researchModel.sessionPlan.checkpoints,
    },
    { type: "heading1", text: "Coaching Strategy" },
    {
      type: "paragraph",
      text: researchModel.coachingStrategy.approach,
    },
    { type: "heading1", text: "Priority Drills" },
    {
      type: "bullets",
      items: researchModel.beginnerDrills.slice(0, 3).map((drill) => `${drill.name}: ${drill.objective}`),
    },
  ];
}

function buildResearchDocPlaceholderBlocks(skill: string): StructuredDocBlock[] {
  return [
    { type: "title", text: `${skill} Research` },
    {
      type: "paragraph",
      text: "Research is in progress. This tab will be replaced with a structured coaching dossier as evidence is synthesized.",
    },
    { type: "heading1", text: "Planned Sections" },
    {
      type: "bullets",
      items: [
        "Learner profile and constraints",
        "Prerequisites and skill decomposition",
        "Observable proper form",
        "Common mistakes with likely causes and correction cues",
        "Beginner drill library",
        "Tutorial moments and source coverage",
        "Session plan and live coaching checklist",
      ],
    },
  ];
}

function buildFallbackLearnerProfile(input: ResearchIntakeInput): LearnerProfile {
  return {
    skill: input.skill,
    goal: input.goal,
    level: input.level,
    preferences: {
      learningStyle: input.preferences || "Visual demonstrations with concise corrections",
      coachingTone: "Calm and specific",
      pacingPreference: "Short focused rounds",
    },
    constraints: {
      timeAvailable: "10 minute sessions",
      equipment: input.equipment || [],
      environment: input.environment || "Standard practice environment",
      physicalConstraints: [],
    },
    successCriteria: `Show measurable improvement in ${input.goal}.`,
  };
}

function buildFallbackResearchModel(
  brief: ResearchBrief,
  webFindings: WebFinding[],
  videoFindings: VideoFinding[],
  consolidatedEvidence: ReturnType<typeof consolidateResearchEvidence>
): SkillResearchModel {
  const properFormEntries = dedupeStrings(webFindings.flatMap((finding) => finding.properForm));
  const progression = dedupeStrings(webFindings.flatMap((finding) => finding.progressionSteps)).slice(0, 6);
  const drills = dedupeStrings(webFindings.flatMap((finding) => finding.drills)).slice(0, 4);
  const prerequisites = dedupeStrings(webFindings.flatMap((finding) => finding.prerequisites)).slice(0, 5);
  const beginnerPrinciples = dedupeStrings(webFindings.flatMap((finding) => finding.beginnerPrinciples)).slice(0, 6);
  const tutorialMoments = videoFindings.flatMap((video) =>
    video.bestMoments.slice(0, 2).map((moment) => ({
      url: video.url,
      title: video.title,
      timestamp: moment.timestamp,
      focus: moment.description,
      observableCue: moment.description,
      useCase: moment.useCase,
    }))
  ).slice(0, 6);

  return {
    metadata: {
      skill: brief.skill,
      goal: brief.goal,
      level: brief.level,
      domain: brief.domain,
      createdAt: new Date().toISOString(),
    },
    learnerProfile: brief.learnerProfile,
    evidenceCollection: {
      units: consolidatedEvidence.units,
    },
    researchQuality: {
      score: 72,
      missingSections: [],
      repairedSections: [],
      gateFailures: [],
      evidenceCounts: countEvidenceByType(consolidatedEvidence.units),
      discardedEvidenceCount: consolidatedEvidence.discarded.length,
      notes: ["Built from fallback evidence consolidation path."],
    },
    prerequisites: prerequisites.length > 0 ? prerequisites : [`Understand the basic rhythm and setup for ${brief.skill}.`],
    skillDecomposition: progression.slice(0, 4).map((step, index) => ({
      name: `Stage ${index + 1}`,
      purpose: step,
      observableSuccessSignals: properFormEntries.slice(0, 2),
      prerequisiteFor: progression.slice(index + 1, index + 2),
    })),
    progressionStages: buildProgressionStages(
      progression,
      drills,
      dedupeStrings(webFindings.flatMap((finding) => finding.commonMistakes))
    ),
    properFormSignals: buildProperFormSignalsFromEvidence(consolidatedEvidence.properForm, consolidatedEvidence.sourceRefsByLabel),
    properForm: objectFromList(
      properFormEntries.length > 0
        ? properFormEntries
        : [`Controlled, observable form for ${brief.skill}.`]
    ),
    commonMistakes: dedupeStrings(webFindings.flatMap((finding) => finding.commonMistakes)).slice(0, 5).map((issue, index) => ({
      issue,
      severity: index === 0 ? "high" : "medium",
      correction: `Coach the learner toward the matching proper-form cue for ${issue}.`,
      likelyCause: "Early-stage coordination breakdown",
      coachingCue: `Reset and focus on ${issue.toLowerCase()}.`,
      drill: drills[index % Math.max(drills.length, 1)] || "Slow isolated reps",
    })),
    progressionOrder: progression.length > 0 ? progression : [brief.goal, "Build consistency", "Increase control", "Integrate full movement"],
    beginnerDrills: drills.map((drill) => ({
      name: drill,
      objective: `Build one component of ${brief.skill} without full-speed complexity.`,
      steps: ["Slow repetition", "Pause and reset", "Repeat with one cue in mind"],
      successSignals: properFormEntries.slice(0, 2),
      commonErrors: dedupeStrings(webFindings.flatMap((finding) => finding.commonMistakes)).slice(0, 2),
      recommendedDuration: "2-3 minutes",
    })),
    diagnostics: dedupeStrings(webFindings.flatMap((finding) => finding.commonMistakes)).slice(0, 5).map((issue, index) => ({
      issue,
      likelyCause: "Coordination or sequencing error",
      correctionCue: `Simplify the rep and fix ${issue.toLowerCase()}.`,
      recommendedDrill: drills[index % Math.max(drills.length, 1)],
    })),
    coachingCues: beginnerPrinciples.length > 0 ? beginnerPrinciples : ["One correction at a time", "Slow down and reset", "Focus on repeatable rhythm"],
    tutorialMoments,
    tutorialLibrary: buildTutorialLibrary(videoFindings, brief.domain),
    qualityChecklist: [
      "Can the coach identify the learner's current stage in the progression?",
      "Is each correction tied to an observable cue?",
      "Is there a specific drill available for the top mistake?",
      "Does the session plan fit the learner's time constraint?",
    ],
    sourceCoverage: buildFallbackSourceCoverage(brief.skill, webFindings, videoFindings),
    safetyConsiderations: dedupeStrings(webFindings.flatMap((finding) => finding.safetyNotes)).slice(0, 5),
    coachingStrategy: {
      approach: brief.teachingImplications.join(" ") || "Coach one correction at a time.",
      pacing: brief.learnerProfile.preferences.pacingPreference,
      escalationNotes: "Escalate only when corrections repeat without improvement.",
    },
    sessionPlan: {
      primaryFocus: brief.priorityAreas[0] || brief.goal,
      secondaryFocus: brief.priorityAreas[1] || "Build consistency",
      checkpoints: ["Establish baseline", "Reinforce proper form", "Review improvement"],
    },
    webSources: webFindings
      .filter((finding) => !finding.url.startsWith("internal://") && finding.url !== "")
      .map((finding) => ({
        type: "web" as const,
        title: finding.title,
        url: finding.url,
        summary: finding.summary,
      })),
    videoSources: videoFindings,
    openQuestions: [],
  };
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function dedupeStrings(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function dedupeStringsFuzzy(items: string[], threshold = 0.5): string[] {
  const STOP = new Set(["a", "an", "the", "to", "for", "in", "and", "or", "of", "at", "by", "up", "is", "it", "on"]);
  const tokenize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

  const result: string[] = [];
  for (const item of items) {
    const norm = item.toLowerCase().trim();
    const tokens = new Set(tokenize(item));
    const isDuplicate = result.some((existing) => {
      const en = existing.toLowerCase().trim();
      // Length-ratio check (original)
      const [shorter, longer] = norm.length < en.length ? [norm, en] : [en, norm];
      if (longer.includes(shorter) || shorter.length / longer.length > threshold) return true;
      // Token overlap check: if shorter set's tokens are ≥80% covered by longer set
      const existingTokens = new Set(tokenize(existing));
      const [smallSet, largeSet] = tokens.size < existingTokens.size ? [tokens, existingTokens] : [existingTokens, tokens];
      if (smallSet.size === 0) return false;
      const overlap = [...smallSet].filter(
        (t) => largeSet.has(t) || [...largeSet].some((u) => t.length >= 4 && u.length >= 4 && (t.startsWith(u) || u.startsWith(t)))
      ).length;
      return overlap / smallSet.size >= 0.8;
    });
    if (!isDuplicate) result.push(item);
  }
  return result;
}

function isAllFallbackEvidence(model: SkillResearchModel): boolean {
  const units = model.evidenceCollection.units;
  return units.length > 0 && units.every((u) => u.sourceConfidence === "low");
}

function postProcessResearchModel(model: SkillResearchModel): SkillResearchModel {
  let result = { ...model };

  // Normalize score: synthesis model sometimes returns 0-1 float instead of 0-100 int
  if (result.researchQuality.score > 0 && result.researchQuality.score <= 1) {
    result = {
      ...result,
      researchQuality: { ...result.researchQuality, score: Math.round(result.researchQuality.score * 100) },
    };
  }

  // Task 2.1 — Cap quality score when all evidence is fallback
  if (isAllFallbackEvidence(result) && result.researchQuality.score > 65) {
    result = {
      ...result,
      researchQuality: {
        ...result.researchQuality,
        score: Math.min(result.researchQuality.score, 65),
        notes: dedupeStrings([
          ...result.researchQuality.notes,
          "Score capped at 65: all evidence carries low source confidence (fallback only). Re-run when live retrieval succeeds.",
        ]),
      },
    };
  }

  // Task 2.2 — Deduplicate beginnerDrills by name, then reconcile referenced drills
  const seenDrillNames = new Set<string>();
  result = {
    ...result,
    beginnerDrills: result.beginnerDrills.filter((d) => {
      const key = d.name.toLowerCase().trim();
      if (seenDrillNames.has(key)) return false;
      seenDrillNames.add(key);
      return true;
    }),
  };

  const existingDrillNames = new Set(result.beginnerDrills.map((d) => d.name.toLowerCase()));
  const referencedDrills = result.commonMistakes
    .map((m) => m.drill)
    .filter((drill): drill is string => Boolean(drill));

  const missingDrills: typeof result.beginnerDrills = referencedDrills
    .filter((drillName) => !existingDrillNames.has(drillName.toLowerCase()))
    .map((drillName) => {
      const relatedMistake = result.commonMistakes.find((m) => m.drill === drillName);
      return {
        name: drillName,
        objective: `Correct the issue: ${relatedMistake?.issue || drillName}.`,
        steps: ["Isolate the movement", "Repeat slowly with one cue", "Reset between reps"],
        successSignals: relatedMistake?.correction ? [relatedMistake.correction] : ["Movement becomes controlled and repeatable"],
        commonErrors: relatedMistake?.issue ? [relatedMistake.issue] : [],
        recommendedDuration: "2-3 minutes",
      };
    });

  if (missingDrills.length > 0) {
    result = { ...result, beginnerDrills: [...result.beginnerDrills, ...missingDrills] };
  }

  // Task 2.3 — Deduplicate safetyConsiderations
  result = {
    ...result,
    safetyConsiderations: dedupeStringsFuzzy(result.safetyConsiderations),
  };

  // Task 5.1 — Sort evidence units by type priority
  const TYPE_ORDER: Record<string, number> = {
    proper_form: 0,
    mistake: 1,
    mistake_cause: 2,
    progression: 3,
    drill: 4,
    safety: 5,
    coaching_cue: 6,
    tutorial: 7,
    source_claim: 8,
  };
  result = {
    ...result,
    evidenceCollection: {
      units: [...result.evidenceCollection.units].sort(
        (a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9)
      ),
    },
  };

  return result;
}

function objectFromList(items: string[]): Record<string, string> {
  return items.reduce<Record<string, string>>((acc, item, index) => {
    acc[`signal_${index + 1}`] = item;
    return acc;
  }, {});
}

function chunkJsonIntoBlocks(jsonText: string, size = 7000): StructuredDocBlock[] {
  const chunks: StructuredDocBlock[] = [];
  for (let i = 0; i < jsonText.length; i += size) {
    chunks.push({ type: "paragraph", text: jsonText.slice(i, i + size) });
  }
  return chunks;
}

function buildFallbackSourceCoverage(
  skill: string,
  webFindings: WebFinding[],
  videoFindings: VideoFinding[]
): SkillResearchModel["sourceCoverage"] {
  const webSources = webFindings.slice(0, 2).map((finding) => ({
    type: "web" as const,
    title: finding.title,
    url: finding.url,
  }));
  const videoSources = videoFindings.slice(0, 2).flatMap((video) =>
    video.bestMoments.slice(0, 1).map((moment) => ({
      type: "youtube" as const,
      title: video.title,
      url: video.url,
      timestamp: moment.timestamp,
    }))
  );

  return [
    {
      claim: `Foundational coaching guidance for ${skill}`,
      sources: [...webSources, ...videoSources],
    },
  ];
}

function buildFallbackResearchSources(
  brief: ResearchBrief,
  focus: string
): ResearchSource[] {
  const slug = slugify(focus);
  return [
    {
      type: "web",
      title: `${brief.skill} fallback dossier: ${focus}`,
      url: `internal://fallback/${brief.domain || "other"}/${slug}`,
      summary: `Fallback evidence pack generated for ${brief.skill} when grounded retrieval did not return usable results.`,
      relevance: focus,
      confidence: "low",
      fallback: true,
    },
  ];
}

function buildFallbackWebFinding(
  brief: ResearchBrief,
  focus: string,
  failureReason: string
): WebFinding {
  const sources = buildFallbackResearchSources(brief, focus);
  const domain = brief.domain || inferResearchDomain(brief.skill);
  const sourceRef: EvidenceSourceRef = {
    type: "web",
    title: sources[0].title,
    url: sources[0].url,
  };

  const baseByDomain: Record<string, Record<string, ResearchEvidenceUnit[]>> = {
    object_manipulation: {
      "core mechanics and observable proper form": [
        {
          type: "proper_form",
          label: "Consistent throw height",
          detail: "Each throw peaks at roughly the same height so the pattern stays predictable.",
          observableCue: "Objects peak around the same visual window instead of rising unevenly.",
          beginnerUsefulness: 5,
          specificity: 5,
          observability: 5,
          sourceConfidence: "low",
          sourceRefs: [sourceRef],
        },
        {
          type: "proper_form",
          label: "Consistent throw line",
          detail: "Throws travel through a narrow central lane rather than spraying outward.",
          observableCue: "Objects cross in front of the body within a compact box.",
          beginnerUsefulness: 5,
          specificity: 5,
          observability: 5,
          sourceConfidence: "low",
          sourceRefs: [sourceRef],
        },
        {
          type: "proper_form",
          label: "Relaxed catch position",
          detail: "Hands receive the object softly around waist-to-chest height without grabbing or chasing.",
          observableCue: "Catches look quiet and close to the body rather than snatched or lunged for.",
          beginnerUsefulness: 4,
          specificity: 4,
          observability: 5,
          sourceConfidence: "low",
          sourceRefs: [sourceRef],
        },
        {
          type: "proper_form",
          label: "Stable torso",
          detail: "The torso stays mostly still so the hands solve the pattern instead of the whole body compensating.",
          observableCue: "Feet stay planted and the chest does not sway or twist to save throws.",
          beginnerUsefulness: 4,
          specificity: 4,
          observability: 5,
          sourceConfidence: "low",
          sourceRefs: [sourceRef],
        },
        {
          type: "proper_form",
          label: "Early visual tracking",
          detail: "Eyes stay on the top half of the pattern instead of dropping to the hands.",
          observableCue: "Head stays upright and gaze follows the peak of the throws.",
          beginnerUsefulness: 4,
          specificity: 4,
          observability: 4,
          sourceConfidence: "low",
          sourceRefs: [sourceRef],
        },
        {
          type: "proper_form",
          label: "Even rhythm",
          detail: "Throws are spaced evenly so the learner is not pausing, rushing, or double-pumping.",
          observableCue: "The pattern has a steady cadence instead of visibly speeding up or stalling.",
          beginnerUsefulness: 5,
          specificity: 4,
          observability: 4,
          sourceConfidence: "low",
          sourceRefs: [sourceRef],
        },
      ],
      "beginner progression, prerequisite subskills, and drill sequencing": [
        {
          type: "progression",
          label: "Single object control",
          detail: "Start by making one-object throws and catches repeatable before adding complexity.",
          stage: "Single object control",
          readyToAdvance: "The learner can repeat a single clean throw and catch for 20 to 30 seconds.",
          beginnerUsefulness: 5,
          specificity: 4,
          observability: 4,
          sourceConfidence: "low",
          sourceRefs: [sourceRef],
        },
        {
          type: "progression",
          label: "Two-object flash",
          detail: "Use a two-object flash to teach the crossing rhythm without full continuous complexity.",
          stage: "Two-object flash",
          readyToAdvance: "The learner can complete 10 clean flashes without chasing.",
          beginnerUsefulness: 5,
          specificity: 5,
          observability: 4,
          sourceConfidence: "low",
          sourceRefs: [sourceRef],
        },
        {
          type: "progression",
          label: "Two-object repeat rhythm",
          detail: "Repeat the crossing pattern long enough to make the cadence automatic.",
          stage: "Two-object rhythm",
          readyToAdvance: "The learner can keep the same cadence across several repetitions.",
          beginnerUsefulness: 4,
          specificity: 4,
          observability: 4,
          sourceConfidence: "low",
          sourceRefs: [sourceRef],
        },
        {
          type: "drill",
          label: "Single-ball height drill",
          detail: "Practice one throw path until height and catch position are consistent.",
          relatedDrill: "Single-ball height drill",
          beginnerUsefulness: 5,
          specificity: 4,
          observability: 3,
          sourceConfidence: "low",
          sourceRefs: [sourceRef],
        },
        {
          type: "drill",
          label: "Two-ball flash drill",
          detail: "Throw both objects before catching either to learn the basic crossing timing.",
          relatedDrill: "Two-ball flash drill",
          beginnerUsefulness: 5,
          specificity: 5,
          observability: 3,
          sourceConfidence: "low",
          sourceRefs: [sourceRef],
        },
        {
          type: "drill",
          label: "Box pattern drill",
          detail: "Imagine a compact box in front of the body and keep each throw inside it.",
          relatedDrill: "Box pattern drill",
          beginnerUsefulness: 4,
          specificity: 4,
          observability: 3,
          sourceConfidence: "low",
          sourceRefs: [sourceRef],
        },
        {
          type: "drill",
          label: "Feet rooted drill",
          detail: "Practice short runs while keeping the torso quiet and feet planted.",
          relatedDrill: "Feet rooted drill",
          beginnerUsefulness: 4,
          specificity: 4,
          observability: 3,
          sourceConfidence: "low",
          sourceRefs: [sourceRef],
        },
        {
          type: "drill",
          label: "Metronome rhythm drill",
          detail: "Use a counted rhythm to keep throws evenly spaced and prevent rushing.",
          relatedDrill: "Metronome rhythm drill",
          beginnerUsefulness: 5,
          specificity: 4,
          observability: 3,
          sourceConfidence: "low",
          sourceRefs: [sourceRef],
        },
        {
          type: "drill",
          label: "Soft catch reset drill",
          detail: "Catch softly, let the hand drop slightly, then immediately prepare the next throw.",
          relatedDrill: "Soft catch reset drill",
          beginnerUsefulness: 5,
          specificity: 4,
          observability: 4,
          sourceConfidence: "low",
          sourceRefs: [sourceRef],
        },
      ],
      "common beginner mistakes, likely causes, correction cues, and safety constraints": [
        {
          type: "mistake",
          label: "Throwing too far forward",
          detail: "Objects drift away from the body and force the learner to chase the pattern.",
          observableCue: "The learner leans forward or steps to save catches.",
          likelyCause: "Releasing too late and aiming outward instead of across the body.",
          correctionCue: "Keep it in your box.",
          relatedDrill: "Box pattern drill",
          beginnerUsefulness: 5,
          specificity: 5,
          observability: 5,
          sourceConfidence: "low",
          sourceRefs: [sourceRef],
        },
        {
          type: "mistake",
          label: "Throwing too low or too high",
          detail: "Height changes constantly, which destroys timing.",
          observableCue: "One throw peaks at eye level and the next peaks near the forehead or below the chin.",
          likelyCause: "Rushing and changing arm speed on each repetition.",
          correctionCue: "Same window every throw.",
          relatedDrill: "Single-ball height drill",
          beginnerUsefulness: 5,
          specificity: 5,
          observability: 5,
          sourceConfidence: "low",
          sourceRefs: [sourceRef],
        },
        {
          type: "mistake",
          label: "Hands drop too low after the catch",
          detail: "The hand resets from too low a position, which delays the next throw.",
          observableCue: "After catching, the hand dips well below the normal throw line before re-throwing.",
          likelyCause: "Catching rigidly instead of receiving softly and preparing the next throw.",
          correctionCue: "Catch quiet, throw sooner.",
          relatedDrill: "Soft catch reset drill",
          beginnerUsefulness: 4,
          specificity: 4,
          observability: 4,
          sourceConfidence: "low",
          sourceRefs: [sourceRef],
        },
        {
          type: "mistake",
          label: "Looking at the hands instead of the pattern",
          detail: "The learner loses the upper visual reference and starts reacting late.",
          observableCue: "Head tilts down and the eyes track the hands instead of the arc.",
          likelyCause: "Uncertainty about where the throws should peak.",
          correctionCue: "Eyes up to the top of the arc.",
          relatedDrill: "Single-ball height drill",
          beginnerUsefulness: 4,
          specificity: 4,
          observability: 4,
          sourceConfidence: "low",
          sourceRefs: [sourceRef],
        },
        {
          type: "mistake",
          label: "Speeding up after small success",
          detail: "The learner rushes as soon as two or three good reps happen in a row.",
          observableCue: "Cadence visibly accelerates before the pattern breaks down.",
          likelyCause: "Trying to force continuity before rhythm is stable.",
          correctionCue: "Stay slow enough to stay clean.",
          relatedDrill: "Metronome rhythm drill",
          beginnerUsefulness: 5,
          specificity: 4,
          observability: 4,
          sourceConfidence: "low",
          sourceRefs: [sourceRef],
        },
        {
          type: "mistake",
          label: "Saving bad throws with the whole body",
          detail: "The learner twists or shuffles instead of resetting after a bad throw.",
          observableCue: "Feet move and shoulders rotate sharply after a miss.",
          likelyCause: "Trying to rescue every repetition instead of protecting form.",
          correctionCue: "Reset, don’t rescue.",
          relatedDrill: "Feet rooted drill",
          beginnerUsefulness: 4,
          specificity: 4,
          observability: 5,
          sourceConfidence: "low",
          sourceRefs: [sourceRef],
        },
        {
          type: "safety",
          label: "Clear practice lane",
          detail: "Practice in a space with enough room to stop, reset, and retrieve drops safely.",
          beginnerUsefulness: 4,
          specificity: 3,
          observability: 3,
          sourceConfidence: "low",
          sourceRefs: [sourceRef],
        },
        {
          type: "coaching_cue",
          label: "One cue per set",
          detail: "Keep the correction load low so the learner can repeat a clean pattern with one focus.",
          beginnerUsefulness: 5,
          specificity: 4,
          observability: 2,
          sourceConfidence: "low",
          sourceRefs: [sourceRef],
        },
      ],
    },
  };

  const fallbackUnits =
    baseByDomain[domain]?.[focus] ||
    [
      {
        type: "source_claim" as const,
        label: `${brief.skill} fallback coaching guidance`,
        detail: `Fallback evidence generated for ${brief.skill} because grounded retrieval did not return usable results for ${focus}.`,
        beginnerUsefulness: 3,
        specificity: 3,
        observability: 1,
        sourceConfidence: "low" as const,
        sourceRefs: [sourceRef],
      },
    ];

  const grouped = groupEvidenceForFinding(fallbackUnits);

  return {
    category: focus,
    title: `${brief.skill} fallback research: ${focus}`,
    url: sources[0].url,
    summary: `Fallback evidence pack used because grounded retrieval failed for "${focus}".`,
    evidenceUnits: fallbackUnits,
    beginnerPrinciples: grouped.coachingCues,
    prerequisites:
      focus === "beginner progression, prerequisite subskills, and drill sequencing"
        ? [
            `Establish one-object control before attempting the full ${brief.skill}.`,
            "Use short, repeatable sets and reset after visible errors.",
          ]
        : [],
    properForm: grouped.properForm,
    commonMistakes: grouped.mistakes,
    progressionSteps: grouped.progression,
    drills: grouped.drills,
    safetyNotes: grouped.safety,
    openQuestions: [
      `Grounded retrieval failed for "${focus}", so this section should be re-grounded later.`,
    ],
    contradictions: [],
  };
}

function normalizeEvidenceUnits(
  units: ResearchEvidenceUnit[],
  context?: { focus?: string; sources?: Array<{ title: string; url: string }> }
): ResearchEvidenceUnit[] {
  const fallbackSourceRefs =
    context?.sources?.map((source) => ({
      type: "web" as const,
      title: source.title,
      url: source.url,
    })) || [];

  return units.map((unit) => {
    const normalized: ResearchEvidenceUnit = {
      ...unit,
      label: unit.label?.trim() || unit.detail?.trim() || "Unnamed finding",
      detail: unit.detail?.trim() || unit.label?.trim() || "No detail provided",
      observableCue: unit.observableCue?.trim(),
      likelyCause: unit.likelyCause?.trim(),
      correctionCue: unit.correctionCue?.trim(),
      relatedDrill: unit.relatedDrill?.trim(),
      stage: unit.stage?.trim(),
      readyToAdvance: unit.readyToAdvance?.trim(),
      beginnerUsefulness: clampScore(unit.beginnerUsefulness, ["beginner", "drill", "correction", "fundamental"]),
      specificity: clampScore(unit.specificity, [":", ",", "because", "when"]),
      observability: clampScore(unit.observability, ["see", "visible", "watch", "observe", "camera"]),
      sourceConfidence: unit.sourceConfidence || "medium",
      sourceRefs: dedupeSourceRefs(unit.sourceRefs?.length ? unit.sourceRefs : fallbackSourceRefs),
    };
    const metrics = scoreEvidenceUnit(normalized);
    if (metrics.total < 12) {
      normalized.discarded = true;
      normalized.discardReason = "Below minimum evidence quality threshold";
    }
    return normalized;
  });
}

function groupEvidenceForFinding(units: ResearchEvidenceUnit[]) {
  return {
    properForm: dedupeStrings(units.filter((item) => item.type === "proper_form").map((item) => item.observableCue || item.detail)),
    mistakes: dedupeStrings(units.filter((item) => item.type === "mistake").map((item) => item.label)),
    drills: dedupeStrings(units.filter((item) => item.type === "drill").map((item) => item.label)),
    progression: dedupeStrings(units.filter((item) => item.type === "progression").map((item) => item.label)),
    safety: dedupeStrings(units.filter((item) => item.type === "safety").map((item) => item.label)),
    coachingCues: dedupeStrings(units.filter((item) => item.type === "coaching_cue").map((item) => item.label)),
  };
}

function clampScore(value: number | undefined, signalWords: string[]): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.min(5, Math.round(value)));
  }
  const joinedSignals = signalWords.join("|");
  return joinedSignals ? 3 : 1;
}

function confidenceToScore(confidence: ResearchEvidenceUnit["sourceConfidence"]): number {
  switch (confidence) {
    case "high":
      return 5;
    case "medium":
      return 3;
    case "low":
      return 1;
    default:
      return 2;
  }
}

function scoreEvidenceUnit(unit: ResearchEvidenceUnit): EvidenceQualityMetrics {
  const detail = `${unit.label} ${unit.detail} ${unit.observableCue || ""}`.toLowerCase();
  const specificity =
    unit.specificity ??
    Math.min(5, 1 + Number(detail.length > 50) + Number(detail.includes(",")) + Number(detail.includes("because")));
  const observability =
    unit.observability ??
    Math.min(5, 1 + Number(Boolean(unit.observableCue)) + Number(/see|watch|visible|camera|position|path/.test(detail)));
  const coachingUsefulness = Math.min(
    5,
    1 + Number(Boolean(unit.correctionCue)) + Number(Boolean(unit.relatedDrill)) + Number(unit.type === "mistake")
  );
  const beginnerRelevance =
    unit.beginnerUsefulness ??
    Math.min(5, 1 + Number(/beginner|basic|foundational|slow|short/.test(detail)) + Number(unit.type !== "tutorial"));
  const sourceConfidence = confidenceToScore(unit.sourceConfidence);

  return {
    specificity,
    observability,
    coachingUsefulness,
    beginnerRelevance,
    sourceConfidence,
    total: specificity + observability + coachingUsefulness + beginnerRelevance + sourceConfidence,
  };
}

function dedupeSourceRefs(sourceRefs: EvidenceSourceRef[]): EvidenceSourceRef[] {
  const seen = new Set<string>();
  return sourceRefs.filter((sourceRef) => {
    const key = `${sourceRef.type}:${sourceRef.url}:${sourceRef.timestamp || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickHigherConfidence(
  left: ResearchEvidenceUnit["sourceConfidence"],
  right: ResearchEvidenceUnit["sourceConfidence"]
): ResearchEvidenceUnit["sourceConfidence"] {
  return confidenceToScore(left) >= confidenceToScore(right) ? left || right : right || left;
}

function countEvidenceByType(units: ResearchEvidenceUnit[]): Record<string, number> {
  return units.reduce<Record<string, number>>((acc, unit) => {
    acc[unit.type] = (acc[unit.type] || 0) + 1;
    return acc;
  }, {});
}

function buildQualityGateFailures(researchModel: SkillResearchModel): string[] {
  const failures: string[] = [];
  if (researchModel.properFormSignals.length < QUALITY_GATES.properFormSignals) {
    failures.push(`properFormSignals below ${QUALITY_GATES.properFormSignals}`);
  }
  if (researchModel.commonMistakes.length < QUALITY_GATES.commonMistakes) {
    failures.push(`commonMistakes below ${QUALITY_GATES.commonMistakes}`);
  }
  if (researchModel.beginnerDrills.length < QUALITY_GATES.beginnerDrills) {
    failures.push(`beginnerDrills below ${QUALITY_GATES.beginnerDrills}`);
  }
  if (researchModel.progressionStages.length < QUALITY_GATES.progressionStages) {
    failures.push(`progressionStages below ${QUALITY_GATES.progressionStages}`);
  }
  if (researchModel.sourceCoverage.length < QUALITY_GATES.sourceCoverage) {
    failures.push(`sourceCoverage below ${QUALITY_GATES.sourceCoverage}`);
  }
  if (researchModel.diagnostics.length < QUALITY_GATES.diagnostics) {
    failures.push(`diagnostics below ${QUALITY_GATES.diagnostics}`);
  }
  return failures;
}

function collectResearchEvidence(
  webFindings: WebFinding[],
  videoFindings: VideoFinding[]
): ResearchEvidenceUnit[] {
  const units: ResearchEvidenceUnit[] = [];

  for (const finding of webFindings) {
    if (finding.evidenceUnits?.length) {
      units.push(...finding.evidenceUnits);
      continue;
    }

    const sourceRef: EvidenceSourceRef = {
      type: "web",
      title: finding.title,
      url: finding.url,
    };

    for (const cue of finding.properForm) {
      units.push({ type: "proper_form", label: cue, detail: cue, sourceRefs: [sourceRef] });
    }
    for (const issue of finding.commonMistakes) {
      units.push({
        type: "mistake",
        label: issue,
        detail: issue,
        observability: 4,
        beginnerUsefulness: 4,
        specificity: 3,
        sourceConfidence: "medium",
        sourceRefs: [sourceRef],
      });
    }
    for (const drill of finding.drills) {
      units.push({ type: "drill", label: drill, detail: drill, sourceRefs: [sourceRef] });
    }
    for (const step of finding.progressionSteps) {
      units.push({ type: "progression", label: step, detail: step, sourceRefs: [sourceRef] });
    }
    for (const note of finding.safetyNotes) {
      units.push({ type: "safety", label: note, detail: note, sourceRefs: [sourceRef] });
    }
    for (const cue of finding.beginnerPrinciples) {
      units.push({ type: "coaching_cue", label: cue, detail: cue, sourceRefs: [sourceRef] });
    }
  }

  for (const video of videoFindings) {
    units.push({
      type: "tutorial",
      label: video.title,
      detail: video.summary,
      sourceRefs: [{ type: "youtube", title: video.title, url: video.url }],
    });
  }

  return units;
}

function consolidateResearchEvidence(units: ResearchEvidenceUnit[]) {
  const normalized = normalizeEvidenceUnits(units);
  const keptUnits = normalized.filter((unit) => !unit.discarded);
  const discarded = normalized.filter((unit) => unit.discarded);
  const dedupedMap = new Map<string, ResearchEvidenceUnit>();
  const sourceRefsByLabel = new Map<string, EvidenceSourceRef[]>();
  const contradictions = new Map<string, Set<string>>();

  for (const unit of keptUnits) {
    const key = `${unit.type}:${unit.label.toLowerCase()}`;
    const existing = dedupedMap.get(key);
    const mergedSourceRefs = dedupeSourceRefs([
      ...(existing?.sourceRefs || []),
      ...unit.sourceRefs,
    ]);

    if (!existing) {
      dedupedMap.set(key, { ...unit, sourceRefs: mergedSourceRefs });
    } else {
      if (existing.detail !== unit.detail) {
        contradictions.set(
          key,
          new Set([existing.detail, unit.detail].filter(Boolean))
        );
      }
      dedupedMap.set(key, {
        ...existing,
        detail: existing.detail.length >= unit.detail.length ? existing.detail : unit.detail,
        observableCue: existing.observableCue || unit.observableCue,
        likelyCause: existing.likelyCause || unit.likelyCause,
        correctionCue: existing.correctionCue || unit.correctionCue,
        relatedDrill: existing.relatedDrill || unit.relatedDrill,
        stage: existing.stage || unit.stage,
        readyToAdvance: existing.readyToAdvance || unit.readyToAdvance,
        beginnerUsefulness: Math.max(existing.beginnerUsefulness || 0, unit.beginnerUsefulness || 0),
        specificity: Math.max(existing.specificity || 0, unit.specificity || 0),
        observability: Math.max(existing.observability || 0, unit.observability || 0),
        sourceConfidence: pickHigherConfidence(existing.sourceConfidence, unit.sourceConfidence),
        sourceRefs: mergedSourceRefs,
      });
    }
  }

  const consolidatedUnits = Array.from(dedupedMap.values()).sort(
    (a, b) => scoreEvidenceUnit(b).total - scoreEvidenceUnit(a).total
  );

  for (const unit of consolidatedUnits) {
    sourceRefsByLabel.set(unit.label, dedupeSourceRefs(unit.sourceRefs));
  }

  return {
    units: consolidatedUnits,
    discarded,
    qualityMetrics: consolidatedUnits.map((unit) => ({
      label: unit.label,
      type: unit.type,
      metrics: scoreEvidenceUnit(unit),
    })),
    contradictions: Array.from(contradictions.entries()).map(([key, details]) => ({
      key,
      details: Array.from(details),
    })),
    properForm: dedupeStrings(consolidatedUnits.filter((item) => item.type === "proper_form").map((item) => item.observableCue || item.detail || item.label)),
    mistakes: dedupeStrings(consolidatedUnits.filter((item) => item.type === "mistake").map((item) => item.label)),
    drills: dedupeStrings(consolidatedUnits.filter((item) => item.type === "drill").map((item) => item.label)),
    progression: dedupeStrings(consolidatedUnits.filter((item) => item.type === "progression").map((item) => item.label)),
    safety: dedupeStrings(consolidatedUnits.filter((item) => item.type === "safety").map((item) => item.label)),
    coachingCues: dedupeStrings(consolidatedUnits.filter((item) => item.type === "coaching_cue").map((item) => item.label)),
    tutorials: dedupeStrings(consolidatedUnits.filter((item) => item.type === "tutorial").map((item) => item.label)),
    sourceClaims: dedupeStrings(consolidatedUnits.filter((item) => item.type === "source_claim").map((item) => item.label)),
    sourceRefsByLabel,
  };
}

function buildProperFormSignalsFromEvidence(
  labels: string[],
  sourceRefsByLabel: Map<string, EvidenceSourceRef[]>
): ProperFormSignal[] {
  const normalizedLabels = labels.length > 0 ? labels : ["Establish a stable, repeatable visible form baseline."];
  return normalizedLabels.slice(0, 10).map((label, index) => ({
    aspect: `signal_${index + 1}`,
    observableCue: label,
    whyItMatters: "This is a visible cue the coach can watch for during live practice.",
    sourceRefs: sourceRefsByLabel.get(label) || [],
  }));
}

function buildProgressionStages(
  progressionLabels: string[],
  drills: string[],
  commonMistakes: string[]
): ProgressionStage[] {
  const normalizedStages = progressionLabels.length > 0
    ? progressionLabels
    : [
        "Establish setup and basic rhythm",
        "Build one repeatable action cycle",
        "Increase consistency across short runs",
        "Recover from errors without losing form",
        "Sustain the full beginner pattern",
      ];

  return normalizedStages.slice(0, 6).map((stage, index) => ({
    name: `Stage ${index + 1}`,
    prerequisite: index === 0 ? "Understand setup, safety, and equipment baseline" : normalizedStages[index - 1],
    stageGoal: stage,
    successCriteria: [
      `The learner can demonstrate: ${stage.toLowerCase()}`,
      "Visible form remains controlled and repeatable",
    ],
    commonBlockers: commonMistakes.slice(index, index + 2),
    recommendedDrills: drills.slice(index, index + 2),
    readyToAdvance:
      index < normalizedStages.length - 1
        ? `The learner can repeat this stage reliably before moving to ${normalizedStages[index + 1].toLowerCase()}.`
        : "The learner can perform the full beginner pattern with repeatable control.",
  }));
}

const STATIC_TUTORIAL_LIBRARY: Record<string, TutorialReference[]> = {
  object_manipulation: [
    {
      title: "Learn to Juggle 3 Balls — Beginner Step-by-Step",
      url: "https://www.youtube.com/results?search_query=learn+to+juggle+3+balls+beginner",
      summary: "Step-by-step overview of the cascade pattern from one ball to three.",
      category: "overview",
      useCases: ["Introduce the full cascade shape before the first session", "Orientation for first-time learners"],
    },
    {
      title: "Juggling Drills — Isolation and Height Consistency",
      url: "https://www.youtube.com/results?search_query=juggling+drills+height+consistency",
      summary: "Focused drills for keeping throw height consistent and preventing pattern collapse.",
      category: "drill",
      useCases: ["Use when learner has height or timing variance", "Assign for self-practice between sessions"],
    },
    {
      title: "Common Juggling Mistakes and How to Fix Them",
      url: "https://www.youtube.com/results?search_query=juggling+common+mistakes+corrections",
      summary: "Identifies the most common beginner errors and provides specific correction cues.",
      category: "troubleshooting",
      useCases: ["Reference when learner keeps making the same error", "Supplement coaching cue with visual example"],
    },
    {
      title: "Juggling Pattern Reinforcement — Full Cascade",
      url: "https://www.youtube.com/results?search_query=juggling+3+ball+cascade+full+tutorial",
      summary: "Reinforcement tutorial for learners close to completing the three-ball cascade.",
      category: "reinforcement",
      useCases: ["Use when learner is near full pattern but losing rhythm", "Consolidation review after session"],
    },
  ],
  body_movement: [
    {
      title: "Beginner Movement Fundamentals",
      url: "https://www.youtube.com/results?search_query=beginner+body+movement+fundamentals",
      summary: "Core body movement principles for beginners.",
      category: "overview",
      useCases: ["Orient learner before the first session"],
    },
    {
      title: "Movement Drills for Beginners",
      url: "https://www.youtube.com/results?search_query=beginner+body+movement+drills",
      summary: "Drill-based training for building coordination and control.",
      category: "drill",
      useCases: ["Use during self-practice"],
    },
    {
      title: "Common Movement Mistakes",
      url: "https://www.youtube.com/results?search_query=common+movement+mistakes+corrections",
      summary: "Corrections for the most common movement errors.",
      category: "troubleshooting",
      useCases: ["Reference when coaching corrections aren't landing"],
    },
  ],
  instrument_practice: [
    {
      title: "Beginner Instrument Practice Guide",
      url: "https://www.youtube.com/results?search_query=beginner+instrument+practice+tutorial",
      summary: "Orientation guide for first-time instrument learners.",
      category: "overview",
      useCases: ["Introduce practice concepts before session"],
    },
    {
      title: "Instrument Technique Drills",
      url: "https://www.youtube.com/results?search_query=instrument+technique+drills+beginner",
      summary: "Core technique drills for early-stage players.",
      category: "drill",
      useCases: ["Assign for self-study between sessions"],
    },
  ],
};

function buildTutorialLibrary(videoFindings: VideoFinding[], domain?: string): TutorialReference[] {
  const categories: TutorialReference["category"][] = ["overview", "drill", "troubleshooting", "reinforcement"];
  const richVideos = videoFindings.filter(v => v.techniques.length > 0 || v.bestMoments.length > 0);
  if (richVideos.length > 0) {
    return richVideos.slice(0, 4).map((video, index) => ({
      title: video.title,
      url: video.url,
      summary: video.summary,
      category: categories[index % categories.length],
      useCases: [
        "Offer optional learner review outside the live session",
        "Support self-study between coaching sessions",
      ],
    }));
  }

  // Static fallback when no video findings are available
  if (domain && STATIC_TUTORIAL_LIBRARY[domain]) {
    return STATIC_TUTORIAL_LIBRARY[domain];
  }
  return STATIC_TUTORIAL_LIBRARY.object_manipulation;
}

function enforceResearchDepth(
  researchModel: SkillResearchModel,
  webFindings: WebFinding[],
  videoFindings: VideoFinding[],
  webSources: ResearchSource[] = []
): SkillResearchModel {
  // Always merge raw collected evidence with any units the synthesis model added
  const rawEvidence = collectResearchEvidence(webFindings, videoFindings);
  const consolidatedEvidence = consolidateResearchEvidence([
    ...rawEvidence,
    ...(researchModel.evidenceCollection?.units || []),
  ]);

  // Build URL→summary lookup from grounding model sources
  const sourceSummaryMap = new Map<string, string>();
  for (const source of webSources) {
    if (source.url && source.summary && !sourceSummaryMap.has(source.url)) {
      sourceSummaryMap.set(source.url, source.summary);
    }
  }

  // Build comprehensive webSources from all evidence sourceRefs (grounding URLs)
  const seenSourceUrls = new Set<string>();
  const harvestedWebSources: ResearchSource[] = rawEvidence
    .flatMap((unit) => unit.sourceRefs || [])
    .filter((ref) => {
      if (ref.type !== "web" || ref.url.startsWith("internal://") || !ref.url || seenSourceUrls.has(ref.url)) return false;
      seenSourceUrls.add(ref.url);
      return true;
    })
    .slice(0, 20)
    .map((ref) => ({ type: "web" as const, title: ref.title, url: ref.url, summary: sourceSummaryMap.get(ref.url) || "" }));

  const prerequisites = dedupeStrings([
    ...(researchModel.prerequisites || []),
    ...webFindings.flatMap((finding) => finding.prerequisites),
  ]);
  const coachingCues = dedupeStrings([
    ...(researchModel.coachingCues || []),
    ...researchModel.commonMistakes.map((mistake) => mistake.coachingCue || ""),
    ...webFindings.flatMap((finding) => finding.beginnerPrinciples),
  ]);
  const tutorialMoments = [
    ...(researchModel.tutorialMoments || []),
    ...videoFindings.flatMap((video) =>
      video.bestMoments.map((moment) => ({
        url: video.url,
        title: video.title,
        timestamp: moment.timestamp,
        focus: moment.description,
        observableCue: moment.description,
        useCase: moment.useCase,
      }))
    ),
  ].filter((moment, index, arr) =>
    arr.findIndex((candidate) => candidate.url === moment.url && candidate.timestamp === moment.timestamp) === index
  );
  const beginnerDrills = researchModel.beginnerDrills.length > 0
    ? researchModel.beginnerDrills
    : dedupeStrings(webFindings.flatMap((finding) => finding.drills)).slice(0, 4).map((drill) => ({
        name: drill,
        objective: `Build a specific component of ${researchModel.metadata.skill}.`,
        steps: ["Start slow", "Repeat with one cue", "Pause to reset between reps"],
        successSignals: Object.values(researchModel.properForm).slice(0, 2),
        commonErrors: researchModel.commonMistakes.slice(0, 2).map((item) => item.issue),
        recommendedDuration: "2-3 minutes",
      }));
  const skillDecomposition = researchModel.skillDecomposition.length > 0
    ? researchModel.skillDecomposition
    : researchModel.progressionOrder.slice(0, 4).map((step, index) => ({
        name: `Stage ${index + 1}`,
        purpose: step,
        observableSuccessSignals: Object.values(researchModel.properForm).slice(0, 2),
        prerequisiteFor: researchModel.progressionOrder.slice(index + 1, index + 2),
      }));
  const progressionStages = researchModel.progressionStages.length > 0
    ? researchModel.progressionStages
    : buildProgressionStages(
        researchModel.progressionOrder,
        beginnerDrills.map((drill) => drill.name),
        researchModel.commonMistakes.map((mistake) => mistake.issue)
      );
  const qualityChecklist = dedupeStrings([
    ...(researchModel.qualityChecklist || []),
    ...Object.values(researchModel.properForm).slice(0, 4).map((item) => `Check for: ${item}`),
    ...researchModel.commonMistakes.slice(0, 4).map((mistake) => `Avoid: ${mistake.issue}`),
  ]);
  const sourceCoverage = researchModel.sourceCoverage.length > 0
    ? researchModel.sourceCoverage
    : buildFallbackSourceCoverage(researchModel.metadata.skill, webFindings, videoFindings);

  return {
    ...researchModel,
    metadata: {
      ...researchModel.metadata,
      domain: researchModel.metadata.domain || inferResearchDomain(researchModel.metadata.skill),
    },
    evidenceCollection: {
      units: consolidatedEvidence.units,
    },
    researchQuality: {
      score:
        researchModel.researchQuality?.score ||
        Math.min(
          100,
          40 +
            Object.keys(researchModel.properForm).length * 4 +
            researchModel.commonMistakes.length * 3 +
            researchModel.beginnerDrills.length * 4
        ),
      missingSections: getMissingResearchSections(researchModel),
      repairedSections: researchModel.researchQuality?.repairedSections || [],
      gateFailures: buildQualityGateFailures(researchModel),
      evidenceCounts: countEvidenceByType(consolidatedEvidence.units),
      discardedEvidenceCount: consolidatedEvidence.discarded.length,
      notes: dedupeStrings([
        ...(Array.isArray(researchModel.researchQuality?.notes)
          ? researchModel.researchQuality.notes
          : typeof researchModel.researchQuality?.notes === "string"
            ? [researchModel.researchQuality.notes]
            : []),
        ...consolidatedEvidence.contradictions.map(
          (item) => `Potential contradiction in ${item.key}: ${item.details.join(" | ")}`
        ),
      ]),
    },
    prerequisites: prerequisites.length > 0 ? prerequisites : [`Basic setup for ${researchModel.metadata.skill}`],
    skillDecomposition,
    progressionStages,
    properFormSignals:
      researchModel.properFormSignals.length > 0
        ? researchModel.properFormSignals
        : buildProperFormSignalsFromEvidence(consolidatedEvidence.properForm, consolidatedEvidence.sourceRefsByLabel),
    beginnerDrills,
    diagnostics: researchModel.diagnostics.length > 0
      ? researchModel.diagnostics
      : researchModel.commonMistakes.slice(0, 5).map((mistake) => ({
          issue: mistake.issue,
          likelyCause: mistake.likelyCause || "Coordination or sequencing error",
          correctionCue: mistake.coachingCue || mistake.correction,
          recommendedDrill: mistake.drill,
        })),
    coachingCues: coachingCues.slice(0, 10),
    tutorialMoments: tutorialMoments.slice(0, 10),
    tutorialLibrary: (() => {
      const usable = researchModel.tutorialLibrary.filter(
        (t) => !t.url.includes("results?search_query") && !t.url.startsWith("internal://")
      );
      return usable.length > 0 ? usable : buildTutorialLibrary(videoFindings, researchModel.metadata.domain);
    })(),
    qualityChecklist: qualityChecklist.slice(0, 10),
    sourceCoverage,
    safetyConsiderations: dedupeStrings([
      ...(researchModel.safetyConsiderations || []),
      ...webFindings.flatMap((finding) => finding.safetyNotes),
    ]),
    webSources: harvestedWebSources.length > 0
      ? harvestedWebSources
      : (researchModel.webSources || []).filter((s) => !s.url.startsWith("internal://") && s.url !== ""),
    openQuestions: researchModel.openQuestions || [],
  };
}
