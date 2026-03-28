import { setWalkthroughMode } from './mode'

const STORAGE_KEY = 'skillQuest.walkthroughState.v1'

type MockAuthUser = {
  id: string
  email: string | null
  display_name: string
  picture: string | null
}

type MockGoogleIntegration = {
  connected: boolean
  provider: string
  hasRefreshToken: boolean
  grantedScopes: string[]
  photosAppendOnlyGranted: boolean
  photosAppReadGranted: boolean
  driveFileGranted: boolean
  calendarEventsGranted: boolean
  documentsGranted: boolean
}

type MockSkill = {
  id: string
  title: string
  notes: string | null
  context: Record<string, unknown> | null
  stats_sessions: number
  stats_practice_seconds: number
  stats_level: number
  stats_progress_percent: number
  stats_mastered: number
  stats_day_streak: number
  last_practice_at: string | null
  created_at: string
  updated_at: string
}

type MockResearch = {
  id: string
  skill_id: string
  title: string | null
  content: string
  extra: Record<string, unknown> | null
  created_at: string
}

type MockCheckpoint = {
  id: number
  goal: string
  confirm_strategy: string
}

type MockLessonPlanOut = {
  skill_id: string
  source_research_id: string | null
  lesson_plan: {
    coaching_mode: string
    sensory_cues: string[]
    safety_flags: string[]
    checkpoints: MockCheckpoint[]
    common_mistakes: string[]
    tone: string
  }
}

type MockSessionSummary = {
  id: string
  skill_id: string
  session_number: number
  duration_seconds: number
  summary_text: string
  coach_note: string | null
  progress_delta: number
  level_ups: number
  mastered_delta: number
  input_notes: string | null
  extra: Record<string, unknown> | null
  created_at: string
}

type WalkthroughState = {
  authUser: MockAuthUser | null
  googleIntegration: MockGoogleIntegration
  skills: MockSkill[]
  research: MockResearch[]
  lessonPlans: MockLessonPlanOut[]
  summaries: MockSessionSummary[]
}

function nowIso(): string {
  return new Date().toISOString()
}

function id(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function defaultGoogleIntegration(): MockGoogleIntegration {
  return {
    connected: false,
    provider: 'google',
    hasRefreshToken: false,
    grantedScopes: [],
    photosAppendOnlyGranted: false,
    photosAppReadGranted: false,
    driveFileGranted: false,
    calendarEventsGranted: false,
    documentsGranted: false,
  }
}

function seedState(): WalkthroughState {
  const created_at = nowIso()
  const skillId = 'walkthrough-knife-skills'
  const researchId = 'walkthrough-research-knife-skills'
  const skill: MockSkill = {
    id: skillId,
    title: 'Knife skills',
    notes: 'Goal: Dice vegetables evenly and safely',
    context: {
      goal: 'Dice vegetables evenly and safely',
      level: 'Beginner',
      category: 'cooking',
    },
    stats_sessions: 2,
    stats_practice_seconds: 1500,
    stats_level: 1,
    stats_progress_percent: 42,
    stats_mastered: 1,
    stats_day_streak: 3,
    last_practice_at: created_at,
    created_at,
    updated_at: created_at,
  }
  const lessonPlan: MockLessonPlanOut = {
    skill_id: skillId,
    source_research_id: researchId,
    lesson_plan: {
      coaching_mode: 'hands-on',
      sensory_cues: ['sound of the blade', 'contact with the board'],
      safety_flags: ['curl fingertips', 'keep the board stable'],
      checkpoints: [
        {
          id: 1,
          goal: 'Set up a stable board and safe stance',
          confirm_strategy: 'Learner shows a non-slip board setup and square shoulders.',
        },
        {
          id: 2,
          goal: 'Use a pinch grip and claw hand at slow speed',
          confirm_strategy: 'Learner performs five slow cuts without flattening fingers.',
        },
        {
          id: 3,
          goal: 'Cut uniform slices and turn them into even dice',
          confirm_strategy: 'Learner makes a short row of pieces with visibly similar size.',
        },
      ],
      common_mistakes: ['hammer grip', 'lifting fingertips', 'sawing motion'],
      tone: 'patient and practical',
    },
  }
  const research: MockResearch = {
    id: researchId,
    skill_id: skillId,
    title: 'Research dossier: Knife skills',
    content:
      'Core concepts: stable board, pinch grip, claw hand, consistent slice width. Practice design: slow controlled reps before speed.',
    extra: {
      lesson_plan: lessonPlan.lesson_plan,
      model: 'walkthrough',
    },
    created_at,
  }
  const summary: MockSessionSummary = {
    id: id('summary'),
    skill_id: skillId,
    session_number: 2,
    duration_seconds: 720,
    summary_text:
      'You kept the board stable and your pinch grip was more consistent. Next time focus on matching slice width before you speed up.',
    coach_note:
      'Good progress on setup and grip. Stay slower when turning slices into dice so the width stays even.',
    progress_delta: 18,
    level_ups: 0,
    mastered_delta: 0,
    input_notes: 'Felt more comfortable with the claw hand today.',
    extra: { walkthrough: true },
    created_at,
  }
  return {
    authUser: {
      id: 'walkthrough-user',
      email: 'walkthrough@example.com',
      display_name: 'Walkthrough User',
      picture: null,
    },
    googleIntegration: {
      connected: true,
      provider: 'google',
      hasRefreshToken: true,
      grantedScopes: [
        'https://www.googleapis.com/auth/photoslibrary.appendonly',
        'https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/documents',
      ],
      photosAppendOnlyGranted: true,
      photosAppReadGranted: true,
      driveFileGranted: true,
      calendarEventsGranted: true,
      documentsGranted: true,
    },
    skills: [skill],
    research: [research],
    lessonPlans: [lessonPlan],
    summaries: [summary],
  }
}

function loadState(): WalkthroughState {
  if (typeof window === 'undefined') {
    return seedState()
  }
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    const seeded = seedState()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded))
    return seeded
  }
  try {
    return JSON.parse(raw) as WalkthroughState
  } catch {
    const seeded = seedState()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded))
    return seeded
  }
}

