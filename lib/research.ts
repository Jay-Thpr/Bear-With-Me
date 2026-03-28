import { GoogleGenAI } from "@google/genai";
import type {
  ClarificationAnswer,
  ClarificationQuestion,
  LearnerProfile,
  ResearchBrief,
  ResearchIntakeInput,
  ResearchSource,
  SkillResearchModel,
  VideoFinding,
  WebFinding,
} from "./research-types";
import type { SkillModel } from "./types";
import {
  analyzeAllVideos,
  conductWebResearch,
  findTutorialUrls,
  GEMINI_MODEL,
} from "./gemini";
import { createStructuredDoc, type StructuredDocBlock } from "./google-docs";
import { createDriveFolder } from "./google-drive";

function getAI() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

export async function parseLearnerProfile(input: ResearchIntakeInput): Promise<LearnerProfile> {
  if (!process.env.GEMINI_API_KEY) {
    return buildFallbackLearnerProfile(input);
  }

  const ai = getAI();
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
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
    model: GEMINI_MODEL,
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
  if (!process.env.GEMINI_API_KEY) {
    return {
      skill: learnerProfile.skill,
      goal: learnerProfile.goal,
      level: learnerProfile.level,
      learnerProfile,
      priorityAreas: [learnerProfile.goal],
      sourceSelectionGuidance: ["Prefer practical beginner-friendly sources"],
      teachingImplications: ["Keep coaching concise and visual"],
      successCriteria: learnerProfile.successCriteria,
    };
  }

  const ai = getAI();
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
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
  "learnerProfile": ${JSON.stringify(learnerProfile)},
  "priorityAreas": ["short item"],
  "sourceSelectionGuidance": ["short item"],
  "teachingImplications": ["short item"],
  "successCriteria": "1-2 sentences"
}

Rules:
- Focus on what should shape research, not on writing the final coaching plan yet.
- Keep arrays concise and operational.`,
    config: {
      responseMimeType: "application/json",
    },
  });

  return JSON.parse(response.text || "{}") as ResearchBrief;
}

export async function conductStructuredWebResearch(
  brief: ResearchBrief
): Promise<{ findings: WebFinding[]; sources: ResearchSource[] }> {
  const raw = await conductWebResearch(brief.skill, brief.goal, brief.level);

  try {
    const parsed = JSON.parse(raw) as {
      fundamentals?: string;
      properForm?: Record<string, string>;
      commonMistakes?: Array<{ issue: string; correction?: string }>;
      progressionSteps?: string[];
      safetyConsiderations?: string[];
      sources?: Array<{ title: string; url: string }>;
    };

    const finding: WebFinding = {
      title: `${brief.skill} web research`,
      url: "google-search-grounded",
      summary: parsed.fundamentals || `Research summary for ${brief.skill}`,
      properForm: Object.values(parsed.properForm || {}),
      commonMistakes: (parsed.commonMistakes || []).map((item) => item.issue),
      progressionSteps: parsed.progressionSteps || [],
      safetyNotes: parsed.safetyConsiderations || [],
    };

    const sources: ResearchSource[] = (parsed.sources || []).map((source) => ({
      type: "web",
      title: source.title,
      url: source.url,
      summary: parsed.fundamentals || "",
    }));

    return { findings: [finding], sources };
  } catch {
    return {
      findings: [],
      sources: [],
    };
  }
}

export async function conductStructuredVideoResearch(
  brief: ResearchBrief,
  onVideoAnalyzed?: (title: string) => void
): Promise<{ videos: VideoFinding[]; sources: ResearchSource[] }> {
  const urls = await findTutorialUrls(brief.skill);
  const rawAnalyses = await analyzeAllVideos(urls.slice(0, 3), brief.skill, brief.goal, onVideoAnalyzed);

  const videos: VideoFinding[] = [];
  const sources: ResearchSource[] = [];

  for (const raw of rawAnalyses) {
    try {
      const parsed = JSON.parse(raw) as {
        url: string;
        title: string;
        overallSummary?: string;
        keyTechniques?: Array<{ technique: string }>;
        commonMistakesShown?: Array<{ mistake: string }>;
        bestMomentsForReference?: Array<{ timestamp: string; description: string; useCase: string }>;
      };

      const video: VideoFinding = {
        url: parsed.url,
        title: parsed.title,
        summary: parsed.overallSummary || "",
        techniques: (parsed.keyTechniques || []).map((item) => item.technique),
        mistakes: (parsed.commonMistakesShown || []).map((item) => item.mistake),
        bestMoments: (parsed.bestMomentsForReference || []).map((moment) => ({
          timestamp: moment.timestamp,
          description: moment.description,
          useCase: moment.useCase,
        })),
      };

      videos.push(video);
      sources.push({
        type: "youtube",
        title: parsed.title,
        url: parsed.url,
        summary: parsed.overallSummary || "",
      });
    } catch {
      // Skip malformed video analyses.
    }
  }

  return { videos, sources };
}

export async function synthesizeResearchModel(
  brief: ResearchBrief,
  webFindings: WebFinding[],
  videoFindings: VideoFinding[]
): Promise<SkillResearchModel> {
  if (!process.env.GEMINI_API_KEY) {
    return buildFallbackResearchModel(brief, webFindings, videoFindings);
  }

  const ai = getAI();
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: `You are synthesizing bounded research into a structured coaching research model.

