import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'
import type { SkillOut } from '../api/skills'
import './Page.css'

/** Plain bear sprite — no volleyball; level-up is shown via pills and unlock copy only. */
const BEAR_AVATAR_SRC = '/bear-character.png'

type LevelUpState = {
  durationSec?: number
  skillLabel?: string
  skillId?: string
  coach_note?: string
  level_ups?: number
  progress_delta?: number
  mastered_delta?: number
  skill?: SkillOut
  sessionError?: string
}

const MOCK_SUMMARY =
  'You stayed in frame for most of the drill, kept a steady pace on the cuts, and responded quickly when the coach asked you to adjust your grip. Next time we can tighten the rhythm on the backhand slice.'

/** Served from `public/level_up_jingle.mp3` → URL `/level_up_jingle.mp3` */
const LEVEL_UP_JINGLE_SRC = '/level_up_jingle.mp3'

export function LevelUpPage() {
  const location = useLocation()
  const state = (location.state ?? {}) as LevelUpState
  const durationSec = state.durationSec ?? 0
  const skillLabel = state.skillLabel ?? 'Your skill'
  const skillId = state.skillId
  const skill = state.skill
  const levelUps = state.level_ups ?? 0
  const coachNote = state.coach_note
  const progressDelta = state.progress_delta
  const masteredDelta = state.mastered_delta
  const sessionError = state.sessionError

  const [notes, setNotes] = useState('')

  useEffect(() => {
    const el = new Audio(LEVEL_UP_JINGLE_SRC)
    el.volume = 0.5
    void el.play().catch(() => {
      // Autoplay can be blocked without a recent user gesture on some browsers.
    })
    return () => {
      el.pause()
      el.src = ''
    }
  }, [])

  const nextLevel = skill?.stats_level ?? 1
  const prevLevel = Math.max(1, nextLevel - levelUps)
  const newItemLabel = 'Chef’s pan'
  const leveledUp = levelUps > 0
  const recap =
    coachNote && coachNote.trim().length > 0 ? coachNote.trim() : MOCK_SUMMARY

  const durationLabel =
    durationSec > 0
      ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`
      : '—'

  const dashState =
    skillId != null ? { skillId, skillTitle: skillLabel } : undefined

  return (
    <div className="page level-up page--flush">
      {sessionError ? (
        <p
          className="level-up__subtitle"
          style={{ color: 'var(--destructive)', marginBottom: '1rem' }}
          role="alert"
        >
          {sessionError}
        </p>
      ) : null}
      <div className="level-up__hero">
        <div className="level-up__badge-row">
          <Sparkles className="level-up__sparkle" aria-hidden />
          <span className="level-up__kicker">Session complete</span>
        </div>
        <h1 className="level-up__title">{leveledUp ? 'Level up!' : 'Nice work!'}</h1>
        <p className="level-up__subtitle">
          {leveledUp ? (
            <>
              You reached <strong>level {nextLevel}</strong> in {skillLabel}. Here’s your hero with a
              new gear unlock.
            </>
          ) : (
            <>
              You practiced <strong>{skillLabel}</strong>
              {skill != null ? (
                <>
                  {' '}
                  — <strong>{Math.round(skill.stats_progress_percent)}%</strong> toward level{' '}
                  {nextLevel + 1}.
                </>
              ) : (
                '.'
              )}
            </>
          )}
        </p>
      </div>

      <div className="level-up__compare" aria-label="Avatar before and after level up">
        <section className="level-up__pane" aria-labelledby="level-up-before-heading">
          <h2 id="level-up-before-heading" className="level-up__pane-heading">
            Your hero now
          </h2>
          <div className="level-up__figure">
            <img
              src={BEAR_AVATAR_SRC}
              alt=""
              className="level-up__figure-img"
              width={120}
              height={120}
              draggable={false}
            />
          </div>
          <span className="level-up__lvl-pill">Lv. {prevLevel}</span>
        </section>

        <div className="level-up__arrow-wrap" aria-hidden>
          <ArrowRight className="level-up__arrow" strokeWidth={2.5} />
        </div>

        <section className="level-up__pane level-up__pane--after" aria-labelledby="level-up-after-heading">
          <h2
            id="level-up-after-heading"
            className="level-up__pane-heading level-up__pane-heading--new"
          >
            {leveledUp ? 'After unlock' : 'Current rank'}
          </h2>
          <div
            className={`level-up__figure${leveledUp ? ' level-up__figure--glow' : ''}`}
          >
            <div className="level-up__bear-stack">
              <img
                src={BEAR_AVATAR_SRC}
                alt=""
                className="level-up__figure-img"
                width={120}
                height={120}
                draggable={false}
              />
              {leveledUp ? (
                <div className="level-up__new-item" title={`New: ${newItemLabel}`}>
                  <span className="level-up__new-item-emoji" aria-hidden>
                    🍳
                  </span>
                  <span className="level-up__new-item-caption">New</span>
                </div>
              ) : null}
            </div>
          </div>
          <span
            className={`level-up__lvl-pill${leveledUp ? ' level-up__lvl-pill--up' : ''}`}
          >
            Lv. {nextLevel}
          </span>
          <p className="level-up__unlock-name">
            {leveledUp ? newItemLabel : `Level ${nextLevel} learner`}
          </p>
        </section>
      </div>

      <section className="level-up__section" aria-labelledby="session-summary-heading">
        <h2 id="session-summary-heading" className="level-up__section-title">
          Session recap
        </h2>
        <p className="level-up__summary">
          <span className="level-up__meta">Practice time: {durationLabel}</span>
          <span className="level-up__meta-sep" aria-hidden>
            ·
          </span>
          <span className="level-up__meta">Focus: {skillLabel}</span>
          {progressDelta != null ? (
            <>
              <span className="level-up__meta-sep" aria-hidden>
                ·
              </span>
              <span className="level-up__meta">+{Math.round(progressDelta)}% progress</span>
            </>
          ) : null}
          {masteredDelta != null && masteredDelta > 0 ? (
            <>
              <span className="level-up__meta-sep" aria-hidden>
                ·
              </span>
              <span className="level-up__meta">+{masteredDelta} mastered</span>
            </>
          ) : null}
        </p>
        <p className="level-up__description">{recap}</p>
      </section>

      <section className="level-up__section" aria-labelledby="feedback-heading">
        <h2 id="feedback-heading" className="level-up__section-title">
          Your notes
        </h2>
        <p className="level-up__hint">How did this session feel?</p>
        <textarea
          id="session-notes"
          className="level-up__notes"
          rows={4}
          placeholder="What went well? What should we drill next time?"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          aria-label="Session feedback"
        />
      </section>

      <div className="level-up__actions">
        <Link to="/dashboard" state={dashState} className="btn btn--primary btn--lg">
          Back to journey
        </Link>
        <Link to="/session" state={dashState} className="btn btn--ghost">
          Another session
        </Link>
      </div>
    </div>
  )
}
