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
    <nav className="bg-coral-500">
      <div className="flex items-center justify-between gap-3 px-4 md:px-8 py-3 flex-wrap">
        <div className="flex items-center gap-2 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-forest-950" />
          <span className="font-heading font-bold tracking-tight hidden sm:inline">AI Fitness Agent</span>
        </div>

        <div className="hidden md:flex items-center gap-1.5 flex-wrap">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-full bg-forest-950 text-xs md:text-sm font-semibold transition-colors whitespace-nowrap ${
                  isActive ? 'text-coral-400' : 'text-slate-300 hover:text-coral-300'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-2 bg-forest-950 rounded-full pl-1 pr-3 py-1">
            {profile?.photo_url ? (
              <img src={profile.photo_url} alt={profile.name} className="w-6 h-6 rounded-full object-cover" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-coral-500 text-forest-950 flex items-center justify-center text-xs font-bold">
                {profile?.name ? profile.name[0].toUpperCase() : '?'}
              </div>
            )}
            <span className="text-sm text-slate-200 hidden md:inline">{profile?.name ?? `User #${userId}`}</span>
          </div>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-full bg-forest-950 text-xs md:text-sm font-semibold text-slate-300 hover:text-coral-300 transition-colors"
          >
            Log out
          </button>
        </div>
      </div>
    </nav>
  )
}