Research brief:
${JSON.stringify(brief, null, 2)}

Web findings:
${JSON.stringify(webFindings, null, 2)}

Video findings:
${JSON.stringify(videoFindings, null, 2)}

Return ONLY valid JSON with this shape:
{
  "metadata": {
    "skill": "${brief.skill}",
    "goal": "${brief.goal}",
    "level": "${brief.level}",
    "createdAt": "${new Date().toISOString()}"
  },
  "learnerProfile": ${JSON.stringify(brief.learnerProfile)},
  "properForm": { "aspect": "observable description" },
  "commonMistakes": [
    {
      "issue": "observable issue",
      "severity": "high|medium|low",
      "correction": "specific correction",
      "reference": { "url": "...", "timestamp": "MM:SS" }
    }
  ],
  "progressionOrder": ["step"],
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
  }]
}

Rules:
- Use only evidence present in the findings.
- Proper form and mistakes must be observable from a camera where possible.
- Session plan must reflect the learner profile and goal.
- Keep it structured and implementation-ready.`,
    config: {
      responseMimeType: "application/json",
    },
  });

  return JSON.parse(response.text || "{}") as SkillResearchModel;
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

export async function persistResearchWorkspace(
  researchModel: SkillResearchModel,
  clarificationQuestions: ClarificationQuestion[],
  auth?: any
): Promise<{ rootFolderUrl: string; researchDocUrl: string; progressDocUrl: string }> {
  const slug = slugify(researchModel.metadata.skill);
  const rootFolder = await createDriveFolder(`Glitch Research - ${slug}`, undefined, auth);
  const researchFolder = await createDriveFolder("Research", rootFolder.id, auth);
  const progressFolder = await createDriveFolder("Progress", rootFolder.id, auth);

  const researchBlocks = buildResearchDocBlocks(researchModel, clarificationQuestions);
  const progressBlocks = buildProgressDocBlocks(researchModel);

  const researchDoc = await createStructuredDoc(
    `${researchModel.metadata.skill} Research`,
    researchBlocks,
    auth,
    researchFolder.id
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
  };
}

function buildResearchDocBlocks(
  researchModel: SkillResearchModel,
  clarificationQuestions: ClarificationQuestion[]
): StructuredDocBlock[] {
  return [
    { type: "title", text: `${researchModel.metadata.skill} Research` },
    {
      type: "paragraph",
      text: `Goal: ${researchModel.metadata.goal}. Level: ${researchModel.metadata.level}.`,
    },
    { type: "heading1", text: "Learner Profile" },
    {
      type: "bullets",
      items: [
        `Learning style: ${researchModel.learnerProfile.preferences.learningStyle}`,
        `Coaching tone: ${researchModel.learnerProfile.preferences.coachingTone}`,
        `Pacing: ${researchModel.learnerProfile.preferences.pacingPreference}`,
        `Success criteria: ${researchModel.learnerProfile.successCriteria}`,
      ],
    },
    { type: "heading1", text: "Clarification Questions" },
    {
      type: "bullets",
      items: clarificationQuestions.length > 0
        ? clarificationQuestions.map((question) => `${question.question} (${question.reason})`)
        : ["No clarification questions were required for this research run."],
    },
    { type: "heading1", text: "Proper Form" },
    {
      type: "bullets",
      items: Object.entries(researchModel.properForm).map(([key, value]) => `${key}: ${value}`),
    },
    { type: "heading1", text: "Common Mistakes" },
    {
      type: "bullets",
      items: researchModel.commonMistakes.map(
        (mistake) => `[${mistake.severity.toUpperCase()}] ${mistake.issue} -> ${mistake.correction}`
      ),
    },
    { type: "heading1", text: "Progression Order" },
    {
      type: "bullets",
      items: researchModel.progressionOrder,
    },
    { type: "heading1", text: "Safety Considerations" },
    {
      type: "bullets",
      items: researchModel.safetyConsiderations,
    },
    { type: "heading1", text: "Sources" },
    {
      type: "bullets",
      items: [
        ...researchModel.webSources.map((source) => `${source.title}: ${source.url}`),
        ...researchModel.videoSources.map((source) => `${source.title}: ${source.url}`),
      ],
    },
  ];
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
  videoFindings: VideoFinding[]
): SkillResearchModel {
  return {
    metadata: {
      skill: brief.skill,
      goal: brief.goal,
      level: brief.level,
      createdAt: new Date().toISOString(),
    },
    learnerProfile: brief.learnerProfile,
    properForm: {
      setup: `Controlled, observable form for ${brief.skill}.`,
    },
    commonMistakes: [],
    progressionOrder: webFindings.flatMap((finding) => finding.progressionSteps).slice(0, 5),
    safetyConsiderations: webFindings.flatMap((finding) => finding.safetyNotes).slice(0, 5),
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
    webSources: webFindings.map((finding) => ({
      type: "web",
      title: finding.title,
      url: finding.url,
      summary: finding.summary,
    })),
    videoSources: videoFindings,
  };
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
