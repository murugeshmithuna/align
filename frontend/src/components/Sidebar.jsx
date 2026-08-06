import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Home / Dashboard', icon: '🏠' },
  { to: '/workout/live', label: 'Live Session', icon: '🏋️' },
  { to: '/workout/log', label: 'Log Workout', icon: '📝' },
  { to: '/nutrition', label: 'Meal Tracker & Vision AI', icon: '🥗' },
  { to: '/nutrition/calculator', label: 'Nutritional & Macro Calculator', icon: '🧮' },
  { to: '/analytics', label: 'Analytics & AI Audits', icon: '📊' },
  { to: '/coach-resolution', label: 'Coach Resolution & Strategy', icon: '🎯' },
  { to: '/profile', label: 'Profile & Goal Settings', icon: '👤' },
]

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  )
}

// Slide-out left drawer - replaces the old always-visible horizontal Navbar
// (7+ links crammed into one row) with a single hamburger entry point and a
// vertical list that has room to breathe. Every core feature route lives
// here; /plans, /plan/:id, and /checkin deliberately don't (they already
// have their own in-app entry points - Dashboard's Active Plan card and the
// daily check-in modal - so they don't need global nav presence too).
export default function Sidebar({ open, onClose }) {
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-72 bg-forest-900 border-r border-forest-800 flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-forest-800">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-coral-500 pulse-dot" />
            <span className="font-heading font-bold tracking-tight">AI Fitness Agent</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="text-slate-400 hover:text-coral-300 transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-forest-800 text-coral-300'
                    : 'text-slate-300 hover:bg-forest-800/60 hover:text-coral-300'
                }`
              }
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  )
}
