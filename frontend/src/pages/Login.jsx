import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
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

  // Google's redirect flow (see below) lands back here with ?uid=.../
  // ?is_new=... (set by frontend/api/google-redirect.js after it verifies
  // the credential server-side) or ?google_error=... on failure - not a
  // popup callback. Reuses the exact same enterAs() bridge the plain-login
  // path uses, so there's no second session mechanism to maintain.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const uid = params.get('uid')
    const googleError = params.get('google_error')
    if (uid) {
      showToast(params.get('is_new') === 'true' ? 'Welcome!' : 'Welcome back!')
      enterAs(Number(uid))
    } else if (googleError) {
      setError(`Google sign-in failed: ${googleError}`)
    }
    // Only ever needs to run once, against whatever query string the page
    // loaded with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

        <div className="mb-6 flex justify-center">
          {/* Redirect flow (full-page navigation), not the default popup +
              postMessage flow - Safari's Intelligent Tracking Prevention
              blocks that handshake by default, confirmed live (sign-in got
              stuck on the account picker until third-party tracking
              protection was manually disabled). A redirect isn't subject to
              that restriction at all, and works the same for every browser. */}
          <GoogleLogin
            ux_mode="redirect"
            login_uri={`${window.location.origin}/api/google-redirect`}
            onError={() => setError('Google sign-in failed - please try again.')}
          />
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-forest-800" />
          <span className="text-xs text-slate-500 uppercase tracking-widest">or</span>
          <div className="flex-1 h-px bg-forest-800" />
        </div>

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
