import { GoogleGenAI } from "@google/genai";
import { buildDiscoveryPrompt, buildAnalysisPrompt, buildSynthesisPrompt } from "../prompts/skill-research";

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

/**
 * Step 2: Analyze tutorial video content for coaching data.
 * Passes YouTube URLs directly as fileData.fileUri — no download needed for public videos.
 * Skips URLs that Gemini cannot access (private/unlisted videos).
 *
 * TODO: set GEMINI_API_KEY in .env.local
 * TODO: Implement real Gemini call here — returns mock data for now
 */
export async function analyzeSkillVideos(skill: string, urls: string[]): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    console.log("[gemini] No API key — returning mock analysis for", skill);
    return `Mock analysis for "${skill}": proper form requires focus on fundamentals, avoiding common mistakes, and progressive skill building.`;
  }

  if (urls.length === 0) {
    throw new Error("No video URLs to analyze");
  }

  const ai = getAI();

  // Build video content parts — wrap each in try to handle access errors gracefully
  const videoContents = urls.slice(0, 5).map((url) => ({
    fileData: { fileUri: url },
  }));

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      ...videoContents,
      { text: buildAnalysisPrompt(skill) },
    ],
  });

  const text = response.text ?? "";
  if (!text) throw new Error("Gemini returned empty analysis — check video access and API key");
  return text;
}

/**
 * Step 3: Synthesize raw analysis into a clean structured skill document.
 * Output is plain text with ALL CAPS section headers for writing to Google Docs.
 *
 * TODO: set GEMINI_API_KEY in .env.local
 * TODO: Implement real Gemini call here — returns mock data for now
 */
export async function synthesizeSkillDoc(skill: string, rawAnalysis: string): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    console.log("[gemini] No API key — returning mock skill doc for", skill);
    return `SKILL: ${skill.toUpperCase()}

PROPER FORM
- Focus on fundamentals and body positioning
- Maintain consistent technique throughout
- Build muscle memory through deliberate repetition

COMMON MISTAKES
1. Rushing progression before fundamentals are solid
2. Inconsistent practice schedule
3. Ignoring feedback and self-correction

PROGRESSION STEPS
1. Learn basic stance and grip
2. Practice core movement patterns slowly
3. Increase speed and complexity gradually
4. Apply in real scenarios with feedback

KEY MOMENTS
- Start each session reviewing form basics
- Record yourself to catch mistakes you can't feel
- Rest and recovery are part of skill building`;
  }

  const ai = getAI();

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: buildSynthesisPrompt(skill, rawAnalysis),
  });

  const text = response.text ?? "";
  if (!text) throw new Error("Gemini returned empty synthesis");
  return text;
}
