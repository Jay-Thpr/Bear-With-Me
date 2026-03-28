export interface SkillModel {
  metadata: {
    skill: string;
    goal: string;
    level: string;
    createdAt: string;
    illustration: string; // URL or base64 data URI, or "/fallback-skill-icon.png"
  };
  teachingStrategy: {
    approach: string;
    learningStyle: string;
    successCriteria: string;
    pacingNotes: string;
  };
  properForm: Record<string, string>; // { "grip": "thumb and index finger pinch the spine..." }
  commonMistakes: Array<{
    issue: string;          // observable description — what the camera sees
    severity: "high" | "medium" | "low";
    correction: string;     // specific fix action
    videoReference?: { url: string; timestamp: string };
  }>;
  progressionOrder: string[];
  safetyConsiderations: string[];
  videoReferences: Array<{
    url: string;
    title: string;
    bestMoments: Array<{
      timestamp: string;
      description: string;
      useCase: string; // "when to show this during live coaching"
    }>;
  }>;
  sessionPlan: {
    primaryFocus: string;
    secondaryFocus: string;
    warmupActivity: string;
    keyCheckpoints: string[];
    successIndicators: string[];
  };
  webSources: Array<{ title: string; url: string }>;
}

export interface UserModel {
  totalSessions: number;
  mastered: string[];
  improving: Array<{ area: string; trend: string }>;
  needsWork: Array<{ area: string; priority: number }>;
  preferences: {
    pushesBackOn: string[];
    respondsWellTo: string[];
    coachingStyle: string;
  };
}

export interface ResearchPipelineResult {
  skillModel: SkillModel;
  systemPrompt: string;
  illustrationUrl: string;
  docUrl: string | null;
  skillModelJson: string; // JSON.stringify(skillModel) — passed to WS server
}
