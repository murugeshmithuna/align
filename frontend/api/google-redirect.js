// Vercel serverless function - the "login_uri" target for Google's
// redirect-based Sign In With Google flow.
//
// Why this exists: the default @react-oauth/google <GoogleLogin> button uses
// a popup + postMessage handshake between accounts.google.com and this app.
// Safari's Intelligent Tracking Prevention blocks that handshake by default
// (confirmed live - sign-in got stuck on the account picker in Safari until
// "Prevent Cross-Site Tracking" was manually disabled), which isn't something
// real end users should have to do. Google's own recommended fix is the
// redirect flow: a normal top-level page navigation instead of a popup, which
// isn't subject to third-party storage restrictions at all.
//
// The redirect flow needs a same-origin POST target (Google's g_csrf_token
// double-submit cookie only works if the cookie's origin and the POST
// target's origin match) - since the frontend (Vercel) and backend (Render)
// are on different domains, this function is that same-origin target. It
// verifies the CSRF token, forwards the credential to the existing
// POST /auth/google JSON endpoint unchanged, and redirects back into the SPA
// with the resulting user id - reusing Login.jsx's existing enterAs() bridge
// rather than inventing a new session mechanism.
export default async function handler(req, res) {
  const appOrigin = `https://${req.headers.host}`

  if (req.method !== 'POST') {
    res.redirect(302, `${appOrigin}/login`)
    return
  }

  const { credential, g_csrf_token: bodyToken } = req.body || {}
  const cookieToken = req.cookies?.g_csrf_token

  if (!credential || !bodyToken || !cookieToken || bodyToken !== cookieToken) {
    res.redirect(302, `${appOrigin}/login?google_error=csrf_check_failed`)
    return
  }

  const apiBaseUrl = process.env.VITE_API_BASE_URL || 'http://localhost:8001'

  try {
    const apiRes = await fetch(`${apiBaseUrl}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: credential }),
    })
    const data = await apiRes.json()

    if (!apiRes.ok) {
      res.redirect(302, `${appOrigin}/login?google_error=${encodeURIComponent(data.detail || 'sign_in_failed')}`)
      return
    }

    res.redirect(302, `${appOrigin}/login?uid=${data.user.id}&is_new=${data.is_new_user}`)
  } catch {
    res.redirect(302, `${appOrigin}/login?google_error=network_error`)
  }
}
