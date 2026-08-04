import { Navigate, Outlet } from 'react-router-dom'
import { useSession } from '../context/SessionContext.jsx'
import Navbar from './Navbar.jsx'

// Gates every nested route behind an active session and wraps them in the
// shared top navbar.
export default function AppLayout() {
  const { userId } = useSession()

  if (!userId) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="min-h-screen font-body">
      <Navbar />
      <Outlet />
    </div>
  )
}
