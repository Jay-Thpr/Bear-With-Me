import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { exchangeGoogleCode } from '../api/auth'
import { useAuth } from '../auth/AuthContext'
import './Page.css'

export function AuthCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [exchangeError, setExchangeError] = useState<string | null>(null)

  const urlError = useMemo(() => {
    const err = params.get('error')
    if (err) {
      return err === 'access_denied'
        ? 'Sign-in was cancelled.'
        : `Google returned an error: ${err}`
    }
    const code = params.get('code')
    const state = params.get('state')
    if (!code || !state) {
      return 'Missing authorization code. Try signing in again.'
    }
    return null
  }, [params])

  const code = params.get('code')
  const state = params.get('state')

  useEffect(() => {
    if (urlError || !code || !state) return
    let cancelled = false
    void exchangeGoogleCode(code, state)
      .then(() => refresh())
      .then(() => {
        if (!cancelled) navigate('/', { replace: true })
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setExchangeError(
            e instanceof Error ? e.message : 'Could not complete sign-in.',
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [urlError, code, state, navigate, refresh])

  const error = urlError ?? exchangeError

  if (error) {
    return (
      <div className="page">
        <h1 className="page__title page__title--sm">Sign-in</h1>
        <p className="page__lead">{error}</p>
        <div className="page__actions">
          <Link to="/" className="btn btn--primary">
            Back home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <p className="page__lead">Completing sign-in…</p>
    </div>
  )
}
