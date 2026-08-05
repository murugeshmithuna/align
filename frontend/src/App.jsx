import { Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout.jsx'
import Landing from './pages/Landing.jsx'
import Login from './pages/Login.jsx'
import Profile from './pages/Profile.jsx'
import Checkin from './pages/Checkin.jsx'
import Dashboard from './pages/Dashboard.jsx'
import LiveSession from './pages/LiveSession.jsx'
import Progress from './pages/Progress.jsx'
import Debate from './pages/Debate.jsx'
import MealPhoto from './pages/MealPhoto.jsx'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />

      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/checkin" element={<Checkin />} />
        <Route path="/live-session" element={<LiveSession />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/debate" element={<Debate />} />
        <Route path="/meal-photo" element={<MealPhoto />} />
      </Route>
    </Routes>
  )
}

export default App
