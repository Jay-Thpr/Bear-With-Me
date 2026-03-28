import { useEffect } from 'react'
import { useGeminiLiveSession } from '../hooks/useGeminiLiveSession'
import { useCameraStream } from '../hooks/useCameraStream'
import './Page.css'

export function SessionPage() {
  const { videoRef, mediaStream, status, errorMessage, start, stop, isLive } =
    useCameraStream({ audio: true })

  const {
    coachPhase,
    coachError,
    userCaption,
    modelCaption,
    connectCoach,
    disconnectCoach,
  } = useGeminiLiveSession()

  const coachBusy = coachPhase === 'connecting' || coachPhase === 'live'

  useEffect(() => {
    if (!isLive && coachBusy) {
      void disconnectCoach()
    }
  }, [isLive, coachBusy, disconnectCoach])

  return (
    <div className="page">
      <h1 className="page__title page__title--sm">Live coaching</h1>
      <p className="page__lead">
        Start your camera, then connect to Gemini Live. Your mic and about one
        frame per second of video are sent to the model; spoken replies play
        through your speakers.
      </p>
      <div className="session-placeholder">
        <div
          className={`session-placeholder__frame session-placeholder__frame--camera ${
            isLive ? 'session-placeholder__frame--live' : ''
          }`}
        >
          <video
            ref={videoRef}
            className="session-camera"
            playsInline
            muted
            aria-label="Camera preview"
          />
          {status === 'off' && (
            <div className="session-camera__overlay">
              <span className="session-placeholder__label">Camera off</span>
            </div>
          )}
          {status === 'starting' && (
            <div className="session-camera__overlay">
              <span className="session-placeholder__label">Starting…</span>
            </div>
          )}
          {status === 'error' && errorMessage && (
            <div className="session-camera__overlay session-camera__overlay--error">
              <p className="session-camera__error">{errorMessage}</p>
            </div>
          )}
        </div>
        <div className="session-placeholder__sidebar">
          <p className="panel__body session-live__security">
            The long-lived key stays on the server; the UI requests a{' '}
            <a
              href="https://ai.google.dev/gemini-api/docs/ephemeral-tokens"
              target="_blank"
              rel="noreferrer"
            >
              short-lived Live token
            </a>{' '}
            from <code>POST /api/live/ephemeral-token</code> before opening the
            WebSocket.
          </p>
          <p className="panel__meta" aria-live="polite">
            Coach:{' '}
            {coachPhase === 'off' && 'disconnected'}
            {coachPhase === 'connecting' && 'connecting…'}
            {coachPhase === 'live' && 'connected'}
            {coachPhase === 'error' && 'error'}
          </p>
          {coachError && <p className="session-camera__error">{coachError}</p>}
          {(userCaption || modelCaption) && (
            <div className="session-live__captions">
              {userCaption && (
                <p className="session-live__caption">
                  <span className="session-live__caption-label">You</span>
                  {userCaption}
                </p>
              )}
              {modelCaption && (
                <p className="session-live__caption">
                  <span className="session-live__caption-label">Coach</span>
                  {modelCaption}
                </p>
              )}
            </div>
          )}
          <div className="session-camera__actions">
            {!isLive ? (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void start()}
                disabled={status === 'starting'}
              >
                {status === 'starting' ? 'Starting…' : 'Start camera & mic'}
              </button>
            ) : (
              <button type="button" className="btn btn--ghost" onClick={stop}>
                Stop camera
              </button>
            )}
            {status === 'error' && (
              <button type="button" className="btn btn--primary" onClick={() => void start()}>
                Try again
              </button>
            )}
            {isLive && mediaStream && (
              <>
                {!coachBusy ? (
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => {
                      const el = videoRef.current
                      void connectCoach(mediaStream, el)
                    }}
                  >
                    Connect AI coach
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => void disconnectCoach()}
                    disabled={coachPhase === 'connecting'}
                  >
                    {coachPhase === 'connecting' ? 'Connecting…' : 'Disconnect coach'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
