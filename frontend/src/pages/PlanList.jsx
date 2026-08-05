import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'

export default function PlanList() {
  const { userId } = useSession()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .listPlans(userId)
      .then(setPlans)
      .catch(() => setPlans([]))
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) {
    return <p className="text-slate-400 text-sm px-6 py-12">Loading your plans…</p>
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 font-body space-y-4">
      <h1 className="font-heading font-bold text-2xl">Your plans</h1>

      {plans.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-sm text-slate-400 mb-3">
            No plans yet - save your profile or ask the coach for a workout plan to get one.
          </p>
          <Link
            to="/profile"
            className="inline-block px-4 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 text-sm font-heading font-semibold"
          >
            Go to profile
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <Link
              key={plan.id}
              to={`/plans/${plan.id}`}
              className="card p-5 flex items-center justify-between hover:border-coral-400 transition-colors block"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{plan.name}</span>
                  {plan.is_active && (
                    <span className="text-xs font-semibold uppercase tracking-wide text-emerald-400 border border-emerald-400/40 rounded-full px-2 py-0.5">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500 mt-1">{plan.plan_exercises.length} exercises</p>
              </div>
              <span className="text-coral-400 text-sm font-semibold">View →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
