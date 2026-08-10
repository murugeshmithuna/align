import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import CheckinModal from '../components/CheckinModal.jsx'
import MacroBar from '../components/MacroBar.jsx'
import { ConcentricRings } from '../components/ProgressRing.jsx'
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

// Same grouping helper PlanDetail.jsx uses to lay out a plan's weekly
// schedule - mirrored here (not imported, since PlanDetail doesn't export
// it) so the Dashboard's "Upcoming workouts" list agrees with how the plan
// detail page itself groups the exact same `plan_exercises` data.
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

const READINESS_SUBTITLES = {
  rest_mobility: 'Take it easy today - recovery mode.',
  scaled_down: "Scaled back today - listen to your body.",
  normal: "You're ready to train today.",
}

const DIFFICULTY_LABELS = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
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

  const firstName = profile?.name ? profile.name.split(' ')[0] : null
  const subtitle = checkinLoading
    ? "Here's where things stand today."
    : checkin
      ? READINESS_SUBTITLES[checkin.plan_status] || "Here's where things stand today."
      : "Here's where things stand today."

  const hasNutritionTargets =
    profile?.daily_calorie_target || profile?.daily_protein_target || profile?.daily_carbs_target || profile?.daily_fat_target

  const weeklyRings = [
    {
      key: 'workouts',
      value: workoutsThisWeek,
      target: profile?.target_frequency,
      color: 'var(--color-coral-500)',
    },
    ...(todaysNutrition.count > 0
      ? [
          { key: 'calories', value: todaysNutrition.calories, target: profile?.daily_calorie_target, color: 'var(--color-coral-400)' },
          { key: 'protein', value: todaysNutrition.protein, target: profile?.daily_protein_target, color: 'var(--color-coral-600)' },
        ]
      : []),
  ]

  const dayGroups = plan ? groupByDay(plan.plan_exercises) : new Map()
  const today = todayIndex()
  const orderedDayKeys = plan
    ? [...Array(7).keys()].map((offset) => (today + offset) % 7).filter((key) => dayGroups.has(key))
    : []
  if (plan && dayGroups.has('unscheduled')) orderedDayKeys.push('unscheduled')

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 font-body space-y-6">
      {/* Greeting header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {profile?.photo_url ? (
            <img src={profile.photo_url} alt={profile.name} className="w-12 h-12 rounded-full object-cover" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-forest-800 text-coral-300 flex items-center justify-center text-lg font-heading font-semibold">
              {profile?.name ? profile.name[0].toUpperCase() : '?'}
            </div>
          )}
          <div>
            <h1 className="font-heading font-bold text-2xl">Hey{firstName ? `, ${firstName}` : ''}!</h1>
            <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>
          </div>
        </div>
        <Link
          to="/profile"
          aria-label="Profile settings"
          className="w-10 h-10 rounded-full border border-forest-700 flex items-center justify-center text-coral-400 hover:border-coral-400 transition-colors shrink-0"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
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

      {/* This week - concentric rings (workouts / calories / protein) */}
      <div className="card p-6">
        <h2 className="font-heading font-semibold mb-4">This week</h2>
        <div className="flex items-center gap-6 flex-wrap sm:flex-nowrap">
          <ConcentricRings rings={weeklyRings} size={140} />
          <div className="flex-1 min-w-[180px] space-y-3">
            <StatRow
              color="var(--color-coral-500)"
              text={
                profile?.target_frequency
                  ? `${workoutsThisWeek}/${profile.target_frequency} workouts`
                  : `${workoutsThisWeek} workout${workoutsThisWeek === 1 ? '' : 's'} logged`
              }
            />
            {todaysNutrition.count > 0 ? (
              <>
                <StatRow
                  color="var(--color-coral-400)"
                  text={
                    profile?.daily_calorie_target
                      ? `${Math.round(todaysNutrition.calories).toLocaleString()}/${Math.round(profile.daily_calorie_target).toLocaleString()} kcal`
                      : `${Math.round(todaysNutrition.calories).toLocaleString()} kcal logged`
                  }
                />
                <StatRow
                  color="var(--color-coral-600)"
                  text={
                    profile?.daily_protein_target
                      ? `${Math.round(todaysNutrition.protein)}/${Math.round(profile.daily_protein_target)}g protein`
                      : `${Math.round(todaysNutrition.protein)}g protein logged`
                  }
                />
              </>
            ) : (
              <p className="text-sm text-slate-500">
                No meals logged today -{' '}
                <Link to="/nutrition" className="text-coral-400 hover:text-coral-300">
                  log one
                </Link>
                .
              </p>
            )}
          </div>
        </div>

        {todaysNutrition.count > 0 && (
          <div className="mt-5 pt-4 border-t border-forest-800 space-y-2.5">
            <MacroBar label="Carbs" value={todaysNutrition.carbs} target={profile?.daily_carbs_target} unit="g" color="bg-sky-500" />
            <MacroBar label="Fat" value={todaysNutrition.fat} target={profile?.daily_fat_target} unit="g" color="bg-amber-500" />
            {!hasNutritionTargets && (
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

      {/* Upcoming workouts */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-semibold">Upcoming workouts</h2>
          {plan && (
            <Link to={`/plan/${plan.id}`} className="text-xs text-coral-400 hover:text-coral-300 font-semibold">
              View all →
            </Link>
          )}
        </div>

        {planLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : !plan ? (
          <p className="text-sm text-slate-500">Activate a plan to see your weekly schedule here.</p>
        ) : orderedDayKeys.length === 0 ? (
          <p className="text-sm text-slate-500">This plan has no exercises yet.</p>
        ) : (
          <div className="space-y-3">
            {orderedDayKeys.map((key) => {
              const isTodayRow = key === today
              const label = key === 'unscheduled' ? 'Any day' : DAY_NAMES[key]
              const exercises = dayGroups.get(key)
              return (
                <div
                  key={key}
                  className={`rounded-2xl border p-4 flex items-center justify-between gap-4 flex-wrap ${
                    isTodayRow ? 'border-coral-500/60 bg-forest-900/60' : 'border-forest-800 bg-forest-900/30'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-heading font-semibold text-sm">{label}</p>
                      {isTodayRow && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-coral-400 border border-coral-500/40 rounded-full px-2 py-0.5">
                          Today
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {exercises.length} exercise{exercises.length === 1 ? '' : 's'} ·{' '}
                      {exercises.map((pe) => pe.exercise.name).join(', ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {profile?.experience_level && DIFFICULTY_LABELS[profile.experience_level] && (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-coral-500/15 text-coral-300 border border-coral-500/30">
                        {DIFFICULTY_LABELS[profile.experience_level]}
                      </span>
                    )}
                    {isTodayRow ? (
                      <button
                        onClick={startTodaysWorkout}
                        className="px-3.5 py-1.5 rounded-lg bg-coral-500 hover:bg-coral-600 text-xs font-heading font-semibold whitespace-nowrap"
                      >
                        Start live workout
                      </button>
                    ) : (
                      <Link
                        to={`/plan/${plan.id}`}
                        className="px-3.5 py-1.5 rounded-lg border border-forest-700 hover:border-coral-400 transition-colors text-xs font-heading font-semibold whitespace-nowrap"
                      >
                        View
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
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

function StatRow({ color, text }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-sm font-semibold tabular-nums">{text}</span>
    </div>
  )
}
