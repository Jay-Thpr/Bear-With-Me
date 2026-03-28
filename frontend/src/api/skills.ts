const apiBase = import.meta.env.VITE_API_URL ?? ''

export type SkillOut = {
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

export type ResearchOut = {
  id: string
  skill_id: string
  title: string | null
  content: string
  extra: Record<string, unknown> | null
  created_at: string
}

export type SkillWithResearchResponse = {
  skill: SkillOut
  research: ResearchOut
}

export type SkillCreateWithResearchBody = {
  title: string
  goal: string
  level: string
  category?: string | null
}

export type SessionCompleteBody = {
  duration_seconds: number
  session_notes?: string | null
}

export type SkillSessionSummaryOut = {
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

export type SessionCompleteResponse = {
  skill: SkillOut
  coach_note: string
  progress_delta: number
  level_ups: number
  mastered_delta: number
  session_summary: SkillSessionSummaryOut
  docs_export_url: string | null
}

export type ProgressEventOut = {
  id: string
  skill_id: string
  kind: string
  label: string | null
  detail: Record<string, unknown> | null
  metric_value: number | null
  created_at: string
}

/** Skill + latest research + recent progress for Live system instructions. */
export type LiveCoachContext = {
  skill: SkillOut
  research: ResearchOut | null
  progress_events: ProgressEventOut[]
}

export async function fetchSkills(): Promise<SkillOut[]> {
  const res = await fetch(`${apiBase}/api/skills`)
  if (!res.ok) {
    throw new Error(`Failed to load skills: ${res.status}`)
  }
  const data = (await res.json()) as { skills: SkillOut[] }
  return data.skills
}

export async function fetchSkill(skillId: string): Promise<SkillOut> {
  const res = await fetch(`${apiBase}/api/skills/${encodeURIComponent(skillId)}`)
  if (!res.ok) {
    throw new Error(`Failed to load skill: ${res.status}`)
  }
  return res.json() as Promise<SkillOut>
}

export async function fetchLiveCoachContext(skillId: string): Promise<LiveCoachContext> {
  const res = await fetch(
    `${apiBase}/api/skills/${encodeURIComponent(skillId)}/live-coach-context`,
  )
  if (!res.ok) {
    throw new Error(`Failed to load coach context: ${res.status}`)
  }
  return res.json() as Promise<LiveCoachContext>
}

function errorFromResponse(res: Response, bodyText: string): string {
  try {
    const data = JSON.parse(bodyText) as { detail?: unknown }
    if (typeof data.detail === 'string') return data.detail
  } catch {
    /* ignore */
  }
  return bodyText || `Request failed: ${res.status}`
}

export async function createSkillWithResearch(
  body: SkillCreateWithResearchBody,
): Promise<SkillWithResearchResponse> {
  const res = await fetch(`${apiBase}/api/skills/create-with-research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(errorFromResponse(res, text))
  }
  return JSON.parse(text) as SkillWithResearchResponse
}

export async function completeSession(
  skillId: string,
  body: SessionCompleteBody,
): Promise<SessionCompleteResponse> {
  const res = await fetch(
    `${apiBase}/api/skills/${encodeURIComponent(skillId)}/complete-session`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  const text = await res.text()
  if (!res.ok) {
    throw new Error(errorFromResponse(res, text))
  }
  return JSON.parse(text) as SessionCompleteResponse
}
