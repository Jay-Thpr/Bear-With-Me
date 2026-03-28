import { Link, Outlet } from 'react-router-dom'
import '../pages/Page.css'
import './Layout.css'

const nav = [
  { to: '/', label: 'Home' },
  { to: '/select-skill', label: 'Pick Skill' },
  { to: '/onboarding', label: 'Create Skill' },
]

export function Layout() {
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
        </div>
      </header>
      <main className="layout__main">
        <Outlet />
      </main>
    </div>
  )
}
