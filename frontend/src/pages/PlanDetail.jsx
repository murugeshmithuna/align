import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { useToast } from '../context/ToastContext.jsx'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function todayIndex() {
  // JS getDay() is 0=Sunday..6=Saturday; plan_exercises.day_of_week is 0=Monday..6=Sunday.
  return (new Date().getDay() + 6) % 7
}

function groupByDay(planExercises) {
  const groups = new Map()
  for (const pe of planExercises) {
    const key = pe.day_of_week ?? 'unscheduled'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(pe)
  }
  for (const list of groups.values()) list.sort((a, b) => a.order_index - b.order_index)
  return groups
}

export default function PlanDetail() {
  const { planId } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activating, setActivating] = useState(false)

  useEffect(() => {
    setLoading(true)
    api
      .getPlan(planId)
      .then(setPlan)
      .catch(() => setError('Could not load this plan.'))
      .finally(() => setLoading(false))
  }, [planId])

  async function handleActivate() {
    setActivating(true)
    try {
      const updated = await api.activatePlan(planId)
      setPlan(updated)
      showToast(`"${updated.name}" is now your active plan.`)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setActivating(false)
    }
  }

  if (loading) {
    return <p className="text-slate-400 text-sm px-6 py-12">Loading plan…</p>
  }

  if (error || !plan) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center font-body">
        <p className="text-slate-400 text-sm mb-4">{error || 'Plan not found.'}</p>
        <Link to="/plans" className="text-coral-400 hover:text-coral-300 text-sm font-semibold">
          ← Back to your plans
        </Link>
      </div>
    )
  }

  const today = todayIndex()
  const groups = groupByDay(plan.plan_exercises)
  const dayKeys = [...DAY_NAMES.map((_, i) => i), 'unscheduled'].filter((k) => groups.has(k))

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 font-body space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading font-bold text-2xl">{plan.name}</h1>
            {plan.is_active && (
              <span className="text-xs font-semibold uppercase tracking-wide text-emerald-400 border border-emerald-400/40 rounded-full px-2 py-0.5">
                Active
              </span>
            )}
          </div>
          {plan.notes && <p className="text-sm text-slate-400 mt-1">{plan.notes}</p>}
        </div>
        {!plan.is_active && (
          <button
            onClick={handleActivate}
            disabled={activating}
            className="px-4 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-heading font-semibold whitespace-nowrap"
          >
            {activating ? 'Activating…' : 'Make this my active plan'}
          </button>
        )}
      </div>

      {plan.plan_exercises.length === 0 ? (
        <p className="text-sm text-slate-500">This plan has no exercises yet.</p>
      ) : (
        dayKeys.map((key) => {
          const isToday = key === today
          const label = key === 'unscheduled' ? 'Any day' : DAY_NAMES[key]
          return (
            <div key={key} className={`card p-6 ${isToday ? 'border-coral-500/60' : ''}`}>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="font-heading font-semibold">{label}</h2>
                {isToday && (
                  <span className="text-xs font-semibold uppercase tracking-wide text-coral-400 border border-coral-500/40 rounded-full px-2 py-0.5">
                    Today
                  </span>
                )}
              </div>
              <div className="space-y-3">
                {groups.get(key).map((pe) => (
                  <div
                    key={pe.id}
                    className="flex items-center justify-between border-b border-forest-800 last:border-0 pb-3 last:pb-0"
                  >
                    <div>
                      <p className="font-semibold text-sm">{pe.exercise.name}</p>
                      {pe.exercise.muscle_group && (
                        <p className="text-xs text-slate-500">{pe.exercise.muscle_group}</p>
                      )}
                    </div>
                    <div className="text-right text-sm text-slate-300 tabular-nums">
                      {pe.sets && pe.reps ? (
                        <p>
                          {pe.sets} × {pe.reps}
                          {pe.target_weight ? ` @ ${pe.target_weight}` : ''}
                        </p>
                      ) : (
                        <p className="text-slate-500">—</p>
                      )}
                      {pe.rest_seconds && <p className="text-xs text-slate-500">{pe.rest_seconds}s rest</p>}
                    </div>
                  </div>
                ))}
              </div>
              {isToday && (
                <button
                  onClick={() => navigate('/live-session', { state: { planExercises: groups.get(key) } })}
                  className="mt-4 px-4 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 text-sm font-heading font-semibold"
                >
                  Start today's session →
                </button>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
