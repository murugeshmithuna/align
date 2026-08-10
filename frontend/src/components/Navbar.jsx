import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import AlignWordmark from './AlignWordmark.jsx'
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
  { to: '/coach-resolution', label: 'Coach Resolution' },
  { to: '/profile', label: 'Profile Settings' },
  { to: '/admin', label: 'Admin' },
]

function ProfileMenu({ profile, userId, onLogout }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-forest-950 rounded-full pl-1 pr-2.5 py-1"
      >
        {profile?.photo_url ? (
          <img src={profile.photo_url} alt={profile.name} className="w-6 h-6 rounded-full object-cover" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-coral-500 text-forest-950 flex items-center justify-center text-xs font-bold">
            {profile?.name ? profile.name[0].toUpperCase() : '?'}
          </div>
        )}
        <span className="text-sm text-slate-200 hidden md:inline">{profile?.name ?? `User #${userId}`}</span>
        <svg viewBox="0 0 20 20" fill="none" className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M5 7.5l5 5 5-5" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-44 bg-forest-950 border border-forest-700 rounded-xl shadow-2xl overflow-hidden z-50">
          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm text-slate-200 hover:bg-forest-800 hover:text-coral-300 transition-colors"
          >
            Profile Settings
          </Link>
          <button
            onClick={onLogout}
            className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-forest-800 hover:text-coral-300 transition-colors border-t border-forest-800"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  )
}

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
      <div className="flex items-center gap-4 md:gap-6 px-4 md:px-8 py-3">
        <div className="flex items-center gap-2 shrink-0">
          <AlignWordmark className="font-heading font-bold tracking-tight text-sm md:text-base" size="1.15em" />
        </div>

        <div className="hidden md:flex items-center gap-x-3 xl:gap-x-5 overflow-x-auto no-scrollbar">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `font-heading text-xs xl:text-sm font-bold whitespace-nowrap pb-1.5 border-b-2 transition-colors ${
                  isActive
                    ? 'text-forest-950 border-forest-950'
                    : 'text-forest-950/55 border-transparent hover:text-forest-950 hover:border-forest-950/40'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>

        <ProfileMenu profile={profile} userId={userId} onLogout={handleLogout} />
      </div>
    </nav>
  )
}
