import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE_URL, api } from '../api.js'
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

  // The backend's server-side Google OAuth redirect flow (GET /auth/google/
  // start -> Google consent screen -> GET /auth/google/callback) lands back
  // here with ?uid=.../?is_new=... on success or ?google_error=... on
  // failure - a plain top-level navigation, not a popup callback and not
  // dependent on any Google-set cookie (see routers/auth.py for why that
  // matters - it's what actually fixed Safari). Reuses the exact same
  // enterAs() bridge the plain-login path uses, so there's no second
  // session mechanism to maintain.
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
          {/* A plain top-level navigation straight to the backend, which
              redirects to Google's own consent screen - the classic server-
              side OAuth flow, not Google's Identity Services JS widget. No
              Google-hosted script ever runs on this page, so there's no
              Google-set cookie for Safari's tracking prevention to block -
              confirmed as the real fix after the popup flow and then the
              GIS redirect flow (which still depended on a Google-set
              g_csrf_token cookie under the hood) both failed for real users
              on Safari. */}
          <a
            href={`${API_BASE_URL}/auth/google/start`}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white text-slate-900 text-sm font-semibold hover:bg-slate-100 transition-colors"
          >
            <svg viewBox="0 0 48 48" className="w-4 h-4" aria-hidden="true">
              <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
              <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
              <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
              <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
            </svg>
            Sign in with Google
          </a>
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
