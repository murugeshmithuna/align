import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { hasUserToken, setAdminToken, setUserToken } from '../api.js'

const STORAGE_KEY = 'fitness_agent_user_id'
const SessionContext = createContext(null)

export function SessionProvider({ children }) {
  const [userId, setUserIdState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? Number(stored) : null
  })

  useEffect(() => {
    if (userId) {
      localStorage.setItem(STORAGE_KEY, String(userId))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [userId])

  // Stable references (empty deps) so the context value below only changes
  // when userId itself changes - not on every re-render of this provider.
  // `token` is the signed session token every other request authenticates
  // with (see backend/app/user_auth.py) - `userId` itself is kept only for
  // local-only uses (display, per-user cache keys, effect dependencies),
  // never sent to the backend as a trust claim anymore.
  const login = useCallback((id, token) => {
    setUserToken(token)
    setUserIdState(id)
  }, [])

  const logout = useCallback(() => {
    setUserIdState(null)
    setUserToken(null)
    // An admin token otherwise survives logout indefinitely (up to its own
    // 12h expiry) in this browser's localStorage - clear it here so it
    // can't be picked up by whoever signs in next on the same device.
    setAdminToken(null)
  }, [])

  // Requires a real token, not just a remembered id - a browser holding a
  // stale pre-session-auth userId with no token would otherwise look signed
  // in and 401-loop on every request instead of bouncing back to sign-in.
  const isAuthenticated = userId != null && hasUserToken()

  // Memoized so React can skip re-rendering every useSession() consumer
  // whenever something above this provider re-renders for an unrelated
  // reason (e.g. a toast timing out) - only a real auth-state change
  // produces a new value object here.
  const value = useMemo(
    () => ({ userId, isAuthenticated, login, logout }),
    [userId, isAuthenticated, login, logout],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within a SessionProvider')
  return ctx
}
