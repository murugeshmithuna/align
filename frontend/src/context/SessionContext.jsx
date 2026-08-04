import { createContext, useContext, useEffect, useState } from 'react'

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

  function setUserId(id) {
    setUserIdState(id)
  }

  function logout() {
    setUserIdState(null)
  }

  return (
    <SessionContext.Provider value={{ userId, setUserId, logout }}>{children}</SessionContext.Provider>
  )
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within a SessionProvider')
  return ctx
}
