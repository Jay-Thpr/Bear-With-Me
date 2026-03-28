import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { completeSession, fetchLessonPlan, type LessonPlanOut } from '../api/skills'
import { useGeminiLiveSession } from '../hooks/useGeminiLiveSession'
import { useCameraStream } from '../hooks/useCameraStream'
import './Page.css'

function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const TIPS = [
  'Frame your hands and tool in the shot so the coach can see angles.',
  'If audio clips, move closer to the mic or reduce background noise.',
  'Use manual capture when you want a still annotated with form cues.',
]

type SessionLocation = { skillId?: string; skillTitle?: string }

const ACTIVE_SKILL_STORAGE_KEY = 'skillQuest.activeSkillId'
const ACTIVE_SKILL_TITLE_KEY = 'skillQuest.activeSkillTitle'

export function SessionPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const sessionNav = (location.state ?? null) as SessionLocation | null

  const storedIds = useMemo(() => {
    try {
      return {
        skillId: sessionStorage.getItem(ACTIVE_SKILL_STORAGE_KEY) ?? undefined,
        skillTitle: sessionStorage.getItem(ACTIVE_SKILL_TITLE_KEY) ?? undefined,
      }
    } catch {
      return { skillId: undefined, skillTitle: undefined }
    }
  }, [])

  const skillId =
    sessionNav?.skillId ?? storedIds.skillId
  const skillTitle =
    sessionNav?.skillTitle ?? storedIds.skillTitle ?? 'Your skill'

  useEffect(() => {
    if (sessionNav?.skillId) {
      try {
        sessionStorage.setItem(ACTIVE_SKILL_STORAGE_KEY, sessionNav.skillId)
      } catch {
        /* ignore */
      }
    }
    if (sessionNav?.skillTitle) {
      try {
        sessionStorage.setItem(ACTIVE_SKILL_TITLE_KEY, sessionNav.skillTitle)
      } catch {
        /* ignore */
      }
    }
  }, [sessionNav?.skillId, sessionNav?.skillTitle])
  // Fetch real lesson plan checkpoints for this skill
  useEffect(() => {
    if (!skillId) return
    let cancelled = false
    fetchLessonPlan(skillId)
      .then((plan) => { if (!cancelled) setLessonPlan(plan) })
      .catch(() => { if (!cancelled) setLessonPlanError(true) })
    return () => { cancelled = true }
  }, [skillId])

  const { videoRef, mediaStream, status, errorMessage, start, stop, isLive } =
    useCameraStream({ audio: true })
  const [lessonPlan, setLessonPlan] = useState<LessonPlanOut | null>(null)
  const [lessonPlanError, setLessonPlanError] = useState(false)
  const [videoFrameReady, setVideoFrameReady] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  /** Same as `elapsed` but survives `stop()` / `isLive` resetting state before `completeSession` runs. */
  const elapsedRef = useRef(0)

  const {
    coachPhase,
    coachError,
    userCaption,
    modelCaption,
    connectCoach,
    disconnectCoach,
    correctionImageUrl,
    correctionNotes,
    annotationBusy,
    runManualFormCorrection,
    clearCorrection,
  } = useGeminiLiveSession(videoRef, { skillId, skillTitle })

  const coachBusy = coachPhase === 'connecting' || coachPhase === 'live'

  useEffect(() => {
    if (!isLive && coachBusy) {
      void disconnectCoach()
    }
  }, [isLive, coachBusy, disconnectCoach])

  useEffect(() => {
    if (!isLive) {
      startTransition(() => {
        setVideoFrameReady(false)
        setElapsed(0)
        elapsedRef.current = 0
      })
    }
  }, [isLive])

  useEffect(() => {
    if (!isLive) return
    const id = window.setInterval(() => {
      setElapsed((n) => {
        const next = n + 1
        elapsedRef.current = next
        return next
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [isLive])

  const handleEndSession = () => {
    void (async () => {
      const durationSec = Math.max(0, elapsedRef.current)
      await disconnectCoach()
      stop()
      const notes = [userCaption, modelCaption].filter(Boolean).join('\n\n').trim() || null
      if (skillId && durationSec > 0) {
        try {
          const result = await completeSession(skillId, {
            duration_seconds: durationSec,
            session_notes: notes,
          })
          navigate('/level-up', {
            state: {
              durationSec,
              skillLabel: skillTitle,
              skillId,
              coach_note: result.coach_note,
              level_ups: result.level_ups,
              progress_delta: result.progress_delta,
              mastered_delta: result.mastered_delta,
              skill: result.skill,
            },
          })
          return
        } catch (e) {
          console.error(e)
          navigate('/level-up', {
            state: {
              durationSec,
              skillLabel: skillTitle,
              skillId,
              sessionError: e instanceof Error ? e.message : 'Could not save session.',
            },
          })
          return
        }
      }
      navigate('/level-up', {
        state: {
          durationSec,
          skillLabel: skillTitle,
          skillId,
          sessionError:
            skillId && durationSec === 0
              ? 'Session was too short to record.'
              : !skillId
                ? 'No skill selected — open the dashboard from a skill first.'
                : undefined,
        },
      })
    })()
  }

  const phaseCurrent = coachPhase === 'live' ? 4 : coachPhase === 'connecting' ? 3 : 2

  return (
    <div className="page page--session">
      <p className="page__lead">
        Start your camera, connect to Gemini Live, and practice with spoken feedback.
        The coach can request annotated stills, or you can capture manually.
      </p>

      <div className="session-shell">
        <header className="session-header">
          <div>
            <h2 className="page__title page__title--sm" style={{ margin: 0 }}>
              Live coaching — {skillTitle}
            </h2>
            <p className="session-header__meta">
              {coachPhase === 'live' && 'Coach connected — stay in frame and describe what you are practicing.'}
              {coachPhase === 'connecting' && 'Opening realtime session…'}
              {coachPhase === 'off' && 'Camera and mic stay local until you connect.'}
              {coachPhase === 'error' && 'Coach connection hit an error; try again after checking the network.'}
            </p>
          </div>
          <div className="session-header__right">
            <div className="session-timer" aria-live="polite">
              {formatClock(elapsed)}
            </div>
            <button type="button" className="btn btn--ghost" onClick={handleEndSession}>
              End session
            </button>
          </div>
        </header>

        <div
          className={`session-main-grid${
            correctionImageUrl ? ' session-main-grid--annotated' : ''
          }`}
        >
          {correctionImageUrl ? (
            <section className="session-annotation-panel" aria-label="Annotated still">
              <div className="session-annotation-panel__head">
                <span className="session-annotation-panel__title">Guidance still</span>
                <button
                  type="button"
                  className="btn btn--ghost session-annotation-panel__close"
                  onClick={clearCorrection}
                >
                  Close
                </button>
              </div>
              <div className="session-annotation-panel__body">
                <img
                  src={correctionImageUrl}
                  alt="Model-annotated form correction"
                  className="session-annotation-panel__img"
                />
                {correctionNotes ? (
                  <p className="session-annotation-panel__notes">{correctionNotes}</p>
                ) : null}
              </div>
            </section>
          ) : null}
          <div
            className={`session-video-card${
              correctionImageUrl ? ' session-video-card--compact' : ''
            }`}
          >
            {isLive && (
              <div className="session-rec-badge">
                <span className="session-rec-badge__dot" aria-hidden />
                <span>Live</span>
              </div>
            )}
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
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget
                  setVideoFrameReady(v.videoWidth > 0)
                }}
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
              {isLive && (
                <div className="session-coach-strip">
                  <p className="session-coach-strip__title">Coach</p>
                  <p className="session-coach-strip__text">
                    {modelCaption || 'Listening — keep practicing and narrate what you are trying.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="session-columns">
          <div className="session-side-panel">
            <h3 className="session-side-panel__title">
              {lessonPlan ? 'Checkpoints' : 'Session progress'}
            </h3>
            {!lessonPlan && lessonPlanError && (
              <p style={{ margin: '0 0 0.6rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                ℹ️ Custom lesson plan unavailable, using generic checkpoints
              </p>
            )}
            {lessonPlan ? (
              <>
                {lessonPlan.lesson_plan.tone ? (
                  <p style={{ margin: '0 0 0.6rem', fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Coach tone: {lessonPlan.lesson_plan.tone}
                  </p>
                ) : null}
                <ol className="session-phase-list">
                  {lessonPlan.lesson_plan.checkpoints.map((cp, idx) => (
                    <li key={cp.id} className="session-phase">
                      <span className="session-phase__idx">{idx + 1}</span>
                      <span>{cp.goal}</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <ol className="session-phase-list">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((step) => {
                  const done = step < phaseCurrent
                  const current = step === phaseCurrent
                  return (
                    <li
                      key={step}
                      className={`session-phase${done ? ' session-phase--done' : ''}${
                        current ? ' session-phase--current' : ''
                      }`}
                    >
                      <span className="session-phase__idx">{done ? '✓' : step}</span>
                      <span>Checkpoint {step}</span>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>

          <div className="session-side-panel">
            <h3 className="session-side-panel__title">Current focus</h3>
            {userCaption ? (
              <p style={{ margin: 0, fontWeight: 600, color: '#5a8068' }}>You said</p>
            ) : null}
            {userCaption ? (
              <p style={{ margin: '0.35rem 0 0.85rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                {userCaption}
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Your latest transcript will appear here after the coach processes audio.
              </p>
            )}
            <ul className="session-focus-list">
              <li>Keep the skill target visible in frame.</li>
              <li>Mention constraints like tempo, safety, or gear.</li>
              <li>Ask explicitly if you want a form check.</li>
            </ul>
          </div>

          <div className="session-side-panel session-side-panel--blue">
            <h3 className="session-side-panel__title">Controls &amp; tips</h3>
            <p className="session-live__security">
              The long-lived key stays on the server; the UI requests a{' '}
              <a
                href="https://ai.google.dev/gemini-api/docs/ephemeral-tokens"
                target="_blank"
                rel="noreferrer"
              >
                short-lived Live token
              </a>{' '}
              from <code>POST /api/live/ephemeral-token</code> before opening the WebSocket.
            </p>
            <p className="panel__meta" aria-live="polite">
              Coach:{' '}
              {coachPhase === 'off' && 'disconnected'}
              {coachPhase === 'connecting' && 'connecting…'}
              {coachPhase === 'live' && 'connected'}
              {coachPhase === 'error' && 'error'}
            </p>
            {coachError ? <p className="session-camera__error">{coachError}</p> : null}
            {TIPS.map((tip) => (
              <p key={tip} className="session-tip">
                <svg
                  className="session-tip__icon"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M22 12h-4l-3 9L9 3l-3 9H2"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>{tip}</span>
              </p>
            ))}
            <div className="session-camera__actions" style={{ marginTop: '0.75rem' }}>
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
              {status === 'error' ? (
                <button type="button" className="btn btn--primary" onClick={() => void start()}>
                  Try again
                </button>
              ) : null}
              {isLive && mediaStream ? (
                <>
                  {!coachBusy ? (
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => {
                        const el = videoRef.current
                        void connectCoach(mediaStream, el, {
                          skillId,
                          skillTitle,
                        })
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
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={annotationBusy || !videoFrameReady}
                    onClick={() => void runManualFormCorrection()}
                    title="Uses the current video frame"
                  >
                    {annotationBusy ? 'Annotating…' : 'Capture & annotate'}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
