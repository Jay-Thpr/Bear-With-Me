import { GoogleGenAI } from "@google/genai";
import { buildDiscoveryPrompt } from "../prompts/skill-research";
import type { SkillModel } from "./types";

// Single source of truth for model name — update here if model changes
// Previous 2.0 model is deprecated (March 2026) and shut down June 1, 2026
export const GEMINI_MODEL = "gemini-2.5-flash";

function getAI() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function extractJsonPayload(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    return trimmed.slice(objectStart, objectEnd + 1);
  }

  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return trimmed.slice(arrayStart, arrayEnd + 1);
  }

  return trimmed;
}

/**
 * Step 1: Find YouTube tutorial URLs via Gemini search grounding.
 * Uses the googleSearch tool — Gemini handles search intent and ranking.
 * Falls back to searchYouTubeTutorials() (YouTube Data API) if < 3 YouTube URLs are found.
 *
 * TODO: set GEMINI_API_KEY in .env.local
 * TODO: Implement real Gemini call here — returns mock data for now
 */
export async function findTutorialUrls(skill: string): Promise<string[]> {
  if (!process.env.GEMINI_API_KEY) {
    console.log("[gemini] No API key — returning mock URLs for", skill);
    return [
      "https://www.youtube.com/watch?v=mock1",
      "https://www.youtube.com/watch?v=mock2",
      "https://www.youtube.com/watch?v=mock3",
    ];
  }

  const ai = getAI();

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    config: {
      tools: [{ googleSearch: {} }],
    },
    contents: buildDiscoveryPrompt(skill),
  });

  // Extract YouTube URLs from grounding metadata
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const youtubeUrls = chunks
    .map((c: any) => c.web?.uri as string)
    .filter(
      (url: string) => url?.includes("youtube.com/watch") || url?.includes("youtu.be/")
    )
    .slice(0, 5);

  // Fallback: if grounding returned < 3 YouTube URLs, supplement with YouTube Data API
  if (youtubeUrls.length < 3 && process.env.YOUTUBE_API_KEY) {
    const { searchYouTubeTutorials } = await import("./youtube");
    const fallbackUrls = await searchYouTubeTutorials(skill);
    const combined = [...new Set([...youtubeUrls, ...fallbackUrls])].slice(0, 5);
    return combined;
  }

  return youtubeUrls;
}

