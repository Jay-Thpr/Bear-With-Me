import { isWalkthroughMode } from '../walkthrough/mode'

const apiBase = import.meta.env.VITE_API_URL ?? ''

export type LiveEphemeralTokenResponse = {
  accessToken: string
  liveModel: string
  systemInstruction: string
  liveContextVersion: string
  sourceResearchId: string | null
  sourceProgressEventIds: string[]
  truncated: boolean
}

export async function fetchLiveEphemeralToken(
  skillId?: string,
): Promise<LiveEphemeralTokenResponse> {
  if (isWalkthroughMode()) {
    return {
      accessToken: 'walkthrough-token',
      liveModel: 'walkthrough-live',
      systemInstruction: `Walkthrough mode is active. Coach the learner on ${skillId ?? 'their skill'} with short, proactive guidance and move through checkpoints one at a time.`,
      liveContextVersion: 'walkthrough',
      sourceResearchId: null,
      sourceProgressEventIds: [],
      truncated: false,
    }
  }
  const res = await fetch(`${apiBase}/api/live/ephemeral-token`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(skillId ? { skill_id: skillId } : {}),
  })
  const text = await res.text()
  if (!res.ok) {
    let detail = text
    try {
      const body = JSON.parse(text) as { detail?: unknown }
      if (typeof body.detail === 'string') {
        detail = body.detail
      }
    } catch {
      /* use raw text */
    }
    throw new Error(detail || `Ephemeral token request failed (${res.status})`)
  }
  return JSON.parse(text) as LiveEphemeralTokenResponse
}
