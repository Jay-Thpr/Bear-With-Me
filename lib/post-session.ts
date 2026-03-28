import { GoogleGenAI } from "@google/genai";

const GEMINI_MODEL = "gemini-2.5-flash";

interface SessionObservation {
  tier: number;
  description: string;
  timestamp: string;
}

export interface SessionSummary {
  skill: string;
  sessionNumber: number;
  date: string;
  duration: string;
  whatWeFocused: string[];
  whatImproved: Array<{ area: string; evidence: string }>;
  needsWork: Array<{ area: string; priority: "high" | "medium" | "low" }>;
  skillsMastered: number;
  recommendedNextFocus: string;
  coachingNotes: string;
  updatedUserModel: {
    mastered: string[];
    improving: Array<{ area: string; trend: string }>;
    needsWork: Array<{ area: string; priority: number }>;
  };
}

function getAI() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not set");
  }

  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

export async function generateSessionSummary(
  skill: string,
  sessionNumber: number,
  skillModelJson: string,
  observations: SessionObservation[],
  skillStatuses: Record<string, string>
): Promise<SessionSummary> {
  if (!process.env.GEMINI_API_KEY || observations.length === 0) {
    return buildFallbackSummary(skill, sessionNumber, skillStatuses);
  }

  const ai = getAI();
  const obsText = observations
    .map((observation) => `[Tier ${observation.tier}] ${observation.timestamp} - ${observation.description}`)
    .join("\n");
  const statusText = Object.entries(skillStatuses)
    .map(([area, status]) => `${area}: ${status}`)
    .join(", ");

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: `You are generating a post-session coaching report.

SKILL: ${skill}
SESSION: #${sessionNumber}
DATE: ${new Date().toLocaleDateString()}

SKILL MODEL (what we were aiming for):
${skillModelJson}

COACHING OBSERVATIONS FROM THIS SESSION (${observations.length} total):
${obsText}

SKILL STATUS UPDATES:
${statusText || "none recorded"}

Analyze the session and generate a structured summary. Look for:
- What the coach focused on most (highest-tier interventions, repeated corrections)
- What showed improvement (Tier 1 acknowledgments, status changed to "improving" or "mastered")
- What still needs work (repeated Tier 2-3 corrections without status improvement)
- The single most important thing to focus on next session

Return ONLY valid JSON:
{
  "whatWeFocused": ["focus area 1", "focus area 2"],
  "whatImproved": [{ "area": "skill area", "evidence": "specific observation that shows improvement" }],
  "needsWork": [{ "area": "skill area", "priority": "high|medium|low" }],
  "skillsMastered": 0,
  "recommendedNextFocus": "single most important thing for next session",
  "coachingNotes": "1-2 sentences about this student's progress and tendencies",
  "updatedUserModel": {
    "mastered": ["area that is now mastered"],
    "improving": [{ "area": "...", "trend": "improving" }],
    "needsWork": [{ "area": "...", "priority": 1 }]
  }
}`,
    config: {
      responseMimeType: "application/json",
    },
  });

  const parsed = JSON.parse(response.text ?? "{}") as Omit<SessionSummary, "skill" | "sessionNumber" | "date" | "duration">;

  return {
    skill,
    sessionNumber,
    date: new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    duration: `${Math.ceil(observations.length * 0.5)} min`,
    ...parsed,
  };
}

export function buildFallbackSummary(
  skill: string,
  sessionNumber: number,
  skillStatuses: Record<string, string>
): SessionSummary {
  const mastered = Object.entries(skillStatuses)
    .filter(([, status]) => status === "mastered")
    .map(([area]) => area);

  return {
    skill,
    sessionNumber,
    date: new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    duration: "~10 min",
    whatWeFocused: ["Fundamental technique", "Proper form"],
    whatImproved: [
      {
        area: "Overall technique",
        evidence: "Consistent improvement throughout session",
      },
    ],
    needsWork: [{ area: "Advanced technique", priority: "medium" }],
    skillsMastered: mastered.length,
    recommendedNextFocus: "Continue practicing core fundamentals with focus on consistency",
    coachingNotes: "Good session. Keep practicing regularly.",
    updatedUserModel: {
      mastered,
      improving: [],
      needsWork: [],
    },
  };
}
