import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { createSkillWithResearch } from '../api/skills'
import { useAuth } from '../auth/AuthContext'
import './Page.css'

const levels = ['Beginner', 'Intermediate', 'Advanced'] as const

export function OnboardingPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const fromPickMore = Boolean(
    (location.state as { createSkill?: boolean } | null)?.createSkill,
  )
  const categoryPreset = (location.state as { category?: string } | null)
    ?.category

  const [skill, setSkill] = useState(fromPickMore ? '' : 'Knife skills')
  const [goal, setGoal] = useState('Dice vegetables evenly and safely')
  const [level, setLevel] = useState<(typeof levels)[number]>('Beginner')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!user) {
      setError('Sign in with Google first (header), then try again.')
      return
    }
    setSubmitting(true)
    try {
      const res = await createSkillWithResearch({
        title: skill.trim(),
        goal: goal.trim(),
        level,
        category: categoryPreset ?? null,
      })
      navigate('/dashboard', {
        state: { skillTitle: res.skill.title.trim(), skillId: res.skill.id },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page page--onboarding">
      <form className="form-card" onSubmit={handleSubmit}>
        <div className="text-center" style={{ marginBottom: '0.25rem' }}>
          <h1 className="page__title page__title--sm" style={{ marginBottom: '0.35rem' }}>
            {fromPickMore ? 'Create your skill' : 'Set your quest'}
          </h1>
          <p className="page__lead" style={{ margin: '0 auto', maxWidth: '28rem' }}>
            {fromPickMore
              ? 'Name your skill and what you want to achieve. We generate a research dossier with Gemini and save it to your account.'
              : 'Tell us what you are building toward. We generate a research dossier with Gemini and save it to your account.'}
          </p>
        </div>
        <label className="field">
          <span className="field__label">Skill</span>
          <input
            className="field__input"
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            placeholder="e.g. Guitar, Python, Basketball"
            required
            minLength={1}
          />
        </label>
        <label className="field">
          <span className="field__label">Goal for next sessions</span>
          <textarea
            className="field__input field__input--area"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={3}
            required
            minLength={1}
          />
        </label>
        <fieldset className="field">
          <legend className="field__label">Starting level</legend>
          <div className="chip-row">
            {levels.map((l) => (
              <button
                key={l}
                type="button"
                className={`chip ${level === l ? 'chip--active' : ''}`}
                onClick={() => setLevel(l)}
              >
                {l}
              </button>
            ))}
          </div>
        </fieldset>
        {categoryPreset ? (
          <p className="page__lead" style={{ margin: 0, fontSize: '0.9rem' }}>
            Focus area: <strong>{categoryPreset}</strong>
          </p>
        ) : null}
        {error ? (
          <p className="page__lead" style={{ margin: 0, color: 'var(--destructive)' }}>
            {error}
          </p>
        ) : null}
        {!authLoading && !user ? (
          <p className="page__lead" style={{ margin: 0 }}>
            Sign in with Google using the header button to create a skill.
          </p>
        ) : null}
        <div className="page__actions">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={submitting || authLoading || !user}
          >
            {submitting ? 'Researching & saving…' : 'Generate research & save skill'}
          </button>
          <Link to="/dashboard" className="btn btn--ghost">
            Skip to board
          </Link>
        </div>
      </form>
    </div>
  )
}
