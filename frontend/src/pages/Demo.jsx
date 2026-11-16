import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'
import { useToast } from '../context/ToastContext.jsx'

// A single frictionless URL for the homepage link / resume "Live" link -
// loads, signs in as the shared read-only demo account with zero clicks
// and zero Google OAuth, and lands straight on the dashboard. Shares the
// exact same guestSignIn()/login() path Login.jsx's "Try the demo" button
// uses, just triggered automatically on mount instead of by a click.
export default function Demo() {
  const { login } = useSession()
  const { showToast } = useToast()
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    api
      .guestSignIn()
      .then(({ user, user_token }) => {
        if (cancelled) return
        login(user.id, user_token)
        showToast("Exploring the demo account - changes won't be saved.")
        navigate('/dashboard', { replace: true })
      })
      .catch(() => {
        if (!cancelled) navigate('/login', { replace: true })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center px-6 font-body">
      <p className="text-sm text-slate-400">Loading the demo…</p>
    </div>
  )
}