export async function conductWebResearch(
  skill: string,
  goal: string,
  level: string,
  focus = "overall technique"
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    return JSON.stringify({
      focus,
      fundamentals: `Fallback grounded coaching evidence for ${skill} at ${level} level.`,
      prerequisites: [
        `Understand basic setup and equipment handling for ${skill}`,
        `Practice with slow, deliberate repetitions before chasing speed`,
      ],
      findings: [
        {
          type: "proper_form",
          label: "Controlled starting position",
          detail: `The learner sets up in a balanced, repeatable starting position before each ${skill} attempt.`,
          observableCue: "Body position is stable and reset before each rep",
          beginnerUsefulness: 5,
          specificity: 4,
          observability: 5,
          sourceConfidence: "medium",
        },
        {
          type: "proper_form",
          label: "Consistent object path",
          detail: `The visible path of the movement stays repeatable instead of drifting between repetitions.`,
          observableCue: "Movement path stays centered and repeatable",
          beginnerUsefulness: 5,
          specificity: 4,
          observability: 5,
          sourceConfidence: "medium",
        },
        {
          type: "mistake",
          label: "Rushing the repetition",
          detail: "The learner speeds up as soon as the pattern starts to work, which breaks consistency.",
          observableCue: "Tempo suddenly increases and form becomes erratic",
          likelyCause: "Beginners try to skip the controlled rhythm-building phase",
          correctionCue: "Slow it down and keep the same rhythm",
          relatedDrill: "Slow controlled reps",
          beginnerUsefulness: 5,
          specificity: 4,
          observability: 4,
          sourceConfidence: "medium",
        },
        {
          type: "mistake",
          label: "Overcorrecting after an error",
          detail: "The learner adds an extra large correction after a miss instead of resetting.",
          observableCue: "Recovery movement becomes larger than the original mistake",
          likelyCause: "The learner tries to save the rep instead of resetting cleanly",
          correctionCue: "Reset cleanly, then restart the pattern",
          relatedDrill: "Pause and reset drill",
          beginnerUsefulness: 4,
          specificity: 4,
          observability: 4,
          sourceConfidence: "medium",
        },
        {
          type: "drill",
          label: "Slow controlled reps",
          detail: `Practice ${skill} at a deliberately slow pace with one cue in mind.`,
          relatedDrill: "Slow controlled reps",
          beginnerUsefulness: 5,
          specificity: 4,
          observability: 3,
          sourceConfidence: "medium",
        },
        {
          type: "drill",
          label: "Pause and reset drill",
          detail: "Pause after each attempt, rebuild the setup, then restart with the same cue.",
          relatedDrill: "Pause and reset drill",
          beginnerUsefulness: 4,
          specificity: 4,
          observability: 3,
          sourceConfidence: "medium",
        },
        {
          type: "progression",
          label: "Build setup and rhythm first",
          detail: `Start by making the setup and rhythm repeatable before combining the full ${goal}.`,
          stage: "Setup and rhythm",
          readyToAdvance: "The learner can repeat the setup consistently without rushing",
          beginnerUsefulness: 5,
          specificity: 4,
          observability: 4,
          sourceConfidence: "medium",
        },
        {
          type: "progression",
          label: "Layer in the full pattern gradually",
          detail: "Add complexity only after the simpler component is stable.",
          stage: "Pattern building",
          readyToAdvance: "The learner can sustain short consistent runs",
          beginnerUsefulness: 5,
          specificity: 4,
          observability: 4,
          sourceConfidence: "medium",
        },
        {
          type: "safety",
          label: "Use a clear practice area",
          detail: "Practice in a space with enough room to stop and reset safely.",
          beginnerUsefulness: 4,
          specificity: 3,
          observability: 3,
          sourceConfidence: "medium",
        },
        {
          type: "coaching_cue",
          label: "One cue at a time",
          detail: "Give one correction, then let the learner repeat several attempts before changing focus.",
          beginnerUsefulness: 5,
          specificity: 4,
          observability: 2,
          sourceConfidence: "medium",
        },
        {
          type: "source_claim",
          label: `${skill} should be learned through repeatable setup, visible consistency, and one-cue coaching`,
          detail: "Fallback source claim used for local development and structure testing.",
          beginnerUsefulness: 4,
          specificity: 4,
          observability: 2,
          sourceConfidence: "low",
        },
      ],
      openQuestions: [],
      contradictions: [],
      sources: [
        { title: `${skill} fallback coaching source`, url: "https://example.com/fallback-research" },
      ],
    });
  }

  const ai = getAI();

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: `Research how to coach someone in "${skill}", goal: "${goal}", level: ${level}.

Current retrieval focus: ${focus}

Use Google Search to find high-signal, practical material for this focus. Prioritize instructional sources, coaching material, and skill-specific teaching guidance that would help a real-time coaching system.

Extract atomic evidence units only. Prefer concrete beginner coaching evidence over summary prose.

Allowed evidence unit types:
- "proper_form"
- "mistake"
- "mistake_cause"
- "drill"
- "progression"
- "safety"
- "coaching_cue"
- "source_claim"

Scoring rules:
- Use 1-5 scales for beginnerUsefulness, specificity, and observability.
- Only use observability > 1 if the cue is visibly checkable from a camera.
- Set sourceConfidence to high, medium, or low.

For mistakes:
- make them observable
- include likelyCause when possible
- include correctionCue when possible
- include relatedDrill when possible

For progression:
- include stage and readyToAdvance when possible

Return ONLY valid JSON:
{
  "focus": "${focus}",
  "fundamentals": "1-2 sentence overview",
  "prerequisites": ["specific prerequisite"],
  "findings": [
    {
      "type": "proper_form",
      "label": "short label",
      "detail": "specific coaching-relevant detail",
      "observableCue": "what a camera should see if relevant",
      "likelyCause": "for mistakes only",
      "correctionCue": "short spoken cue if relevant",
      "relatedDrill": "specific drill if relevant",
      "stage": "progression stage if relevant",
      "readyToAdvance": "what success looks like before moving on",
      "beginnerUsefulness": 1,
      "specificity": 1,
      "observability": 1,
      "sourceConfidence": "high"
    }
  ],
  "openQuestions": ["uncertain area worth follow-up if evidence is conflicting or weak"],
  "contradictions": ["brief description of conflicting advice if present"],
  "sources": [{ "title": "...", "url": "..." }]
}`,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  // Augment sources with grounding metadata
  const text = extractJsonPayload(response.text || "");
  try {
    const result = JSON.parse(text);
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    if (chunks.length > 0) {
      result.sources = chunks
        .filter((c: any) => c.web?.uri)
        .map((c: any) => ({ title: c.web.title || c.web.uri, url: c.web.uri }));
    }
    return JSON.stringify(result);
  } catch {
    return text; // Pass raw text to synthesis step if parse fails
  }
}