function saveState(state: WalkthroughState): WalkthroughState {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }
  return state
}

export function getMockHealth() {
  setWalkthroughMode(true)
  return { status: 'ok' }
}

export function getMockAuthMe() {
  const state = loadState()
  if (!state.authUser) {
    return { authenticated: false as const }
  }
  return {
    authenticated: true as const,
    user: state.authUser,
    googleIntegration: state.googleIntegration,
  }
}

export function getMockAuthStatus() {
  const state = loadState()
  return {
    status: 'ready',
    googleOAuthConfigured: true,
    googleIntegration: state.googleIntegration,
  }
}

export function completeMockGoogleSignIn(): void {
  const state = loadState()
  state.authUser = {
    id: 'walkthrough-user',
    email: 'walkthrough@example.com',
    display_name: 'Walkthrough User',
    picture: null,
  }
  state.googleIntegration = {
    connected: true,
    provider: 'google',
    hasRefreshToken: true,
    grantedScopes: [
      'https://www.googleapis.com/auth/photoslibrary.appendonly',
      'https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/documents',
    ],
    photosAppendOnlyGranted: true,
    photosAppReadGranted: true,
    driveFileGranted: true,
    calendarEventsGranted: true,
    documentsGranted: true,
  }
  setWalkthroughMode(true)
  saveState(state)
}

export function logoutMockSession(): void {
  const state = loadState()
  state.authUser = null
  saveState(state)
}

export function disconnectMockGoogleIntegration(): void {
  const state = loadState()
  state.googleIntegration = defaultGoogleIntegration()
  saveState(state)
}

export function getMockSkills(): MockSkill[] {
  return loadState().skills
}

export function getMockSkill(skillId: string): MockSkill {
  const skill = loadState().skills.find((item) => item.id === skillId)
  if (!skill) {
    throw new Error('Skill not found in walkthrough data.')
  }
  return skill
}

function buildLessonPlanForSkill(skill: MockSkill): MockLessonPlanOut {
  const goal = String(skill.context?.goal ?? skill.notes ?? skill.title)
  return {
    skill_id: skill.id,
    source_research_id: id('research'),
    lesson_plan: {
      coaching_mode: 'hands-on',
      sensory_cues: ['visual alignment', 'controlled rhythm'],
      safety_flags: ['stay in control', 'use safe setup'],
      checkpoints: [
        {
          id: 1,
          goal: `Show the basic setup for ${skill.title}`,
          confirm_strategy: 'Learner demonstrates the starting position slowly and clearly.',
        },
        {
          id: 2,
          goal: 'Perform one clean repetition with control',
          confirm_strategy: 'Coach sees one full rep without rushing or losing form.',
        },
        {
          id: 3,
          goal: `Repeat with consistency toward: ${goal}`,
          confirm_strategy: 'Learner completes three steady reps in a row.',
        },
      ],
      common_mistakes: ['rushing the movement', 'forgetting setup', 'inconsistent pace'],
      tone: 'encouraging and direct',
    },
  }
}

