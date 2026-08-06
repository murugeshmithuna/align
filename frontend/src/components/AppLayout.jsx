import { useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useSession } from '../context/SessionContext.jsx'
import AIMessageBar from './AIMessageBar.jsx'
import Header from './Header.jsx'
import Sidebar from './Sidebar.jsx'

// Gates every nested route behind an active session and wraps them in the
// shared header + hamburger drawer (replaces the old always-visible
// horizontal Navbar).
export default function AppLayout() {
  const { isAuthenticated } = useSession()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="min-h-screen font-body">
      <Header onOpenMenu={() => setSidebarOpen(true)} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Outlet />
      <AIMessageBar />
    </div>
  )
}
