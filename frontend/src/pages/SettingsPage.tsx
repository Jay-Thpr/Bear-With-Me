import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAuthStatus, googleLoginHref } from '../api/auth'
import { useAuth } from '../auth/AuthContext'
import './Page.css'

const PHOTOS_APPEND_SCOPE = 'https://www.googleapis.com/auth/photoslibrary.appendonly'
const PHOTOS_READ_SCOPE = 'https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata'
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const CALENDAR_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const DOCUMENTS_SCOPE = 'https://www.googleapis.com/auth/documents'

export function SettingsPage() {
  const { user, googleIntegration, loading, disconnectGoogle } = useAuth()
  const [googleOAuthConfigured, setGoogleOAuthConfigured] = useState<boolean | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [disconnectError, setDisconnectError] = useState<string | null>(null)
  const [disconnectBusy, setDisconnectBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchAuthStatus()
      .then((status) => {
        if (!cancelled) {
          setGoogleOAuthConfigured(status.googleOAuthConfigured)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setStatusError(e instanceof Error ? e.message : 'Could not load integration status.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleDisconnect = async () => {
    setDisconnectBusy(true)
    setDisconnectError(null)
    try {
      await disconnectGoogle()
    } catch (e) {
      setDisconnectError(e instanceof Error ? e.message : 'Could not disconnect Google.')
    } finally {
      setDisconnectBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="page">
        <p className="page__lead">Loading settings…</p>
      </div>
    )
  }

  const integration = googleIntegration
  const grantedScopes = integration?.grantedScopes ?? []
  const photosAccess = integration
    ? integration.photosAppendOnlyGranted || integration.photosAppReadGranted
    : false
  const driveAccess = integration?.driveFileGranted ?? false
  const calendarAccess = integration?.calendarEventsGranted ?? false
  const docsAccess = integration?.documentsGranted ?? false

  // Detect missing scopes that are now required
  const missingScopes: string[] = []
  if (integration?.connected) {
    if (!driveAccess) missingScopes.push('Drive')
    if (!calendarAccess) missingScopes.push('Calendar')
    if (!docsAccess) missingScopes.push('Docs')
  }
  const hasUpgradeAvailable = missingScopes.length > 0

  return (
    <div className="page settings">
      <div className="settings__header">
        <div>
          <p className="page__kicker">Account</p>
          <h1 className="page__title">Google integration</h1>
          <p className="page__lead">
            Manage the Google session tied to coaching, Photos uploads, and any future Google
            surfaces.
          </p>
        </div>
        <Link to="/" className="btn btn--ghost">
          Back home
        </Link>
      </div>

      {statusError ? <p className="settings__notice settings__notice--error">{statusError}</p> : null}
      {disconnectError ? (
        <p className="settings__notice settings__notice--error">{disconnectError}</p>
      ) : null}

      {hasUpgradeAvailable && (
        <div className="settings__notice settings__notice--info" style={{ marginBottom: '1.5rem' }}>
          <strong style={{ display: 'block', marginBottom: '0.4rem' }}>🎉 New features available!</strong>
          <p style={{ margin: '0 0 0.75rem' }}>
            Reconnect your Google account to enable {missingScopes.join(', ')} integration for enhanced features:
          </p>
          <ul style={{ margin: '0 0 0.75rem', paddingLeft: '1.25rem' }}>
            {!driveAccess && <li>Save session summaries and resources to your Drive</li>}
            {!calendarAccess && <li>Schedule practice sessions and reminders in Calendar</li>}
            {!docsAccess && <li>Export structured coaching notes to Google Docs</li>}
          </ul>
          <a className="btn btn--primary" href={googleLoginHref()} style={{ marginTop: '0.5rem' }}>
            Reconnect to enable all features
          </a>
        </div>
      )}

      <section className="settings__grid">
        <article className="settings-card">
          <h2 className="settings-card__title">Signed-in account</h2>
          {user ? (
            <div className="settings-card__account">
              {user.picture ? (
                <img className="settings-card__avatar" src={user.picture} alt="" width={56} height={56} />
              ) : null}
              <div>
                <div className="settings-card__name">{user.display_name}</div>
                <div className="settings-card__meta">{user.email ?? 'No email returned from Google'}</div>
              </div>
            </div>
          ) : (
            <p className="settings-card__meta">No Google session is active.</p>
          )}
        </article>

        <article className="settings-card">
          <h2 className="settings-card__title">Google integration</h2>
          <div className="settings-card__rows">
            <div className="settings-card__row">
              <span>Status</span>
              <strong>{integration?.connected ? 'Connected' : 'Disconnected'}</strong>
            </div>
            <div className="settings-card__row">
              <span>Refresh token</span>
              <strong>{integration?.hasRefreshToken ? 'Present' : 'Missing'}</strong>
            </div>
            <div className="settings-card__row">
              <span>Photos access</span>
              <strong>{photosAccess ? 'Enabled' : 'Disabled'}</strong>
            </div>
            <div className="settings-card__row">
              <span>Drive access</span>
              <strong>{driveAccess ? 'Enabled' : 'Disabled'}</strong>
            </div>
            <div className="settings-card__row">
              <span>Calendar access</span>
              <strong>{calendarAccess ? 'Enabled' : 'Disabled'}</strong>
            </div>
            <div className="settings-card__row">
              <span>Docs access</span>
              <strong>{docsAccess ? 'Enabled' : 'Disabled'}</strong>
            </div>
            <div className="settings-card__row">
              <span>Configured in backend</span>
              <strong>
                {googleOAuthConfigured === null
                  ? 'Checking'
                  : googleOAuthConfigured
                    ? 'Yes'
                    : 'No'}
              </strong>
            </div>
          </div>

          <div className="settings-card__chips" aria-label="Granted scopes">
            {grantedScopes.length ? (
              grantedScopes.map((scope) => (
                <span key={scope} className="settings-chip">
                  {scope === PHOTOS_APPEND_SCOPE
                    ? 'Photos append-only'
                    : scope === PHOTOS_READ_SCOPE
                      ? 'Photos read-app-created'
                      : scope === DRIVE_FILE_SCOPE
                        ? 'Drive (app files)'
                        : scope === CALENDAR_EVENTS_SCOPE
                          ? 'Calendar events'
                          : scope === DOCUMENTS_SCOPE
                            ? 'Google Docs'
                            : scope}
                </span>
              ))
            ) : (
              <span className="settings-chip settings-chip--muted">No scopes granted</span>
            )}
          </div>

          <div className="settings-card__actions">
            <a className="btn btn--primary" href={googleLoginHref()}>
              Reconnect Google
            </a>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => void handleDisconnect()}
              disabled={!integration?.connected || disconnectBusy}
            >
              {disconnectBusy ? 'Disconnecting…' : 'Disconnect Google'}
            </button>
          </div>

          {!googleOAuthConfigured ? (
            <p className="settings-card__meta">
              Google OAuth is not configured on the backend yet.
            </p>
          ) : null}
          {integration?.connected ? null : (
            <p className="settings-card__meta">
              Sign back in with Google to restore Photos uploads and any stored access.
            </p>
          )}
        </article>
      </section>
    </div>
  )
}
