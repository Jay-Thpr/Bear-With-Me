const apiBase = import.meta.env.VITE_API_URL ?? ''

export type LiveEphemeralTokenResponse = {
  accessToken: string
  liveModel: string
}

export async function fetchLiveEphemeralToken(): Promise<LiveEphemeralTokenResponse> {
  const res = await fetch(`${apiBase}/api/live/ephemeral-token`, {
    method: 'POST',
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
