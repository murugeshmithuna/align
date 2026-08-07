import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useSession } from '../context/SessionContext.jsx'

// Mobile-only replacement for the horizontal header links, which wrap into
// several rows and eat most of the viewport on small screens. A left-drawer
// hamburger menu was already tried here and explicitly reverted back to
// horizontal header links ("user wanted header links back, not a slide-out
// drawer") - a bottom tab bar is a different interaction (thumb-reachable,
// doesn't cover the page, nothing slides in over content) rather than a
// second attempt at the same rejected pattern. Desktop keeps the existing
// horizontal Navbar links unchanged; this only renders below `md`.

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
    </svg>
  )
}

function WorkoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M3 12h3l2.5-6 4 12 2.5-6H21" />
    </svg>
  )
}

function MealsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M7 3v7a2 2 0 0 0 2 2v9M7 3v9M4 3v7a2 2 0 0 0 2 2M17 3c-1.7 0-3 2-3 6s1.3 6 3 6v6" />
    </svg>
  )
}

function StatsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M4 20V10M12 20V4M20 20v-7" />
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  )
}

const PRIMARY_TABS = [
  { to: '/dashboard', label: 'Home', Icon: HomeIcon },
  { to: '/workout/live', label: 'Workout', Icon: WorkoutIcon },
  { to: '/nutrition', label: 'Meals', Icon: MealsIcon },
  { to: '/analytics', label: 'Stats', Icon: StatsIcon },
]

const MORE_LINKS = [
  { to: '/workout/log', label: 'Log Workout' },
  { to: '/nutrition/calculator', label: 'Macro Calculator' },
  { to: '/coach-resolution', label: 'Coach Resolution' },
  { to: '/profile', label: 'Profile Settings' },
  { to: '/admin', label: 'Admin' },
]

function tabClass(isActive) {
  return `flex flex-col items-center justify-center gap-1 flex-1 h-full text-[11px] font-medium transition-colors ${
    isActive ? 'text-coral-400' : 'text-slate-400'
  }`
}

export default function BottomTabBar() {
  const [moreOpen, setMoreOpen] = useState(false)
  const { logout } = useSession()
  const navigate = useNavigate()

  function handleLogout() {
    setMoreOpen(false)
    logout()
    navigate('/')
  }

  return (
    <>
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMoreOpen(false)} aria-hidden="true" />
      )}

      <div
        className={`md:hidden fixed inset-x-0 bottom-0 z-50 bg-forest-900 border-t border-forest-800 rounded-t-2xl shadow-2xl transition-transform duration-300 ${
          moreOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="px-2 pt-2 pb-1 flex justify-center">
          <span className="w-9 h-1 rounded-full bg-forest-700" />
        </div>
        <div className="px-2 pb-2">
          {MORE_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => setMoreOpen(false)}
              className={({ isActive }) =>
                `block px-4 py-3 rounded-lg text-sm font-medium ${
                  isActive ? 'bg-forest-800 text-coral-300' : 'text-slate-200'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-3 rounded-lg text-sm font-medium text-red-400"
          >
            Log out
          </button>
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>

      <nav
        // z-20, below AIMessageBar's backdrop/drawer (z-30/z-40) - when the
        // AI chat panel is open, its dimmed backdrop should cover this tab
        // bar too rather than tie/paint over it.
        className="md:hidden fixed inset-x-0 bottom-0 z-20 h-16 bg-forest-900/95 backdrop-blur border-t border-forest-800 flex items-stretch"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {PRIMARY_TABS.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => tabClass(isActive)}>
            <Icon />
            {label}
          </NavLink>
        ))}
        <button onClick={() => setMoreOpen(true)} className={tabClass(moreOpen)}>
          <MoreIcon />
          More
        </button>
      </nav>
    </>
  )
}
