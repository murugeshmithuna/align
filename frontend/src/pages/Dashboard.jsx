import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import CheckinModal from '../components/CheckinModal.jsx'
import { useSession } from '../context/SessionContext.jsx'
import { useToast } from '../context/ToastContext.jsx'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function todayIndex() {
  // JS getDay() is 0=Sunday..6=Saturday; plan_exercises.day_of_week is 0=Monday..6=Sunday.
  return (new Date().getDay() + 6) % 7
}

function isToday(dateInput) {
  const d = new Date(dateInput)
  const now = new Date()
  return d.toDateString() === now.toDateString()
}

function isWithinLastDays(dateInput, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return new Date(dateInput).getTime() >= cutoff
}

// No target set falls back to "filled if anything's logged, empty
// otherwise" (same fallback the workouts-this-week bar above already uses)
// rather than a fabricated percentage against a number that doesn't exist.
function MacroBar({ label, value, target, unit, color }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="text-xs font-semibold tabular-nums">
          {Math.round(value).toLocaleString()}
          {unit}
          {target ? ` / ${Math.round(target).toLocaleString()}${unit}` : ''}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-forest-900 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{
            width: target ? `${Math.min(100, (value / target) * 100)}%` : value > 0 ? '100%' : '0%',
          }}
        />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { userId } = useSession()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [plan, setPlan] = useState(null)
  const [planLoading, setPlanLoading] = useState(true)
  const [checkin, setCheckin] = useState(null)
  const [checkinLoading, setCheckinLoading] = useState(true)
  const [showCheckinModal, setShowCheckinModal] = useState(false)
  const [profile, setProfile] = useState(null)
  const [logs, setLogs] = useState([])
  const [meals, setMeals] = useState([])
  const [activityLoading, setActivityLoading] = useState(true)
  const [tip, setTip] = useState('')
  const [tipLoading, setTipLoading] = useState(true)

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

    api.getProfile(userId).then(setProfile).catch(() => setProfile(null))

    Promise.all([api.listLogs(userId).catch(() => []), api.listMealAnalyses(userId).catch(() => [])])
      .then(([logData, mealData]) => {
        setLogs(logData)
        setMeals(mealData)
      })
      .finally(() => setActivityLoading(false))
  }, [userId])

  // The AI tip is fetched in the background, separately from the rest of the
  // page - it needs a real model call (no fabricated "insight"), but nothing
  // else on the dashboard should wait on it.
  useEffect(() => {
    if (activityLoading) return
    const mostRecentLog = logs[0]
    const mostRecentMeal = meals[0]
    if (!mostRecentLog && !mostRecentMeal) {
      setTipLoading(false)
      return
    }
    const parts = []
    if (mostRecentLog) {
      parts.push(
        `Most recent workout: ${mostRecentLog.exercise.name}, ${mostRecentLog.sets}x${mostRecentLog.reps}${
          mostRecentLog.weight ? ` @ ${mostRecentLog.weight}` : ''
        }.`,
      )
    }
    if (mostRecentMeal) {
      parts.push(`Most recent meal logged: ${mostRecentMeal.description} (~${mostRecentMeal.estimated_calories} kcal).`)
    }
    api
      .chat({
        user_id: userId,
        message: `${parts.join(' ')} Give me exactly one short encouraging or actionable coaching sentence based on this - no preamble, no questions.`,
      })
      .then((data) => setTip(data.reply))
      .catch(() => setTip(''))
      .finally(() => setTipLoading(false))
    // Only re-run when the underlying activity actually changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityLoading, userId])

  function handleCheckinSubmitted(result) {
    setCheckin(result)
    setShowCheckinModal(false)
    showToast(`Check-in saved: ${result.label}`)
  }

  const todaysExercises = useMemo(() => {
    if (!plan) return []
    return plan.plan_exercises.filter((pe) => pe.day_of_week === todayIndex())
  }, [plan])

  const workoutsThisWeek = useMemo(() => {
    const days = new Set(
      logs.filter((log) => isWithinLastDays(log.performed_at, 7)).map((log) => new Date(log.performed_at).toDateString()),
    )
    return days.size
  }, [logs])

  const todaysNutrition = useMemo(() => {
    const todaysMeals = meals.filter((m) => isToday(m.analyzed_at))
    return {
      count: todaysMeals.length,
      calories: todaysMeals.reduce((sum, m) => sum + m.estimated_calories, 0),
      protein: todaysMeals.reduce((sum, m) => sum + m.protein_g, 0),
      carbs: todaysMeals.reduce((sum, m) => sum + m.carbs_g, 0),
      fat: todaysMeals.reduce((sum, m) => sum + m.fat_g, 0),
    }
  }, [meals])

  const mostRecentLog = logs[0]
  const mostRecentMeal = meals[0]
  const mostRecentIsLog =
    mostRecentLog && (!mostRecentMeal || new Date(mostRecentLog.performed_at) >= new Date(mostRecentMeal.analyzed_at))

  function startTodaysWorkout() {
    navigate('/workout/live', { state: { planExercises: todaysExercises, planId: plan.id } })
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 font-body space-y-6">
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Today's Workout Overview */}
        <div className="card p-6 flex flex-col">
          <h2 className="font-heading font-semibold mb-2">Today's workout</h2>
          {planLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : !plan ? (
            <p className="text-sm text-slate-500 flex-1">Activate a plan to see today's routine here.</p>
          ) : todaysExercises.length === 0 ? (
            <p className="text-sm text-slate-500 flex-1">
              Nothing scheduled for {DAY_NAMES[todayIndex()]} - rest day, or log something manually.
            </p>
          ) : (
            <div className="flex-1">
              <p className="text-sm font-semibold">
                {DAY_NAMES[todayIndex()]} · {todaysExercises.length} exercise
                {todaysExercises.length === 1 ? '' : 's'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {todaysExercises.map((pe) => pe.exercise.name).join(', ')}
              </p>
            </div>
          )}
          <div className="flex flex-col gap-2 mt-4">
            <button
              onClick={startTodaysWorkout}
              disabled={todaysExercises.length === 0}
              className="px-4 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-heading font-semibold"
            >
              Start today's live workout
            </button>
            <Link
              to="/workout/log"
              className="px-4 py-2 rounded-lg border border-forest-700 hover:border-coral-400 transition-colors text-sm font-heading font-semibold text-center"
            >
              Log manually
            </Link>
          </div>
        </div>

        {/* Weekly Progress / Nutrition Snapshot */}
        <div className="card p-6">
          <h2 className="font-heading font-semibold mb-3">This week</h2>
          <div className="mb-4">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs text-slate-500">Workouts</span>
              <span className="text-sm font-semibold tabular-nums">
                {workoutsThisWeek}
                {profile?.target_frequency ? ` / ${profile.target_frequency} days` : ' days logged'}
              </span>
            </div>
            <div className="h-2 rounded-full bg-forest-900 overflow-hidden">
              <div
                className="h-full bg-coral-500 rounded-full transition-all"
                style={{
                  width: profile?.target_frequency
                    ? `${Math.min(100, (workoutsThisWeek / profile.target_frequency) * 100)}%`
                    : workoutsThisWeek > 0
                      ? '100%'
                      : '0%',
                }}
              />
            </div>
          </div>
          <div>
            <span className="text-xs text-slate-500">Today's macros</span>
            {activityLoading ? (
              <p className="text-sm text-slate-500 mt-1">Loading…</p>
            ) : todaysNutrition.count === 0 ? (
              <p className="text-sm text-slate-500 mt-1">
                None yet -{' '}
                <Link to="/nutrition" className="text-coral-400 hover:text-coral-300">
                  log a meal
                </Link>
                .
              </p>
            ) : (
              <div className="space-y-2.5 mt-2">
                <MacroBar
                  label="Calories"
                  value={todaysNutrition.calories}
                  target={profile?.daily_calorie_target}
                  unit=" kcal"
                  color="bg-coral-500"
                />
                <MacroBar
                  label="Protein"
                  value={todaysNutrition.protein}
                  target={profile?.daily_protein_target}
                  unit="g"
                  color="bg-emerald-500"
                />
                <MacroBar
                  label="Carbs"
                  value={todaysNutrition.carbs}
                  target={profile?.daily_carbs_target}
                  unit="g"
                  color="bg-sky-500"
                />
                <MacroBar
                  label="Fat"
                  value={todaysNutrition.fat}
                  target={profile?.daily_fat_target}
                  unit="g"
                  color="bg-amber-500"
                />
                {!profile?.daily_calorie_target &&
                  !profile?.daily_protein_target &&
                  !profile?.daily_carbs_target &&
                  !profile?.daily_fat_target && (
                    <p className="text-xs text-slate-500">
                      No daily targets set -{' '}
                      <Link to="/profile" className="text-coral-400 hover:text-coral-300">
                        add some
                      </Link>
                      .
                    </p>
                  )}
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity + AI Coach Insight */}
        <div className="card p-6">
          <h2 className="font-heading font-semibold mb-3">Recent activity</h2>
          {activityLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : !mostRecentLog && !mostRecentMeal ? (
            <p className="text-sm text-slate-500">Nothing logged yet - your activity will show up here.</p>
          ) : mostRecentIsLog ? (
            <div>
              <p className="text-sm font-semibold">{mostRecentLog.exercise.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {mostRecentLog.sets}×{mostRecentLog.reps}
                {mostRecentLog.weight ? ` @ ${mostRecentLog.weight}` : ''} ·{' '}
                {new Date(mostRecentLog.performed_at).toLocaleDateString()}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold">{mostRecentMeal.description}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                ~{mostRecentMeal.estimated_calories} kcal ·{' '}
                {new Date(mostRecentMeal.analyzed_at).toLocaleDateString()}
              </p>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-forest-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-1.5">AI Coach insight</p>
            {tipLoading ? (
              <p className="text-sm text-slate-500 flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-forest-700 border-t-coral-500 rounded-full animate-spin" />
                Thinking…
              </p>
            ) : tip ? (
              <p className="text-sm text-slate-300 leading-relaxed">{tip}</p>
            ) : (
              <p className="text-sm text-slate-500">Log a workout or meal to get a tailored tip here.</p>
            )}
          </div>
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
