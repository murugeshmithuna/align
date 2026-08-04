import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'
import { useToast } from '../context/ToastContext.jsx'

export default function Login() {
  const { setUserId } = useSession()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .listUsers()
      .then(setUsers)
      .catch(() => setError('Could not reach the API - is the backend running on :8001?'))
      .finally(() => setLoadingUsers(false))
  }, [])

  // After establishing a session, send first-timers to onboarding and
  // everyone else straight to the dashboard.
  async function enterAs(userId) {
    setUserId(userId)
    try {
      // The profile endpoint returns 200 with null fields even for a
      // brand-new user (the row always exists once the account does) - so
      // "onboarding needed" has to be read from the field values, not the
      // HTTP status.
      const profile = await api.getProfile(userId)
      navigate(profile.experience_level ? '/dashboard' : '/profile')
    } catch {
      navigate('/profile')
    }
  }

  async function handleCreate(event) {
    event.preventDefault()
    if (!name.trim() || !email.trim()) return
    setBusy(true)
    setError('')
    try {
      const user = await api.createUser({ name: name.trim(), email: email.trim() })
      showToast(`Welcome, ${user.name}!`)
      await enterAs(user.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 font-body">
      <div className="card w-full max-w-md p-8">
        <h1 className="font-heading font-bold text-2xl mb-1">Sign in</h1>
        <p className="text-sm text-slate-400 mb-6">
          No passwords here yet - pick an existing account or create a new one to establish your session.
        </p>

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        <div className="mb-6">
          <h2 className="text-xs uppercase tracking-widest text-slate-500 mb-2">Existing accounts</h2>
          {loadingUsers ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-slate-500">No accounts yet - create one below.</p>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => enterAs(u.id)}
                  className="w-full text-left px-4 py-2 rounded-lg border border-forest-700 hover:border-coral-400 transition-colors text-sm"
                >
                  <span className="font-semibold">{u.name}</span>{' '}
                  <span className="text-slate-500">({u.email})</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <h2 className="text-xs uppercase tracking-widest text-slate-500 mb-2">Create a new account</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full px-4 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-heading font-semibold"
          >
            {busy ? 'Creating…' : 'Create account & continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
