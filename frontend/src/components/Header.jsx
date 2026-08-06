import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'

// Minimal top bar: hamburger + logo on the left, avatar/logout on the
// right. The floating "Ask Coach" button (AIMessageBar.jsx) lives entirely
// separately, fixed bottom-right - this header doesn't touch it.
export default function Header({ onOpenMenu }) {
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
    <header className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-forest-800">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMenu}
          aria-label="Open menu"
          className="text-2xl leading-none w-9 h-9 flex items-center justify-center rounded-lg text-slate-200 hover:bg-forest-800 hover:text-coral-300 transition-colors"
        >
          ☰
        </button>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-coral-500 pulse-dot" />
          <span className="font-heading font-bold tracking-tight hidden sm:inline">AI Fitness Agent</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {profile?.photo_url ? (
          <img src={profile.photo_url} alt={profile.name} className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-forest-800 text-coral-300 flex items-center justify-center text-xs font-semibold">
            {profile?.name ? profile.name[0].toUpperCase() : '?'}
          </div>
        )}
        <span className="text-sm text-slate-400 hidden sm:inline">{profile?.name ?? `User #${userId}`}</span>
        <button onClick={handleLogout} className="text-sm text-slate-400 hover:text-coral-300 transition-colors">
          Log out
        </button>
      </div>
    </header>
  )
}
