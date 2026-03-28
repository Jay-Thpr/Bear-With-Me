import {
  completeMockGoogleSignIn,
  disconnectMockGoogleIntegration,
  getMockAuthMe,
  getMockAuthStatus,
  logoutMockSession,
} from '../walkthrough/mockBackend'
import { isWalkthroughMode, walkthroughHref } from '../walkthrough/mode'

const apiBase = import.meta.env.VITE_API_URL ?? ''

export type AuthUser = {
  id: string
  email: string | null
  display_name: string
  picture: string | null
}

export type GoogleIntegrationStatus = {
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

export type AuthMeResponse =
  | { authenticated: false }
  | {
      authenticated: true
      user: AuthUser
      googleIntegration: GoogleIntegrationStatus
    }

export type AuthStatusResponse = {
  status: string
  googleOAuthConfigured: boolean
  googleIntegration: GoogleIntegrationStatus
}

export async function fetchAuthMe(): Promise<AuthMeResponse> {
  if (isWalkthroughMode()) {
    return getMockAuthMe()
  }
  const res = await fetch(`${apiBase}/api/auth/me`, { credentials: 'include' })
  if (!res.ok) {
    throw new Error(`Auth check failed: ${res.status}`)
  }
  return res.json() as Promise<AuthMeResponse>
}

export async function fetchAuthStatus(): Promise<AuthStatusResponse> {
  if (isWalkthroughMode()) {
    return getMockAuthStatus()
  }
  const res = await fetch(`${apiBase}/api/auth/status`, { credentials: 'include' })
  if (!res.ok) {
    throw new Error(`Auth status failed: ${res.status}`)
  }
  return res.json() as Promise<AuthStatusResponse>
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
  if (isWalkthroughMode()) {
    void code
    void state
    completeMockGoogleSignIn()
    return
  }
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
  if (isWalkthroughMode()) {
    logoutMockSession()
    return
  }
  const res = await fetch(`${apiBase}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) {
    throw new Error(`Logout failed: ${res.status}`)
  }
}

export async function disconnectGoogleIntegration(): Promise<void> {
  if (isWalkthroughMode()) {
    disconnectMockGoogleIntegration()
    return
  }
  const res = await fetch(`${apiBase}/api/auth/google/disconnect`, {
    method: 'POST',
    credentials: 'include',
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(errorMessageFromResponse(res, text))
  }
}

/** Browser navigates to backend; must be same origin as the app (Vite proxy) or full API URL. */
export function googleLoginHref(): string {
  if (isWalkthroughMode()) {
    return walkthroughHref('/auth/callback?code=walkthrough-code&state=walkthrough-state')
  }
  return `${apiBase}/api/auth/google`
}
