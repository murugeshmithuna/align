import { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'

// Self-contained in-app activity calendar - NOT a Google Calendar
// integration (that's a separate, still-deferred feature waiting on OAuth
// credentials, see CLAUDE.md's "Next milestones"). This page's only job is
// tracking days and which days have a workout scheduled: the existing
// month grid + per-day indicator dots for logged activity (workout/meal/
// check-in), plus a distinct hollow marker for days the active plan
// schedules a workout on (day-of-week match, not "actually happened" -
// see the legend). The richer weekly chart/insights dashboard that used to
// live below the grid here has moved to the Weekly AI Recap card on
// /analytics, where it belongs alongside the other AI-era weekly reviews.

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LABEL_FMT = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })

// Every timestamp from the backend (performed_at/analyzed_at/checkin_date)
// is grouped by its date portion, mirroring exactly how the backend itself
// groups by day (`log.performed_at.date()` in logs.py's /progress endpoint
// and fatigue.py's daily_loads()) - no timezone conversion, just the same
// leading "YYYY-MM-DD" slice used server-side.
function dateKey(isoString) {
  return isoString.slice(0, 10)
}

function dateKeyFromLocalDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// plan_exercises.day_of_week is 0=Monday..6=Sunday (same convention
// Dashboard.jsx's todayIndex()/PlanDetail.jsx's groupByDay use); JS
// Date#getDay() is 0=Sunday..6=Saturday, so this shifts one into the other.
function dowFromDate(d) {
  return (d.getDay() + 6) % 7
}

// Same formula as GET /logs/user/{id}/progress's volume_by_date (sets *
// reps * weight, summed) - deliberately not fatigue.py's session_load,
// which additionally scales by RPE/10 for the Banister model's training-
// load proxy. The day-detail panel wants a plain, familiar "total volume"
// number, which is what /progress already reports elsewhere in the app.
function logVolume(log) {
  return (log.sets || 0) * (log.reps || 0) * (log.weight || 0)
}

function buildMonthGrid(year, month) {
  // month is 0-indexed (Date's convention). Returns a flat array of Date
  // objects covering full weeks (Sun-Sat) so the grid always has complete
  // rows, including leading/trailing days from adjacent months.
  const firstOfMonth = new Date(year, month, 1)
  const startOffset = firstOfMonth.getDay() // 0=Sun
  const gridStart = new Date(year, month, 1 - startOffset)

  const lastOfMonth = new Date(year, month + 1, 0)
  const endOffset = 6 - lastOfMonth.getDay()
  const totalDays = startOffset + lastOfMonth.getDate() + endOffset

  return Array.from({ length: totalDays }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    return d
  })
}

