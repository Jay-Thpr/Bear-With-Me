export type SkillLevel = "beginner" | "intermediate" | "advanced";

export interface ResearchIntakeInput {
  skill: string;
  goal: string;
  level: SkillLevel;
  preferences?: string;
  constraints?: string;
  environment?: string;
  equipment?: string[];
}

export interface LearnerProfile {
  skill: string;
  goal: string;
  level: SkillLevel;
  preferences: {
    learningStyle: string;
    coachingTone: string;
    pacingPreference: string;
  };
  constraints: {
    timeAvailable: string;
    equipment: string[];
    environment: string;
    physicalConstraints?: string[];
  };
  successCriteria: string;
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  type: "multiple_choice" | "free_text";
  options?: string[];
  reason: string;
}

export interface ClarificationAnswer {
  questionId: string;
  answer: string;
}

export interface ClarificationRound {
  questions: ClarificationQuestion[];
  answers: ClarificationAnswer[];
}

export interface ResearchBrief {
  skill: string;
  goal: string;
  level: SkillLevel;
  learnerProfile: LearnerProfile;
  priorityAreas: string[];
  sourceSelectionGuidance: string[];
  teachingImplications: string[];
  successCriteria: string;
}

export interface ResearchSource {
  type: "web" | "youtube";
  title: string;
  url: string;
  summary: string;
}

export interface WebFinding {
  title: string;
  url: string;
  summary: string;
  properForm: string[];
  commonMistakes: string[];
  progressionSteps: string[];
  safetyNotes: string[];
}

export interface VideoFindingMoment {
  timestamp: string;
  description: string;
  useCase: string;
}

export interface VideoFinding {
  url: string;
  title: string;
  summary: string;
  techniques: string[];
  mistakes: string[];
  bestMoments: VideoFindingMoment[];
}

export interface ResearchEvidence {
  webFindings: WebFinding[];
  videoFindings: VideoFinding[];
  sources: ResearchSource[];
}

export interface ResearchMistake {
  issue: string;
  severity: "high" | "medium" | "low";
  correction: string;
  reference?: {
    url: string;
    timestamp?: string;
  };
}

export interface SkillResearchModel {
  metadata: {
    skill: string;
    goal: string;
    level: SkillLevel;
    createdAt: string;
  };
  learnerProfile: LearnerProfile;
  properForm: Record<string, string>;
  commonMistakes: ResearchMistake[];
  progressionOrder: string[];
  safetyConsiderations: string[];
  coachingStrategy: {
    approach: string;
    pacing: string;
    escalationNotes: string;
  };
  sessionPlan: {
    primaryFocus: string;
    secondaryFocus: string;
    checkpoints: string[];
  };
  webSources: ResearchSource[];
  videoSources: VideoFinding[];
}

export interface ResearchDocRefs {
  rootFolderId?: string;
  rootFolderUrl?: string;
  researchFolderId?: string;
  researchFolderUrl?: string;
  progressFolderId?: string;
  progressFolderUrl?: string;
  researchDocId?: string;
  researchDocUrl?: string;
  progressDocId?: string;
  progressDocUrl?: string;
}

export interface CachedResearchRecord {
  cacheKey: string;
  learnerProfile: LearnerProfile;
  researchBrief: ResearchBrief;
  evidence: ResearchEvidence;
  model: SkillResearchModel;
  docs?: ResearchDocRefs;
  createdAt: string;
  updatedAt: string;
}
