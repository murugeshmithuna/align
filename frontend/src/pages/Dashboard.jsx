import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import CheckinModal from '../components/CheckinModal.jsx'
import MacroBar from '../components/MacroBar.jsx'
import ProgressRing from '../components/ProgressRing.jsx'
import { useSession } from '../context/SessionContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { COACH_DATA_CHANGED_EVENT } from '../utils/coachEvents.js'

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

  const loadPlan = useCallback(() => {
    api
      .listPlans(userId)
      .then((plans) => {
        const activePlans = plans.filter((p) => p.is_active)
        const active =
          activePlans.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] ||
          plans[plans.length - 1] ||
          null
        setPlan(active)
      })
      .catch(() => setPlan(null))
      .finally(() => setPlanLoading(false))
  }, [userId])

  const loadActivity = useCallback(() => {
    Promise.all([api.listLogs(userId).catch(() => []), api.listMealAnalyses(userId).catch(() => [])])
      .then(([logData, mealData]) => {
        setLogs(logData)
        setMeals(mealData)
      })
      .finally(() => setActivityLoading(false))
  }, [userId])

  useEffect(() => {
    loadPlan()

    api
      .getTodaysCheckin(userId)
      .then((data) => setCheckin(data))
      .catch(() => setShowCheckinModal(true))
      .finally(() => setCheckinLoading(false))

    api.getProfile(userId).then(setProfile).catch(() => setProfile(null))

    loadActivity()
  }, [userId, loadPlan, loadActivity])

  // The AI Coach's floating drawer is mounted separately from this page - a
  // confirmed "Added X to your plan"/"Logged Y" reply otherwise left the
  // Dashboard showing pre-change data until a manual reload (reproduced
  // live). Refetches silently in the background, no loading-state flash.
  useEffect(() => {
    function handleCoachChange() {
      loadPlan()
      loadActivity()
    }
    window.addEventListener(COACH_DATA_CHANGED_EVENT, handleCoachChange)
    return () => window.removeEventListener(COACH_DATA_CHANGED_EVENT, handleCoachChange)
  }, [loadPlan, loadActivity])

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
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-heading font-semibold">Today's readiness</h2>
            <Link to="/calendar" className="text-xs font-semibold text-coral-400 hover:text-coral-300 whitespace-nowrap">
              📅 Calendar & weekly analysis →
            </Link>
          </div>
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
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading font-semibold">This week</h2>
            {/* Two-tone status pill (lime = on track, amber = behind) - same
                semantic convention as the new Calendar dashboard tiles. Only
                shown once there's a real target and real activity data to
                judge it against, never a guessed default. */}
            {!activityLoading && profile?.target_frequency && (
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap ${
                  workoutsThisWeek >= profile.target_frequency
                    ? 'text-coral-400 bg-coral-500/10'
                    : 'text-amber-400 bg-amber-500/10'
                }`}
              >
                {workoutsThisWeek >= profile.target_frequency ? 'On track' : 'Behind'}
              </span>
            )}
          </div>
          <div className="flex items-center justify-center gap-6 mb-4 pb-4 border-b border-forest-800">
            <ProgressRing
              value={workoutsThisWeek}
              target={profile?.target_frequency}
              label={profile?.target_frequency ? `Workouts / ${profile.target_frequency}` : 'Workouts'}
            />
            {todaysNutrition.count > 0 && (
              <ProgressRing
                value={todaysNutrition.calories}
                target={profile?.daily_calorie_target}
                label="Calories"
                unit="kcal"
              />
            )}
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

        {/* Recent Activity - a clean log of the single most recent item, no
            AI-generated text. A prior version fetched a one-off /agent/chat
            "tip" here per most-recent-activity; removed entirely, since that
            call shared the orchestrator's system prompt (which lists real
            tool names like ask_nutrition in prose) and could echo one back
            to the user, or narrate about needing to call a tool it never
            actually called. Aggregated, tool-free nutrition insights now
            live on /nutrition (daily review) and /analytics (weekly review)
            instead of a per-item micro-insight here. */}
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
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs text-slate-400 tabular-nums">
                  {mostRecentMeal.estimated_calories} kcal · {new Date(mostRecentMeal.analyzed_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                  P {Math.round(mostRecentMeal.protein_g)}g
                </span>
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400">
                  C {Math.round(mostRecentMeal.carbs_g)}g
                </span>
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
                  F {Math.round(mostRecentMeal.fat_g)}g
                </span>
              </div>
            </div>
          )}
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