// Single video analysis — called in parallel via Promise.allSettled
export async function analyzeYouTubeVideo(
  videoUrl: string,
  skill: string,
  goal: string
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    return `{"url":"${videoUrl}","title":"Mock Tutorial","overallSummary":"Mock analysis","keyTechniques":[],"commonMistakesShown":[],"bestMomentsForReference":[]}`;
  }

  const ai = getAI();

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      { fileData: { fileUri: videoUrl } },
      { text: `Analyze this tutorial video for coaching someone in "${skill}" with goal "${goal}".

Extract beginner-relevant coaching evidence:
1. KEY TECHNIQUES: Each distinct technique shown. Include timestamp (MM:SS), description of proper form, visual cues for what correct looks like
2. COMMON MISTAKES: If instructor shows/discusses mistakes — timestamp, mistake description, likely cause, correction cue, drill if mentioned
3. BEST MOMENTS: 3-5 moments ideal for showing a student during live coaching
4. BEGINNER DRILLS OR PROGRESSIONS explicitly demonstrated or described
5. PREREQUISITES or setup notes before attempting the full skill

Return ONLY valid JSON:
{
  "url": "${videoUrl}",
  "title": "video title",
  "overallSummary": "2-3 sentences",
  "keyTechniques": [{ "technique": "name", "timestamp": "MM:SS", "description": "proper form", "visualCues": "what to look for" }],
  "commonMistakesShown": [{ "mistake": "description", "timestamp": "MM:SS", "likelyCause": "why it happens", "correction": "fix", "coachingCue": "short spoken cue", "drill": "short drill" }],
  "bestMomentsForReference": [{ "timestamp": "MM:SS", "description": "what is shown", "observableCue": "what success looks like", "useCase": "when to show this during coaching" }],
  "beginnerDrills": ["specific drill"],
  "prerequisites": ["specific prerequisite"]
}` },
    ],
    config: { responseMimeType: "application/json" },
  });

  return response.text || "";
}

// Run all video analyses in parallel
export async function analyzeAllVideos(
  urls: string[],
  skill: string,
  goal: string,
  onVideoAnalyzed?: (title: string) => void
): Promise<string[]> {
  const results = await Promise.allSettled(
    urls.map(url => analyzeYouTubeVideo(url, skill, goal))
  );

  const analyses: string[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      try {
        const parsed = JSON.parse(result.value);
        onVideoAnalyzed?.(parsed.title || "unknown video");
        analyses.push(result.value);
      } catch {
        // Skip malformed responses
      }
    }
    // Silently skip rejected promises — don't fail the whole pipeline for one video
  }
  return analyses;
}

export async function synthesizeSkillModel(
  skill: string,
  goal: string,
  level: string,
  webResearch: string,        // raw JSON string from conductWebResearch (or empty string)
  videoAnalyses: string[],    // array of raw JSON strings from analyzeYouTubeVideo
  illustrationUrl: string
): Promise<SkillModel> {
  if (!process.env.GEMINI_API_KEY) {
    // Return demo model for dev
    const { default: demoDoc } = await import("../data/cooking-skill-demo.json");
    return demoDoc as unknown as SkillModel;
  }

  const ai = getAI();

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: `You are synthesizing research into a structured coaching plan for "${skill}".

GOAL: ${goal}
LEVEL: ${level}

WEB RESEARCH:
${webResearch || "Not available"}

VIDEO ANALYSES:
${videoAnalyses.join("\n\n---\n\n") || "Not available"}

Rules:
1. MERGE duplicate information from web + video sources
2. For each common mistake, if any video shows a correction, add videoReference with url + timestamp
3. All properForm descriptions must be OBSERVABLE from a camera (specific body parts, angles, positions)
4. sessionPlan must be tailored to this user's level and goal
5. Return ONLY valid JSON — no markdown, no extra text

Return a JSON object matching this exact shape:
{
  "metadata": { "skill": "${skill}", "goal": "${goal}", "level": "${level}", "createdAt": "${new Date().toISOString()}", "illustration": "${illustrationUrl}" },
  "teachingStrategy": { "approach": "...", "learningStyle": "...", "successCriteria": "...", "pacingNotes": "..." },
  "properForm": { "aspect_name": "precise observable description" },
  "commonMistakes": [{ "issue": "observable", "severity": "high|medium|low", "correction": "specific fix", "videoReference": { "url": "...", "timestamp": "MM:SS" } }],
  "progressionOrder": ["step 1", "step 2"],
  "safetyConsiderations": ["..."],
  "videoReferences": [{ "url": "...", "title": "...", "bestMoments": [{ "timestamp": "MM:SS", "description": "...", "useCase": "when to show this" }] }],
  "sessionPlan": { "primaryFocus": "...", "secondaryFocus": "...", "warmupActivity": "...", "keyCheckpoints": ["..."], "successIndicators": ["..."] },
  "webSources": [{ "title": "...", "url": "..." }]
}`,
    config: { responseMimeType: "application/json" },
  });

  const text = response.text || "";
  return JSON.parse(text) as SkillModel;
}

export async function generateSkillIllustration(skill: string): Promise<string> {
  const configuredImageModel = process.env.GEMINI_IMAGE_MODEL;

  if (!process.env.GEMINI_API_KEY || !configuredImageModel) {
    return "/fallback-skill-icon.png";
  }

  try {
    const ai = getAI();

    const response = await ai.models.generateContent({
      model: configuredImageModel,
      contents: `Create a minimal, stylized illustration for the skill: "${skill}".
- Square format, clean composition
- Warm inviting color palette, dark background
- No text in the image
- Show the essential visual element (hands, tools, body position)
- App icon aesthetic — not photorealistic`,
      config: {
        responseModalities: ["IMAGE", "TEXT"],
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    return "/fallback-skill-icon.png";
  } catch (err) {
    console.warn("[gemini] Illustration generation skipped or failed, using fallback icon.");
    return "/fallback-skill-icon.png"; // Never block the pipeline
  }
}