function DayDetailPanel({ date, dayData, scheduledExercises, onClose }) {
  const label = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const { logs = [], meals = [], checkin = null } = dayData || {}
  const totalVolume = logs.reduce((sum, log) => sum + logVolume(log), 0)
  const mealTotals = meals.reduce(
    (acc, m) => ({
      calories: acc.calories + (m.estimated_calories || 0),
      protein: acc.protein + (m.protein_g || 0),
      carbs: acc.carbs + (m.carbs_g || 0),
      fat: acc.fat + (m.fat_g || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )

  const hasAnything = logs.length > 0 || meals.length > 0 || checkin || scheduledExercises.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="card w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 bg-forest-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="font-heading font-bold text-lg">{label}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-coral-300 text-sm shrink-0">
            Close
          </button>
        </div>

        {!hasAnything && (
          <p className="text-sm text-slate-400">No activity logged this day.</p>
        )}

        {scheduledExercises.length > 0 && (
          <div className="mb-5">
            <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">Scheduled (active plan)</h3>
            <ul className="space-y-2">
              {scheduledExercises.map((pe) => (
                <li
                  key={pe.id}
                  className="flex items-center justify-between rounded-lg border border-dashed border-coral-400/50 px-3 py-2 text-sm"
                >
                  <span className="font-medium">{pe.exercise?.name || 'Exercise'}</span>
                  <span className="text-slate-400">
                    {pe.sets ?? '-'} x {pe.reps ?? '-'}
                    {pe.target_weight ? ` @ ${pe.target_weight}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {checkin && (
          <div className="mb-5">
            <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">Readiness check-in</h3>
            <div className="flex items-center justify-between bg-forest-800/60 rounded-lg px-3 py-2">
              <div>
                <p className="text-sm font-semibold">{checkin.label}</p>
                <p className="text-xs text-slate-400">Score {checkin.score} / 5</p>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-coral-300 bg-coral-500/10 px-2 py-1 rounded-full whitespace-nowrap">
                {checkin.plan_status_label}
              </span>
            </div>
          </div>
        )}

        {logs.length > 0 && (
          <div className="mb-5">
            <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">Workout</h3>
            <ul className="space-y-2">
              {logs.map((log) => (
                <li key={log.id} className="flex items-center justify-between bg-forest-800/60 rounded-lg px-3 py-2 text-sm">
                  <span className="font-medium">{log.exercise?.name || 'Exercise'}</span>
                  <span className="text-slate-400">
                    {log.sets ?? '-'} x {log.reps ?? '-'} @ {log.weight ?? 0}
                    {log.rpe != null ? ` (RPE ${log.rpe})` : ''}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-coral-300 font-semibold mt-2">
              Total volume: {totalVolume.toLocaleString()} lbs
            </p>
          </div>
        )}

        {meals.length > 0 && (
          <div>
            <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">Meals</h3>
            <ul className="space-y-2">
              {meals.map((meal) => (
                <li key={meal.id} className="bg-forest-800/60 rounded-lg px-3 py-2 text-sm">
                  <p className="font-medium">{meal.description}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {meal.estimated_calories} kcal · P {meal.protein_g}g · C {meal.carbs_g}g · F {meal.fat_g}g
                  </p>
                </li>
              ))}
            </ul>
            {meals.length > 1 && (
              <p className="text-sm text-coral-300 font-semibold mt-2">
                Daily total: {Math.round(mealTotals.calories)} kcal · P {Math.round(mealTotals.protein)}g · C{' '}
                {Math.round(mealTotals.carbs)}g · F {Math.round(mealTotals.fat)}g
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CalendarPage() {
  const { userId } = useSession()
  const [loading, setLoading] = useState(true)
  const [logsByDate, setLogsByDate] = useState({})
  const [mealsByDate, setMealsByDate] = useState({})
  const [checkinsByDate, setCheckinsByDate] = useState({})
  // Active plan's weekly schedule - used only for the "scheduled workout"
  // indicator/legend/day-detail entry, the same active-plan lookup
  // Dashboard.jsx/PlanDetail.jsx already do (find is_active, else the most
  // recently created plan).
  const [activePlan, setActivePlan] = useState(null)

  const today = new Date()
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(null)

  useEffect(() => {
    api
      .listPlans(userId)
      .then((plans) => {
        const active = plans.find((p) => p.is_active) || plans[plans.length - 1] || null
        setActivePlan(active)
      })
      .catch(() => setActivePlan(null))
  }, [userId])

  useEffect(() => {
    Promise.all([api.listLogs(userId), api.listMealAnalyses(userId), api.getCheckinHistory(userId)])
      .then(([logs, meals, checkins]) => {
        const byLogDate = {}
        for (const log of logs) {
          const key = dateKey(log.performed_at)
          ;(byLogDate[key] ||= []).push(log)
        }

        const byMealDate = {}
        for (const meal of meals) {
          const key = dateKey(meal.analyzed_at)
          ;(byMealDate[key] ||= []).push(meal)
        }

        const byCheckinDate = {}
        for (const checkin of checkins) {
          byCheckinDate[checkin.checkin_date] = checkin
        }

        setLogsByDate(byLogDate)
        setMealsByDate(byMealDate)
        setCheckinsByDate(byCheckinDate)
      })
      .catch(() => {
        // No history yet (or a fetch failure) - the grid still renders,
        // just with no indicator dots, same as an empty-state elsewhere
        // in this app rather than blocking the whole page.
      })
      .finally(() => setLoading(false))
  }, [userId])

  const gridDays = useMemo(
    () => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()),
    [cursor]
  )

  // Grouped by day_of_week (0=Monday..6=Sunday) so every occurrence of that
  // weekday in the visible month - past or future - shows the same planned
  // schedule, independent of which specific calendar dates it falls on.
  const scheduledByDow = useMemo(() => {
    const map = {}
    for (const pe of activePlan?.plan_exercises || []) {
      if (pe.day_of_week == null) continue
      ;(map[pe.day_of_week] ||= []).push(pe)
    }
    return map
  }, [activePlan])

  function dayDataFor(key) {
    return {
      logs: logsByDate[key] || [],
      meals: mealsByDate[key] || [],
      checkin: checkinsByDate[key] || null,
    }
  }

  function goToMonth(delta) {
    setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }

  const todayKey = dateKeyFromLocalDate(today)

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 font-body space-y-6">
      <div>
        <h1 className="font-heading font-bold text-2xl">Calendar</h1>
        <p className="text-sm text-slate-400 mt-1">
          Every logged workout, meal, and readiness check-in, aggregated by day, plus which days your
          active plan schedules a workout on - built entirely from your own activity and plan in this app.
        </p>
      </div>

      <div className="card p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => goToMonth(-1)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:text-coral-300 hover:bg-forest-800 transition-colors"
            aria-label="Previous month"
          >
            &larr; Prev
          </button>
          <h2 className="font-heading font-semibold text-base md:text-lg">
            {MONTH_LABEL_FMT.format(cursor)}
          </h2>
          <button
            onClick={() => goToMonth(1)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:text-coral-300 hover:bg-forest-800 transition-colors"
            aria-label="Next month"
          >
            Next &rarr;
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400 text-center py-10">Loading activity…</p>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="text-center text-[11px] uppercase tracking-wide text-slate-500 py-1">
                  {label}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {gridDays.map((d) => {
                const key = dateKeyFromLocalDate(d)
                const inMonth = d.getMonth() === cursor.getMonth()
                const isToday = key === todayKey
                const { logs, meals, checkin } = dayDataFor(key)
                const hasWorkout = logs.length > 0
                const hasMeal = meals.length > 0
                const hasCheckin = !!checkin
                const hasScheduled = (scheduledByDow[dowFromDate(d)] || []).length > 0

                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDate(d)}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-start pt-1.5 gap-1 text-xs transition-colors border ${
                      isToday
                        ? 'border-coral-500 bg-coral-500/10'
                        : hasScheduled
                          ? 'border-coral-500/30 hover:bg-forest-800'
                          : 'border-transparent hover:bg-forest-800'
                    } ${inMonth ? 'text-slate-200' : 'text-slate-600'}`}
                  >
                    <span className={isToday ? 'font-bold text-coral-300' : ''}>{d.getDate()}</span>
                    <div className="flex items-center gap-1 h-2">
                      {hasScheduled && (
                        <span
                          className="w-1.5 h-1.5 rounded-full border border-coral-400 bg-transparent"
                          title="Workout scheduled"
                        />
                      )}
                      {hasWorkout && <span className="w-1.5 h-1.5 rounded-full bg-coral-400" title="Workout logged" />}
                      {hasMeal && <span className="w-1.5 h-1.5 rounded-sm bg-coral-400" title="Meal logged" />}
                      {hasCheckin && (
                        <span className="w-1.5 h-1.5 rotate-45 bg-coral-400" title="Check-in submitted" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="flex items-center gap-4 mt-4 text-[11px] text-slate-500 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full border border-coral-400 bg-transparent" /> Scheduled (plan)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-coral-400" /> Workout logged
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-sm bg-coral-400" /> Meal
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rotate-45 bg-coral-400" /> Check-in
              </span>
            </div>
          </>
        )}
      </div>

      {selectedDate && (
        <DayDetailPanel
          date={selectedDate}
          dayData={dayDataFor(dateKeyFromLocalDate(selectedDate))}
          scheduledExercises={scheduledByDow[dowFromDate(selectedDate)] || []}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  )
}
