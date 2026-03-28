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
  level: string
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    return `{"fundamentals":"Core technique for ${skill}","properForm":{},"commonMistakes":[],"progressionSteps":[],"safetyConsiderations":[],"sources":[]}`;
  }

  const ai = getAI();

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: `Research how to coach someone in "${skill}", goal: "${goal}", level: ${level}.

Use Google Search to find:
1. Core technique fundamentals
2. Proper form — OBSERVABLE descriptions only (what a camera can see: body parts, angles, positions)
3. Common mistakes (observable) and their corrections
4. Progression order (4-6 stages)
5. Safety considerations

Return ONLY valid JSON:
{
  "fundamentals": "2-3 sentence overview",
  "properForm": { "aspect_name": "precise observable description" },
  "commonMistakes": [{ "issue": "observable description", "severity": "high|medium|low", "correction": "specific fix" }],
  "progressionSteps": ["step 1", "step 2"],
  "safetyConsiderations": ["..."],
  "sources": [{ "title": "...", "url": "..." }]
}`,
    config: {
      responseMimeType: "application/json",
      tools: [{ googleSearch: {} }],
    },
  });

  // Augment sources with grounding metadata
  const text = response.text || "";
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

Extract:
1. KEY TECHNIQUES: Each distinct technique shown. Include timestamp (MM:SS), description of proper form, visual cues for what correct looks like
2. COMMON MISTAKES: If instructor shows/discusses mistakes — timestamp, mistake description, correction
3. BEST MOMENTS: 2-3 moments ideal for showing a student during live coaching ("pause, watch this part")

Return ONLY valid JSON:
{
  "url": "${videoUrl}",
  "title": "video title",
  "overallSummary": "2-3 sentences",
  "keyTechniques": [{ "technique": "name", "timestamp": "MM:SS", "description": "proper form", "visualCues": "what to look for" }],
  "commonMistakesShown": [{ "mistake": "description", "timestamp": "MM:SS", "correction": "fix" }],
  "bestMomentsForReference": [{ "timestamp": "MM:SS", "description": "what is shown", "useCase": "when to show this during coaching" }]
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
  if (!process.env.GEMINI_API_KEY) {
    return "/fallback-skill-icon.png";
  }

  try {
    const ai = getAI();

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-04-17", // Nano Banana image gen model
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
    console.error("[gemini] Illustration generation failed:", err);
    return "/fallback-skill-icon.png"; // Never block the pipeline
  }
}
