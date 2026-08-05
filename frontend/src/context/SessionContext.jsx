import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

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
  const setUserId = useCallback((id) => {
    setUserIdState(id)
  }, [])

  const logout = useCallback(() => {
    setUserIdState(null)
  }, [])

  const isAuthenticated = userId != null

  // Memoized so React can skip re-rendering every useSession() consumer
  // whenever something above this provider re-renders for an unrelated
  // reason (e.g. a toast timing out) - only a real auth-state change
  // produces a new value object here.
  const value = useMemo(
    () => ({ userId, isAuthenticated, setUserId, logout }),
    [userId, isAuthenticated, setUserId, logout],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within a SessionProvider')
  return ctx
}
