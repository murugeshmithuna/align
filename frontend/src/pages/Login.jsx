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

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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

  // createUser is find-or-create by email on the backend: if the email
  // typed here already has an account, this signs into it (no password
  // system yet); otherwise it creates a brand-new one. Either way, it only
  // ever acts on the exact email the visitor typed themselves - never a
  // list of other people's accounts to pick from.
  async function handleSignIn(event) {
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
          No passwords here yet - sign in with Google, or enter your own name and email below to sign in
          or create an account.
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

        <h2 className="text-xs uppercase tracking-widest text-slate-500 mb-2">Sign in with your email</h2>
        <form onSubmit={handleSignIn} className="space-y-3">
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
            {busy ? 'Signing in…' : 'Sign in / create account'}
          </button>
        </form>
      </div>
    </div>
  )
}
