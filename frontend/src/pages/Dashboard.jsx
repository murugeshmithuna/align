import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import CheckinModal from '../components/CheckinModal.jsx'
import { useSession } from '../context/SessionContext.jsx'
import { useToast } from '../context/ToastContext.jsx'

// Every feature action is a full page transition to its own route - the
// dashboard itself never renders a feature's actual tool inline. The
// floating AI Coach (AIMessageBar, mounted app-wide) replaced the dashboard's
// old embedded chat panel for the same reason.
const QUICK_LINKS = [
  { to: '/workout/live', label: 'Live Session', description: 'Camera-tracked reps + form feedback' },
  { to: '/workout/log', label: 'Log Workout', description: 'Manually record a completed set' },
  { to: '/nutrition', label: 'Meal Photo', description: 'Calorie/macro estimate from a photo' },
  { to: '/analytics', label: 'Analytics', description: 'Progress charts + fatigue model' },
  { to: '/debate', label: 'Coach Debate', description: 'Strength vs. Recovery, resolved' },
  { to: '/profile', label: 'Profile Settings', description: 'Goals, equipment, limitations' },
]

export default function Dashboard() {
  const { userId } = useSession()
  const { showToast } = useToast()

  const [plan, setPlan] = useState(null)
  const [planLoading, setPlanLoading] = useState(true)
  const [checkin, setCheckin] = useState(null)
  const [checkinLoading, setCheckinLoading] = useState(true)
  const [showCheckinModal, setShowCheckinModal] = useState(false)

  useEffect(() => {
    api
      .listPlans(userId)
      .then((plans) => {
        const active = plans.find((p) => p.is_active) || plans[plans.length - 1] || null
        setPlan(active)
      })
      .catch(() => setPlan(null))
      .finally(() => setPlanLoading(false))

    api
      .getTodaysCheckin(userId)
      .then((data) => setCheckin(data))
      .catch(() => setShowCheckinModal(true))
      .finally(() => setCheckinLoading(false))
  }, [userId])

  function handleCheckinSubmitted(result) {
    setCheckin(result)
    setShowCheckinModal(false)
    showToast(`Check-in saved: ${result.label}`)
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 font-body space-y-6">
      <div>
        <h1 className="font-heading font-bold text-2xl">Welcome back</h1>
        <p className="text-sm text-slate-400 mt-1">Here's where things stand today.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-6">
          <h2 className="font-heading font-semibold mb-2">Active plan</h2>
          {planLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : plan ? (
            <Link to={`/plan/${plan.id}`} className="block hover:opacity-90 transition-opacity">
              <p className="font-semibold text-coral-400">{plan.name} →</p>
              <p className="text-sm text-slate-400 mt-1">{plan.plan_exercises.length} exercises</p>
              {plan.notes && <p className="text-sm text-slate-500 mt-2 line-clamp-3">{plan.notes}</p>}
            </Link>
          ) : (
            <>
              <p className="text-sm text-slate-500 mb-3">
                No active plan yet - it's generated automatically once your profile is saved, or ask the
                AI Coach (bottom right) to build one now.
              </p>
              <Link
                to="/plans"
                className="inline-block px-4 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 text-sm font-semibold"
              >
                Select / activate a plan
              </Link>
            </>
          )}
        </div>

        <div className="card p-6">
          <h2 className="font-heading font-semibold mb-2">Today's readiness</h2>
          {checkinLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : checkin ? (
            <>
              <div className="flex items-center gap-3">
                <span className="font-heading font-bold text-2xl text-coral-400">{checkin.score}/5</span>
                <span className="text-sm text-slate-300">{checkin.label}</span>
              </div>
              {checkin.plan_status !== 'normal' && (
                <p className="text-xs text-coral-400 mt-2">
                  Today's plan was auto-marked <strong>{checkin.plan_status_label}</strong> based on your
                  readiness - ask the coach to apply the specifics.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-slate-500 mb-3">You haven't checked in today.</p>
              <Link
                to="/checkin"
                className="inline-block px-4 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 text-sm font-semibold"
              >
                Check in now
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="card p-6">
        <h2 className="font-heading font-semibold mb-3">Quick links</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="px-4 py-3 rounded-lg border border-forest-700 hover:border-coral-400 transition-colors"
            >
              <p className="text-sm font-semibold">{link.label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{link.description}</p>
            </Link>
          ))}
        </div>
      </div>

      {showCheckinModal && (
        <CheckinModal
          userId={userId}
          onSubmitted={handleCheckinSubmitted}
          onDismiss={() => setShowCheckinModal(false)}
        />
      )}
    </div>
  )
}
