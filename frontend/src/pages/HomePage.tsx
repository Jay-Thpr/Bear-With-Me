import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchHealth } from '../api/client'
import './Page.css'

const STEPS = [
  'Choose your skill.',
  'Get your roadmap.',
  'Record your practice.',
  'Receive your feedback.',
  'Iterate and improve.',
]

export function HomePage() {
  const [apiStatus, setApiStatus] = useState<'checking' | 'ok' | 'error'>(
    'checking',
  )

  useEffect(() => {
    fetchHealth()
      .then(() => setApiStatus('ok'))
      .catch(() => setApiStatus('error'))
  }, [])

  return (
    <div className="page page--home">
      <div className="landing">
        <div className="landing__bg-css" aria-hidden />
        <div className="landing__wash" aria-hidden />
        <div className="landing__grid-tex" aria-hidden />
        <div className="landing__orb landing__orb--1" aria-hidden />
        <div className="landing__orb landing__orb--2" aria-hidden />
        <div className="landing__orb landing__orb--3" aria-hidden />

        <div className="landing__inner">
          <div className="landing__card">
            <div className="landing__card-highlight" aria-hidden />
            <p className="page__kicker" style={{ marginBottom: '0.75rem' }}>
              Bear With Me
            </p>
            <h1 className="landing__headline">Master any skill</h1>
            <ol className="landing__steps">
              {STEPS.map((text, i) => (
                <li key={text} className="landing__step">
                  <span className="landing__step-num">{i + 1}</span>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
            <div className="landing__ctas">
              <Link to="/onboarding" className="btn btn--primary btn--lg">
                Start your journey!
              </Link>
              <Link to="/select-skill" className="btn btn--ghost btn--lg">
                Continue your journey!
              </Link>
            </div>
            <div className="landing__api">
              <div
                className={`api-pill api-pill--${apiStatus}`}
                role="status"
                aria-live="polite"
              >
                API:{' '}
                {apiStatus === 'checking' && 'checking…'}
                {apiStatus === 'ok' && 'connected'}
                {apiStatus === 'error' && 'offline (run backend on :3000)'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
