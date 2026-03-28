import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  disconnectGoogleIntegration,
  fetchAuthMe,
  logoutSession,
  type GoogleIntegrationStatus,
  type AuthUser,
} from '../api/auth'

type AuthContextValue = {
  user: AuthUser | null
  googleIntegration: GoogleIntegrationStatus | null
  loading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
  disconnectGoogle: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [googleIntegration, setGoogleIntegration] =
    useState<GoogleIntegrationStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await fetchAuthMe()
      setUser(data.authenticated ? data.user : null)
      setGoogleIntegration(data.authenticated ? data.googleIntegration : null)
    } catch {
      setUser(null)
      setGoogleIntegration(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchAuthMe()
      .then((data) => {
        if (!cancelled) {
          setUser(data.authenticated ? data.user : null)
          setGoogleIntegration(data.authenticated ? data.googleIntegration : null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null)
          setGoogleIntegration(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const logout = useCallback(async () => {
    await logoutSession()
    setUser(null)
    setGoogleIntegration(null)
  }, [])

  const disconnectGoogle = useCallback(async () => {
    await disconnectGoogleIntegration()
    setGoogleIntegration({
      connected: false,
      provider: 'google',
      hasRefreshToken: false,
      grantedScopes: [],
      photosAppendOnlyGranted: false,
      photosAppReadGranted: false,
      driveFileGranted: false,
      calendarEventsGranted: false,
      documentsGranted: false,
    })
  }, [])

  const value = useMemo(
    () => ({ user, googleIntegration, loading, refresh, logout, disconnectGoogle }),
    [user, googleIntegration, loading, refresh, logout, disconnectGoogle],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Hook is intentionally co-located with the provider for this small app.
// eslint-disable-next-line react-refresh/only-export-components -- useAuth is the public API
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