export function createMockSkill(body: {
  title: string
  goal: string
  level: string
  category?: string | null
}) {
  const state = loadState()
  const now = nowIso()
  const skillId = id('skill')
  const skill: MockSkill = {
    id: skillId,
    title: body.title.trim(),
    notes: `Goal: ${body.goal.trim()}`,
    context: {
      goal: body.goal.trim(),
      level: body.level.trim(),
      category: body.category ?? null,
    },
    stats_sessions: 0,
    stats_practice_seconds: 0,
    stats_level: body.level.toLowerCase().includes('advanced')
      ? 3
      : body.level.toLowerCase().includes('intermediate')
        ? 2
        : 1,
    stats_progress_percent: 0,
    stats_mastered: 0,
    stats_day_streak: 0,
    last_practice_at: null,
    created_at: now,
    updated_at: now,
  }
  const lessonPlan = buildLessonPlanForSkill(skill)
  const research: MockResearch = {
    id: lessonPlan.source_research_id || id('research'),
    skill_id: skillId,
    title: `Research dossier: ${skill.title}`,
    content: `${skill.title} walkthrough research. Focus on ${body.goal.trim()}. Beginner coaching should prioritize one correction at a time.`,
    extra: {
      lesson_plan: lessonPlan.lesson_plan,
      model: 'walkthrough',
    },
    created_at: now,
  }
  state.skills.unshift(skill)
  state.lessonPlans.unshift(lessonPlan)
  state.research.unshift(research)
  saveState(state)
  return { skill, research }
}

export function getMockLessonPlan(skillId: string): MockLessonPlanOut {
  const plan = loadState().lessonPlans.find((item) => item.skill_id === skillId)
  if (!plan) {
    throw new Error('No walkthrough lesson plan exists for this skill.')
  }
  return plan
}

export function completeMockSession(
  skillId: string,
  body: { duration_seconds: number; session_notes?: string | null },
) {
  const state = loadState()
  const skillIndex = state.skills.findIndex((item) => item.id === skillId)
  if (skillIndex === -1) {
    throw new Error('Skill not found in walkthrough data.')
  }
  const skill = { ...state.skills[skillIndex] }
  const nextSessions = skill.stats_sessions + 1
  const progressDelta = 14
  const masteredDelta = nextSessions % 3 === 0 ? 1 : 0
  let levelUps = 0
  let nextProgress = skill.stats_progress_percent + progressDelta
  while (nextProgress >= 100) {
    nextProgress -= 100
    levelUps += 1
  }
  skill.stats_sessions = nextSessions
  skill.stats_practice_seconds += body.duration_seconds
  skill.stats_progress_percent = nextProgress
  skill.stats_level += levelUps
  skill.stats_mastered += masteredDelta
  skill.stats_day_streak = Math.max(1, skill.stats_day_streak + 1)
  skill.last_practice_at = nowIso()
  skill.updated_at = nowIso()
  state.skills[skillIndex] = skill

  const summary: MockSessionSummary = {
    id: id('summary'),
    skill_id: skillId,
    session_number: nextSessions,
    duration_seconds: body.duration_seconds,
    summary_text: `Walkthrough session ${nextSessions}: strong effort on ${skill.title}. You kept the pace controlled and responded well to corrections.`,
    coach_note: `Stay with checkpoint ${Math.min(3, nextSessions + 1)} next time and clean up one detail before speeding up.`,
    progress_delta: progressDelta,
    level_ups: levelUps,
    mastered_delta: masteredDelta,
    input_notes: body.session_notes ?? null,
    extra: { walkthrough: true },
    created_at: nowIso(),
  }
  state.summaries.unshift(summary)
  saveState(state)

  return {
    skill,
    coach_note: summary.coach_note || '',
    progress_delta: progressDelta,
    level_ups: levelUps,
    mastered_delta: masteredDelta,
    session_summary: summary,
    docs_export_url: null,
  }
}

export function getMockRecentSessions(limit = 10): MockSessionSummary[] {
  return loadState().summaries.slice(0, limit)
}

export function requestMockAnnotation(body: {
  imageBase64: string
  focus?: string
  coachingHint?: string
}) {
  const focus = body.focus ? `Focus: ${body.focus}. ` : ''
  const hint = body.coachingHint?.trim()
    ? `Coach note: ${body.coachingHint.trim().slice(0, 120)}`
    : 'Coach note: keep one correction at a time.'
  return {
    imageBase64: body.imageBase64,
    mimeType: 'image/jpeg',
    notes: `${focus}${hint} This is a walkthrough annotation preview, so the original still is echoed back without server markup.`,
  }
}
