import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import CheckinModal from '../components/CheckinModal.jsx'
import CoachAIIndicator from '../components/CoachAIIndicator.jsx'
import MacroBar from '../components/MacroBar.jsx'
import ProgressRing from '../components/ProgressRing.jsx'
import { useSession } from '../context/SessionContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { COACH_DATA_CHANGED_EVENT, openAiCoach } from '../utils/coachEvents.js'

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
    <div className="max-w-7xl mx-auto px-6 py-10 font-body space-y-8">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">Command center</p>
        <h1 className="font-heading font-bold text-3xl mt-0.5">Welcome back</h1>
        <p className="text-sm text-slate-400 mt-1">Here's where things stand today.</p>
      </div>

      {/* Today's state - the strongest visual position on the page, per the
          "how am I doing today" priority. An open composition (no card
          border) so the readiness number itself carries the weight, not a
          box around it. Readiness and Recovery are two facets of the same
          real check-in record (score vs. plan_status), not two separate
          data sources - presented as two labeled halves of one hero row
          rather than one new "recovery" metric that doesn't exist. */}
      <div className="border-b border-forest-800 pb-8">
        <div className="flex flex-col lg:flex-row lg:items-center gap-8">
          {checkinLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : checkin ? (
            <div className="flex flex-wrap items-center gap-8">
              <div>
                <p className="font-heading font-bold text-6xl tabular-nums leading-none">
                  {checkin.score}
                  <span className="text-2xl text-slate-600">/5</span>
                </p>
                <p className="text-xs uppercase tracking-wide text-slate-500 mt-2">Readiness</p>
              </div>
              <div className="h-12 w-px bg-forest-800 hidden sm:block" />
              <div>
                <p className="text-lg font-heading font-semibold">{checkin.label}</p>
                <p className={`text-sm mt-1 ${checkin.plan_status !== 'normal' ? 'text-coral-400' : 'text-slate-500'}`}>
                  Recovery:{' '}
                  {checkin.plan_status !== 'normal' ? (
                    <>
                      today auto-marked <strong>{checkin.plan_status_label}</strong>
                    </>
                  ) : (
                    'normal training load'
                  )}
                </p>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-slate-500 mb-3">You haven't checked in today.</p>
              <Link
                to="/checkin"
                className="inline-block px-5 py-2.5 rounded-xl bg-coral-500 hover:bg-coral-600 text-sm font-heading font-semibold"
              >
                Check in now
              </Link>
            </div>
          )}
          <Link
            to="/calendar"
            className="lg:ml-auto text-xs font-semibold text-coral-400 hover:text-coral-300 whitespace-nowrap"
          >
            Calendar & weekly analysis →
          </Link>
        </div>
      </div>

      {/* What should I do today? / How am I progressing? - the primary
          working pair. Today's Workout gets the wider column since it's the
          single most actionable item; the active-plan summary that used to
          be its own separate card now lives as this panel's own subheading
          instead of a second box holding the same underlying `plan`. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 card p-6 flex flex-col">
          <h2 className="font-heading font-semibold mb-3">Today's workout</h2>
          {planLoading ? (
            <p className="text-sm text-slate-500 flex-1">Loading…</p>
          ) : !plan ? (
            <div className="flex-1">
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
            </div>
          ) : (
            <div className="flex-1">
              <Link to={`/plan/${plan.id}`} className="inline-block hover:opacity-90 transition-opacity">
                <p className="text-sm font-semibold text-coral-400">{plan.name} →</p>
              </Link>
              <div className="mt-3">
                {todaysExercises.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Nothing scheduled for {DAY_NAMES[todayIndex()]} - rest day, or log something manually.
                  </p>
                ) : (
                  <>
                    <p className="font-heading font-semibold text-lg">
                      {DAY_NAMES[todayIndex()]}
                      <span className="text-slate-500 font-normal text-sm ml-2">
                        {todaysExercises.length} exercise{todaysExercises.length === 1 ? '' : 's'}
                      </span>
                    </p>
                    <p className="text-sm text-slate-400 mt-1">
                      {todaysExercises.map((pe) => pe.exercise.name).join(', ')}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2 mt-5">
            <button
              onClick={startTodaysWorkout}
              disabled={todaysExercises.length === 0}
              className="flex-1 px-4 py-2.5 rounded-xl bg-coral-500 hover:bg-coral-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-heading font-semibold transition-colors"
            >
              Start today's live workout
            </button>
            <Link
              to="/workout/log"
              className="px-4 py-2.5 rounded-xl border border-forest-700 hover:border-coral-400 transition-colors text-sm font-heading font-semibold text-center"
            >
              Log manually
            </Link>
          </div>
        </div>

        {/* This week - a metric cluster (rings + macro bars), kept as one
            card since it's a genuinely coherent group of related weekly
            numbers, not five separate boxes for five separate metrics. */}
        <div className="lg:col-span-5 card p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading font-semibold">This week</h2>
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
      </div>

      {/* What needs my attention? / What does ALIGN recommend? - secondary
          row, deliberately smaller than the pair above. Recent activity's
          logic/copy is completely unchanged (see the comment on its
          branches below); the AI panel is a pure navigation entry point
          into the already-existing Ask Coach drawer - no new data, no new
          behavior, just a visual signal consistent with the Coach AI
          artwork's language. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

        <div className="card p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 shrink-0">
              <CoachAIIndicator />
            </div>
            <div className="flex-1 min-w-0 sm:hidden">
              <p className="text-xs uppercase tracking-wide text-slate-500">AI Coach</p>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wide text-slate-500 hidden sm:block">AI Coach</p>
            <p className="text-sm text-slate-400 mt-0.5">
              Ask anything, or send a training dilemma to Coach Resolution.
            </p>
          </div>
          <button
            type="button"
            onClick={openAiCoach}
            className="shrink-0 w-full sm:w-auto px-4 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 text-sm font-heading font-semibold transition-colors"
          >
            Ask Coach
          </button>
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
