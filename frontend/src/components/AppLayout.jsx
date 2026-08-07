import { Navigate, Outlet } from 'react-router-dom'
import { useSession } from '../context/SessionContext.jsx'
import AIMessageBar from './AIMessageBar.jsx'
import BottomTabBar from './BottomTabBar.jsx'
import Navbar from './Navbar.jsx'

// Gates every nested route behind an active session and wraps them in the
// shared top navbar (+ bottom tab bar on mobile - see BottomTabBar.jsx).
export default function AppLayout() {
  const { isAuthenticated } = useSession()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="min-h-screen font-body">
      <Navbar />
      {/* Bottom clearance for two fixed elements that only exist on mobile
          stacked above each other: the BottomTabBar (h-16 + safe-area) and
          the floating "Ask Coach" button (AIMessageBar, repositioned above
          the tab bar on mobile - see its own bottom-20 md:bottom-6). pb-28
          clears both with room to spare; md:pb-24 is enough on desktop
          where only the floating button exists. */}
      <div className="pb-28 md:pb-24">
        <Outlet />
      </div>
      <AIMessageBar />
      <BottomTabBar />
    </div>
  )
}
