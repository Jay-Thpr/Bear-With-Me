import { Link, Outlet } from 'react-router-dom'
import { googleLoginHref } from '../api/auth'
import { useAuth } from '../auth/AuthContext'
import '../pages/Page.css'
import './Layout.css'

const nav = [
  { to: '/', label: 'Home' },
  { to: '/select-skill', label: 'Pick Skill' },
  { to: '/onboarding', label: 'Create Skill' },
]

export function Layout() {
  const { user, loading, logout } = useAuth()

  return (
    <div className="layout">
      <header className="layout__header">
        <Link to="/" className="layout__brand layout__brand-lockup">
          <img
            className="layout__logo"
            src="/bear_logo_less_detail.png"
            alt=""
            width={40}
            height={40}
          />
          Bear with me
        </Link>
        <div className="layout__header-right">
          <nav className="layout__nav" aria-label="Main">
            {nav.map(({ to, label }) => (
              <Link key={to} to={to} className="layout__link">
                {label}
              </Link>
            ))}
          </nav>
          <div className="layout__auth" aria-label="Account">
            {loading ? (
              <span className="layout__auth-muted">…</span>
            ) : user ? (
              <>
                {user.picture ? (
                  <img
                    className="layout__avatar"
                    src={user.picture}
                    alt=""
                    width={32}
                    height={32}
                  />
                ) : null}
                <span className="layout__user-name" title={user.email ?? undefined}>
                  {user.display_name}
                </span>
                <button
                  type="button"
                  className="btn btn--ghost layout__auth-btn"
                  onClick={() => void logout()}
                >
                  Sign out
                </button>
              </>
            ) : (
              <a className="btn btn--ghost layout__auth-btn" href={googleLoginHref()}>
                Sign in with Google
              </a>
            )}
          </div>
        </div>
      </header>
      <main className="layout__main">
        <Outlet />
      </main>
    </div>
  )
}
