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

export interface ResearchIntakeDraft {
  skill?: string;
  goal?: string;
  level?: SkillLevel;
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
  domain?: string;
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
  relevance?: string;
  confidence?: "high" | "medium" | "low";
  fallback?: boolean;
}

export interface WebFinding {
  category?: string;
  title: string;
  url: string;
  summary: string;
  evidenceUnits?: ResearchEvidenceUnit[];
  beginnerPrinciples: string[];
  prerequisites: string[];
  properForm: string[];
  commonMistakes: string[];
  progressionSteps: string[];
  drills: string[];
  safetyNotes: string[];
  openQuestions?: string[];
  contradictions?: string[];
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
  likelyCause?: string;
  coachingCue?: string;
  drill?: string;
  reference?: {
    url: string;
    timestamp?: string;
  };
}

export interface SkillSubskill {
  name: string;
  purpose: string;
  observableSuccessSignals: string[];
  prerequisiteFor: string[];
}

export interface PracticeDrill {
  name: string;
  objective: string;
  steps: string[];
  successSignals: string[];
  commonErrors: string[];
  recommendedDuration: string;
}

export interface TechniqueDiagnostic {
  issue: string;
  likelyCause: string;
  correctionCue: string;
  recommendedDrill?: string;
}

export interface TutorialMoment {
  url: string;
  title: string;
  timestamp: string;
  focus: string;
  observableCue: string;
  useCase: string;
}

export interface ResearchClaimCoverage {
  claim: string;
  sources: Array<{
    type: "web" | "youtube";
    title: string;
    url: string;
    timestamp?: string;
  }>;
}

export interface EvidenceSourceRef {
  type: "web" | "youtube";
  title: string;
  url: string;
  timestamp?: string;
}

export interface ResearchEvidenceUnit {
  type:
    | "proper_form"
    | "mistake"
    | "mistake_cause"
    | "drill"
    | "progression"
    | "safety"
    | "coaching_cue"
    | "tutorial"
    | "source_claim";
  label: string;
  detail: string;
  observableCue?: string;
  likelyCause?: string;
  correctionCue?: string;
  relatedDrill?: string;
  stage?: string;
  readyToAdvance?: string;
  beginnerUsefulness?: number;
  specificity?: number;
  observability?: number;
  sourceConfidence?: "high" | "medium" | "low";
  discarded?: boolean;
  discardReason?: string;
  sourceRefs: EvidenceSourceRef[];
}

export interface EvidenceQualityMetrics {
  specificity: number;
  observability: number;
  coachingUsefulness: number;
  beginnerRelevance: number;
  sourceConfidence: number;
  total: number;
}

export interface ProperFormSignal {
  aspect: string;
  observableCue: string;
  whyItMatters: string;
  sourceRefs: EvidenceSourceRef[];
}

export interface ProgressionStage {
  name: string;
  prerequisite: string;
  stageGoal: string;
  successCriteria: string[];
  commonBlockers: string[];
  recommendedDrills: string[];
  readyToAdvance: string;
}

export interface TutorialReference {
  title: string;
  url: string;
  summary: string;
  category: "overview" | "drill" | "troubleshooting" | "reinforcement";
  useCases: string[];
}

export interface ResearchQualityReport {
  score: number;
  missingSections: string[];
  repairedSections: string[];
  gateFailures: string[];
  evidenceCounts: Record<string, number>;
  discardedEvidenceCount: number;
  notes: string[];
}

export interface SkillResearchModel {
  metadata: {
    skill: string;
    goal: string;
    level: SkillLevel;
    domain?: string;
    createdAt: string;
  };
  learnerProfile: LearnerProfile;
  evidenceCollection: {
    units: ResearchEvidenceUnit[];
  };
  researchQuality: ResearchQualityReport;
  prerequisites: string[];
  skillDecomposition: SkillSubskill[];
  progressionStages: ProgressionStage[];
  properFormSignals: ProperFormSignal[];
  properForm: Record<string, string>;
  commonMistakes: ResearchMistake[];
  progressionOrder: string[];
  beginnerDrills: PracticeDrill[];
  diagnostics: TechniqueDiagnostic[];
  coachingCues: string[];
  tutorialMoments: TutorialMoment[];
  tutorialLibrary: TutorialReference[];
  qualityChecklist: string[];
  sourceCoverage: ResearchClaimCoverage[];
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
  openQuestions: string[];
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
  researchLogTabId?: string;
  liveResearchTabId?: string;
  finalResearchTabId?: string;
  progressDocId?: string;
  progressDocUrl?: string;
}

export interface ResearchRunState {
  stage: string;
  completed?: boolean;
  skill: string;
  goal?: string;
  level?: SkillLevel;
  domain?: string;
  learnerProfile?: LearnerProfile;
  priorityAreas?: string[];
  sourceCount?: number;
  tutorialReferenceCount?: number;
  evidenceCounts?: Record<string, number>;
  discardedEvidenceCount?: number;
  gateFailures?: string[];
  properFormSignals?: string[];
  commonMistakes?: string[];
  drills?: string[];
  progression?: string[];
  openQuestions?: string[];
  contradictions?: string[];
  passSummaries?: Array<{
    focus: string;
    status: "fulfilled" | "rejected" | "fallback";
    durationMs?: number;
    findings?: number;
    discarded?: number;
    reason?: string;
  }>;
  notes?: string[];
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
