import { NavLink, useNavigate } from 'react-router-dom'
import { useSession } from '../context/SessionContext.jsx'

const LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/workout/live', label: 'Live Session' },
  { to: '/workout/log', label: 'Log Workout' },
  { to: '/nutrition', label: 'Meal Photo' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/debate', label: 'Coach Debate' },
  { to: '/profile', label: 'Profile Settings' },
]

export default function Navbar() {
  const { userId, logout } = useSession()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <nav className="flex items-center justify-between px-6 md:px-12 py-4 border-b border-forest-800">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-coral-500 pulse-dot" />
        <span className="font-heading font-bold tracking-tight">AI Fitness Agent</span>
      </div>

      <div className="flex items-center gap-1 md:gap-2">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-forest-800 text-coral-300' : 'text-slate-300 hover:text-coral-300'
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </div>

      <div className="flex items-center gap-3 text-sm text-slate-400">
        <span>User #{userId}</span>
        <button onClick={handleLogout} className="hover:text-coral-300 transition-colors">
          Log out
        </button>
      </div>
    </nav>
  )
}
