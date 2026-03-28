const apiBase = import.meta.env.VITE_API_URL ?? ''

export type AuthUser = {
  id: string
  email: string | null
  display_name: string
  picture: string | null
}

export type AuthMeResponse =
  | { authenticated: false }
  | { authenticated: true; user: AuthUser }

export async function fetchAuthMe(): Promise<AuthMeResponse> {
  const res = await fetch(`${apiBase}/api/auth/me`, { credentials: 'include' })
  if (!res.ok) {
    throw new Error(`Auth check failed: ${res.status}`)
  }
  return res.json() as Promise<AuthMeResponse>
}

function errorMessageFromResponse(res: Response, bodyText: string): string {
  try {
    const data = JSON.parse(bodyText) as { detail?: unknown }
    if (typeof data.detail === 'string') return data.detail
    if (data.detail !== undefined) return JSON.stringify(data.detail)
  } catch {
    /* ignore */
  }
  return bodyText || `Sign-in failed: ${res.status}`
}

export async function exchangeGoogleCode(code: string, state: string): Promise<void> {
  const res = await fetch(`${apiBase}/api/auth/google/exchange`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, state }),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(errorMessageFromResponse(res, text))
  }
}

export async function logoutSession(): Promise<void> {
  const res = await fetch(`${apiBase}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) {
    throw new Error(`Logout failed: ${res.status}`)
  }
}

/** Browser navigates to backend; must be same origin as the app (Vite proxy) or full API URL. */
export function googleLoginHref(): string {
  return `${apiBase}/api/auth/google`
}
