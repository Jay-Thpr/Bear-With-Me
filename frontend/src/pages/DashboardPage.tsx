import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { fetchSkill, fetchSkills, type SkillOut } from '../api/skills'
import './Page.css'

/** Plain bear sprite (no props). Same art as the in-app Character. */
const BEAR_AVATAR_SRC = '/bear-character.png'

function formatPracticeTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

const FlameIcon = () => (
  <svg
    className="journey__streak-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
)

const CalendarIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect
      x="3"
      y="4"
      width="18"
      height="18"
      rx="2"
      stroke="#88a594"
      strokeWidth="2"
    />
    <path d="M16 2v4M8 2v4M3 10h18" stroke="#88a594" strokeWidth="2" />
  </svg>
)

const TrophyIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6m0 5v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9M6 9h12m0 0h1.5a2.5 2.5 0 0 0 0-5H18m-6 13V9m0 13H9m3 0h3"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const PlayIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M8 5v14l11-7z" />
  </svg>
)

const ZapIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
      stroke="#b89a60"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
)

export function DashboardPage() {
  const location = useLocation()
  const nav = location.state as { skillTitle?: string; skillId?: string } | null
  const [skill, setSkill] = useState<SkillOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        if (nav?.skillId) {
          const s = await fetchSkill(nav.skillId)
          if (!cancelled) setSkill(s)
        } else if (nav?.skillTitle) {
          const list = await fetchSkills()
          if (cancelled) return
          const m = list.find((x) => x.title === nav.skillTitle)
          setSkill(m ?? null)
        } else {
          setSkill(null)
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Could not load skill.')
          setSkill(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [nav?.skillId, nav?.skillTitle])

  const currentSkill = skill?.title ?? nav?.skillTitle ?? 'Your skill'
  const streak = skill?.stats_day_streak ?? 0
  const level = skill?.stats_level ?? 1
  const progress = Math.round(skill?.stats_progress_percent ?? 0)
  const sessions = skill?.stats_sessions ?? 0
  const practiceLabel = formatPracticeTime(skill?.stats_practice_seconds ?? 0)
  const mastered = skill?.stats_mastered ?? 0

  const today = new Date()
  const calendarDays = Array.from({ length: 28 }, (_, i) => {
    const date = new Date(today)
    date.setDate(date.getDate() - (27 - i))
    const d = date.getDate()
    const isToday = i === 27
    const practiced = (i + d) % 3 !== 0
    const planned = !practiced && (i + d) % 4 === 0
    const state = practiced ? 'practiced' : planned ? 'planned' : 'none'
    return { date: d, state, isToday }
  })

  const upcoming = [
    {
      session: 25,
      title: 'Pan-Seared Salmon',
      desc: 'Temperature control and timing for evenly cooked fish.',
      accent: '#88a594',
      bg: 'rgba(136,165,148,0.06)',
      border: 'rgba(136,165,148,0.18)',
    },
    {
      session: 26,
      title: 'Homemade Pasta',
      desc: 'Fresh dough, resting, and rolling with calm repetition.',
      accent: '#7aaac8',
      bg: 'rgba(168,192,216,0.06)',
      border: 'rgba(168,192,216,0.18)',
    },
    {
      session: 27,
      title: 'Sourdough basics',
      desc: 'Fermentation timing and shaping for your first loaves.',
      accent: '#b89a60',
      bg: 'rgba(232,213,165,0.1)',
      border: 'rgba(232,213,165,0.25)',
    },
  ]

  if (loading) {
    return (
      <div className="page journey page--flush">
        <p className="page__lead">Loading your skill…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="page journey page--flush">
        <p className="page__lead" style={{ color: 'var(--destructive)' }}>
          {loadError}
        </p>
        <Link to="/select-skill" className="btn btn--primary" style={{ marginTop: '1rem' }}>
          Pick a skill
        </Link>
      </div>
    )
  }

  return (
    <div className="page journey page--flush">
      <div className="journey__header">
        <div>
          <h1 className="page__title">Your journey</h1>
          <p className="page__lead" style={{ marginTop: '0.35rem' }}>
            {skill
              ? `Continuing ${currentSkill} practice`
              : 'Choose a skill on the board to see your stats'}
          </p>
        </div>
        <div className="journey__streak">
          <FlameIcon />
          <div>
            <div className="journey__streak-val">{streak}</div>
            <div className="journey__streak-label">Day streak</div>
          </div>
        </div>
      </div>

      <div className="journey__grid">
        <div className="journey__panel">
          <div className="journey__hero-row">
            <div className="journey__avatar-column">
              <div className="journey__avatar-wrap">
                <div className="journey__avatar-bear">
                  <img
                    src={BEAR_AVATAR_SRC}
                    alt="Bear mascot"
                    className="journey__avatar-img"
                    width={112}
                    height={112}
                    draggable={false}
                  />
                  <div className="journey__level-badge" aria-hidden>
                    {level}
                  </div>
                </div>
              </div>
              <p className="journey__avatar-caption">
                {currentSkill}
              </p>
            </div>
            <div style={{ flex: 1, width: '100%' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: '0.65rem',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <h2 className="page__title page__title--sm" style={{ margin: 0 }}>
                  Level {level} learner
                </h2>
                <span
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                  }}
                >
                  {progress}% to level {level + 1}
                </span>
              </div>
              <div className="xp-bar" aria-hidden>
                <div className="xp-bar__fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="journey__stats" style={{ marginTop: '1.25rem' }}>
                <div
                  className="journey__stat"
                  style={{
                    background: 'rgba(136, 165, 148, 0.1)',
                    border: '1px solid rgba(136, 165, 148, 0.2)',
                  }}
                >
                  <div className="journey__stat-val" style={{ color: '#88a594' }}>
                    {sessions}
                  </div>
                  <div className="journey__stat-label">Sessions</div>
                </div>
                <div
                  className="journey__stat"
                  style={{
                    background: 'rgba(168, 192, 216, 0.1)',
                    border: '1px solid rgba(168, 192, 216, 0.2)',
                  }}
                >
                  <div className="journey__stat-val" style={{ color: '#7aaac8' }}>
                    {practiceLabel}
                  </div>
                  <div className="journey__stat-label">Practice</div>
                </div>
                <div
                  className="journey__stat"
                  style={{
                    background: 'rgba(232, 213, 165, 0.15)',
                    border: '1px solid rgba(232, 213, 165, 0.3)',
                  }}
                >
                  <div className="journey__stat-val" style={{ color: '#b89a60' }}>
                    {mastered}
                  </div>
                  <div className="journey__stat-label">Mastered</div>
                </div>
              </div>
              <Link
                to="/session"
                state={
                  skill
                    ? { skillId: skill.id, skillTitle: skill.title }
                    : undefined
                }
                className="btn btn--primary btn--lg"
                style={{ marginTop: '1.25rem', width: '100%' }}
              >
                <PlayIcon />
                Start live session
              </Link>
            </div>
          </div>
        </div>

        <div className="journey__panel journey__panel--blue">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '3rem',
                height: '3rem',
                borderRadius: '16px',
                display: 'grid',
                placeItems: 'center',
                background: 'linear-gradient(135deg, #a8c0d8 0%, #8aafc8 100%)',
                boxShadow: '0 4px 12px rgba(100, 140, 180, 0.25)',
              }}
            >
              <TrophyIcon />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                Recent milestone
              </h3>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Unlocked 2 days ago
              </p>
            </div>
          </div>
          <div
            style={{
              marginTop: '1.25rem',
              borderRadius: '18px',
              padding: '1.25rem',
              background: 'rgba(255,255,255,0.75)',
              border: '1px solid rgba(168, 192, 216, 0.25)',
            }}
          >
            <p style={{ margin: '0 0 0.35rem', fontWeight: 600 }}>Even dice</p>
            <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5, color: 'var(--text-muted)' }}>
              Consistent cube cuts on onions and carrots with safer knuckle guidance.
            </p>
          </div>
        </div>
      </div>

      <div className="journey__panel journey__practice-log">
        <div className="journey__practice-log-head">
          <div
            style={{
              padding: '0.45rem',
              borderRadius: '12px',
              background:
                'linear-gradient(135deg, rgba(136,165,148,0.2) 0%, rgba(136,165,148,0.1) 100%)',
              border: '1px solid rgba(136,165,148,0.2)',
            }}
          >
            <CalendarIcon />
          </div>
          <h3 className="journey__section-title journey__section-title--inline">
            Practice log
          </h3>
        </div>
        <ul className="journey__practice-log-legend" aria-label="Practice log legend">
          <li className="journey__legend-item">
            <span className="journey__legend-swatch journey__legend-swatch--none" aria-hidden />
            No practice
          </li>
          <li className="journey__legend-item">
            <span className="journey__legend-swatch journey__legend-swatch--practiced" aria-hidden />
            Practiced
          </li>
          <li className="journey__legend-item">
            <span className="journey__legend-swatch journey__legend-swatch--planned" aria-hidden />
            Planned
          </li>
        </ul>
        <div className="journey__cal">
          {calendarDays.map((day, index) => {
            const title =
              day.state === 'practiced'
                ? 'Practiced'
                : day.state === 'planned'
                  ? 'Planned practice'
                  : 'No practice'
            return (
              <div
                key={index}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <div
                  className={`journey__cal-day journey__cal-day--${day.state}${
                    day.isToday ? ' journey__cal-day--today' : ''
                  }`}
                  title={title}
                >
                  {day.date}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="journey__panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1rem' }}>
          <div
            style={{
              padding: '0.45rem',
              borderRadius: '12px',
              background:
                'linear-gradient(135deg, rgba(232,213,165,0.3) 0%, rgba(232,213,165,0.15) 100%)',
              border: '1px solid rgba(232,213,165,0.35)',
            }}
          >
            <ZapIcon />
          </div>
          <h3 className="journey__section-title" style={{ margin: 0 }}>
            Upcoming practices
          </h3>
        </div>
        <div className="journey__upcoming">
          {upcoming.map((item) => (
            <div
              key={item.session}
              className="journey__up-card"
              style={{
                background: item.bg,
                border: `1px solid ${item.border}`,
              }}
            >
              <div
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: item.accent,
                  marginBottom: '0.5rem',
                }}
              >
                Session {item.session}
              </div>
              <h4 style={{ margin: '0 0 0.35rem', fontSize: '1rem', fontWeight: 600 }}>
                {item.title}
              </h4>
              <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.5, color: 'var(--text-muted)' }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
