import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'

// Horizontal header-style links, restored per explicit direction after
// trying the hamburger + left-drawer pattern (Sidebar.jsx/Header.jsx,
// removed) - the user wanted header links back, not a slide-out drawer.
// Desktop-only now (`hidden md:flex` below) - on mobile these wrapped into
// 3+ rows and ate most of the viewport, so BottomTabBar.jsx covers the core
// routes there instead (a different interaction than the rejected drawer:
// thumb-reachable tabs, nothing slides over content).
const LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/workout/live', label: 'Live Session' },
  { to: '/workout/log', label: 'Log Workout' },
  { to: '/nutrition', label: 'Meal Photo' },
  { to: '/nutrition/calculator', label: 'Macro Calculator' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/coach-resolution', label: 'Coach Resolution' },
  { to: '/profile', label: 'Profile Settings' },
  { to: '/admin', label: 'Admin' },
]

export default function Navbar() {
  const { userId, logout } = useSession()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    api
      .getProfile(userId)
      .then(setProfile)
      .catch(() => setProfile(null))
  }, [userId])

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <nav className="flex items-center justify-between gap-3 px-4 md:px-8 py-3 border-b border-forest-800 flex-wrap">
      <div className="flex items-center gap-2 shrink-0">
        <span className="w-2.5 h-2.5 rounded-full bg-coral-500 pulse-dot" />
        <span className="font-heading font-bold tracking-tight hidden sm:inline">AI Fitness Agent</span>
      </div>

      <div className="hidden md:flex items-center gap-1 flex-wrap">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `px-2.5 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${
                isActive ? 'bg-forest-800 text-coral-300' : 'text-slate-300 hover:text-coral-300'
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {profile?.photo_url ? (
          <img src={profile.photo_url} alt={profile.name} className="w-7 h-7 rounded-full object-cover" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-forest-800 text-coral-300 flex items-center justify-center text-xs font-semibold">
            {profile?.name ? profile.name[0].toUpperCase() : '?'}
          </div>
        )}
        <span className="text-sm text-slate-400 hidden md:inline">{profile?.name ?? `User #${userId}`}</span>
        <button onClick={handleLogout} className="text-sm text-slate-400 hover:text-coral-300 transition-colors">
          Log out
        </button>
      </div>
    </nav>
  )
}
