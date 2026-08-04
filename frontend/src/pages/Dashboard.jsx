import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import ChatPanel from '../components/ChatPanel.jsx'
import CheckinModal from '../components/CheckinModal.jsx'
import { useSession } from '../context/SessionContext.jsx'
import { useToast } from '../context/ToastContext.jsx'

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
      <h1 className="font-heading font-bold text-2xl">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-6">
          <h2 className="font-heading font-semibold mb-2">Active plan</h2>
          {planLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : plan ? (
            <>
              <p className="font-semibold">{plan.name}</p>
              <p className="text-sm text-slate-400 mt-1">{plan.plan_exercises.length} exercises</p>
              {plan.notes && <p className="text-sm text-slate-500 mt-2 line-clamp-3">{plan.notes}</p>}
            </>
          ) : (
            <p className="text-sm text-slate-500">
              No plan yet - it's generated automatically once your profile is saved, or ask the coach
              below to build one now.
            </p>
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

      <ChatPanel userId={userId} />

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
