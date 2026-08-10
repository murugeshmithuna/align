import { useEffect, useMemo, useState } from 'react'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip } from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'
import { api } from '../api.js'
import MacroBar from '../components/MacroBar.jsx'
import ProgressRing from '../components/ProgressRing.jsx'
import { useSession } from '../context/SessionContext.jsx'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip)

// Single accent (electric lime) for the magnitude bar chart, plus the app's
// pre-existing amber tone (already used for fat/"surplus" elsewhere - see
// MacroBar.jsx, Progress.jsx's calorieBadge) reserved for the one semantic
// highlight (the week's peak day) - never a decorative third hue.
const LIME = '#c6ff3d'
const LIME_DIM = 'rgba(198, 255, 61, 0.35)'
const PEAK_COLOR = '#f59e0b'
// Macro donut reuses this app's already-established P/C/F colors exactly
// (MacroBar.jsx / MealPhoto.jsx / Dashboard.jsx: emerald/sky/amber) rather
// than inventing a new triad for the same three quantities.
const PROTEIN_COLOR = '#10b981'
const CARBS_COLOR = '#0ea5e9'
const FAT_COLOR = '#f59e0b'
const TEXT_MUTED = '#94a3b8'

// Self-contained in-app activity calendar - NOT a Google Calendar
// integration (that's a separate, still-deferred feature waiting on OAuth
// credentials, see CLAUDE.md's "Next milestones"). This page is built
// entirely from data this app already has: workout logs, meal analyses,
// and readiness check-ins, aggregated client-side by calendar day. No
// calendar library - plain `Date` math + a 7-column CSS grid, matching this
// project's zero-new-npm-dependency rule.

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

// Same formula as GET /logs/user/{id}/progress's volume_by_date (sets *
// reps * weight, summed) - deliberately not fatigue.py's session_load,
// which additionally scales by RPE/10 for the Banister model's training-
// load proxy. The day-detail panel wants a plain, familiar "total volume"
// number, which is what /progress already reports elsewhere in the app.
function logVolume(log) {
  return (log.sets || 0) * (log.reps || 0) * (log.weight || 0)
}

const WEEKDAY_SHORT_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'short' })
const WEEKDAY_LONG_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'long' })

// Returns `n` consecutive date keys ending at (and including) `endDate`,
// oldest first - used to build the last-7-days window for the weekly bar
// chart/insights below, reusing the exact same day-key convention as the
// rest of this page's logsByDate/mealsByDate/checkinsByDate aggregation.
function lastNDayKeys(n, endDate) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(endDate)
    d.setDate(d.getDate() - (n - 1 - i))
    return dateKeyFromLocalDate(d)
  })
}

function hasActivityOnDay(key, logsByDate, mealsByDate, checkinsByDate) {
  return !!(logsByDate[key]?.length || mealsByDate[key]?.length || checkinsByDate[key])
}

// Consecutive days of real logged activity (workout, meal, or check-in),
// walking backward from today - the same three per-day aggregations this
// page already builds, just read backward day-by-day instead of grouped by
// month. If today itself has nothing logged yet, that alone doesn't zero
// out an otherwise-real streak - counting starts from yesterday in that
// case, same as any habit-tracker streak reads intuitively.
function computeStreak(today, logsByDate, mealsByDate, checkinsByDate) {
  const cursor = new Date(today)
  if (!hasActivityOnDay(dateKeyFromLocalDate(cursor), logsByDate, mealsByDate, checkinsByDate)) {
    cursor.setDate(cursor.getDate() - 1)
  }
  let streak = 0
  while (hasActivityOnDay(dateKeyFromLocalDate(cursor), logsByDate, mealsByDate, checkinsByDate)) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
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

function DayDetailPanel({ date, dayData, onClose }) {
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

  const hasAnything = logs.length > 0 || meals.length > 0 || checkin

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

// Compact stat card - reuses the app's existing .card surface, matches the
// big-number convention already used elsewhere (Dashboard.jsx's readiness
// score, ProgressRing's center value): font-heading font-bold, large size.
function StatCard({ label, value, unit, sub, badge, className = '' }) {
  return (
    <div className={`card p-4 ${className}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-xs text-slate-500">{label}</span>
        {badge}
      </div>
      <p className="font-heading font-bold text-2xl leading-none">
        {value}
        {unit && <span className="text-sm text-slate-400 font-normal ml-1">{unit}</span>}
      </p>
      {sub && <p className="text-xs text-slate-500 mt-1.5">{sub}</p>}
    </div>
  )
}

// Two tones only, per this app's dataviz convention: lime for "on track /
// stable", the pre-existing amber warning tone (already used for fat/
// "surplus" elsewhere - MacroBar.jsx, Progress.jsx) for a swing worth
// attention. Direction alone (up vs down) isn't inherently good or bad
// without knowing the user's specific goal (cut vs. bulk), so the tone is
// driven by magnitude - a small week-over-week move reads as "on track",
// a large one is flagged for attention either direction - rather than
// guessing at the user's intent.
function TrendBadge({ pct }) {
  if (pct == null) return null
  const isBigSwing = Math.abs(pct) >= 20
  const tone = isBigSwing ? 'text-amber-400 bg-amber-500/10' : 'text-coral-400 bg-coral-500/10'
  const arrow = pct < 0 ? '↓' : pct > 0 ? '↑' : '→'
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap ${tone}`}
    >
      {arrow} {Math.abs(pct)}% vs last week
    </span>
  )
}

function buildCaloriesBarData(weekKeys, dailyCalories, peakIndex) {
  return {
    labels: weekKeys.map((k) => WEEKDAY_SHORT_FMT.format(new Date(`${k}T00:00:00`))),
    datasets: [
      {
        data: dailyCalories,
        backgroundColor: dailyCalories.map((_, i) => (i === peakIndex ? PEAK_COLOR : LIME_DIM)),
        borderRadius: 4,
        maxBarThickness: 32,
      },
    ],
  }
}

const caloriesBarOptions = {
  responsive: true,
  maintainAspectRatio: false,
  // Headroom for the direct value label drawn above the peak bar (see
  // buildPeakLabelPlugin below) - without it the label clips against the
  // canvas edge on a short chart when the peak bar is tall.
  layout: { padding: { top: 20 } },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#17171b',
      borderColor: 'rgba(198, 255, 61, 0.35)',
      borderWidth: 1,
      titleColor: '#e2e8f0',
      bodyColor: '#e2e8f0',
      padding: 10,
      displayColors: false,
      callbacks: { label: (ctx) => `${ctx.parsed.y.toLocaleString()} kcal` },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { color: TEXT_MUTED } },
    y: { display: false, beginAtZero: true },
  },
}

// Direct-labels the week's peak calorie bar with its real value. Chart.js
// core has no built-in data-label support and this app deliberately avoids
// adding the chartjs-plugin-datalabels dependency for a single label - this
// is a tiny inline plugin object (zero new npm dependency) instead.
function buildPeakLabelPlugin(peakIndex) {
  return {
    id: 'peakLabel',
    afterDatasetsDraw(chart) {
      if (peakIndex < 0) return
      const meta = chart.getDatasetMeta(0)
      const bar = meta.data[peakIndex]
      const value = chart.data.datasets[0].data[peakIndex]
      if (!bar || !value) return
      const { ctx } = chart
      ctx.save()
      ctx.fillStyle = PEAK_COLOR
      ctx.font = '600 11px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(value.toLocaleString(), bar.x, bar.y - 6)
      ctx.restore()
    },
  }
}

const macroDonutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '68%',
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#17171b',
      borderColor: 'rgba(198, 255, 61, 0.35)',
      borderWidth: 1,
      titleColor: '#e2e8f0',
      bodyColor: '#e2e8f0',
      padding: 8,
      callbacks: { label: (ctx) => `${ctx.label}: ${Math.round(ctx.parsed)}g` },
    },
  },
}

// Small dashboard replacing the old plain-sentence "weekly analysis" card:
// a calories-per-day bar chart, a streak tile, a workouts-this-week goal
// tile, and a 3-tile insights row - all computed client-side from the
// logs/meals/check-ins this page already aggregates by day (no new API
// calls). The AI-generated digest/nutrition-audit text is still fetched via
// the existing api.getWeeklyDigest/getWeeklyNutritionReview calls, gated
// behind the same 7-distinct-day unlock as before - only now rendered as
// short fragment chips instead of full sentences (see the backend prompt
// tightening in orchestrator.py).
function WeeklyAnalysisSection({ distinctDaysLogged, logsByDate, mealsByDate, checkinsByDate, profile }) {
  const [digest, setDigest] = useState(null)
  const [nutrition, setNutrition] = useState(null)
  const [loading, setLoading] = useState(false)
  const [requested, setRequested] = useState(false)
  const { userId } = useSession()

  const today = useMemo(() => new Date(), [])
  const weekReady = distinctDaysLogged >= 7

  async function handleGenerate() {
    setRequested(true)
    setLoading(true)
    try {
      const [digestData, nutritionData] = await Promise.all([
        api.getWeeklyDigest(userId),
        api.getWeeklyNutritionReview(userId),
      ])
      setDigest(digestData)
      setNutrition(nutritionData)
    } finally {
      setLoading(false)
    }
  }

  const stats = useMemo(() => {
    const weekKeys = lastNDayKeys(7, today)
    const prevWeekEnd = new Date(today)
    prevWeekEnd.setDate(prevWeekEnd.getDate() - 7)
    const prevWeekKeys = lastNDayKeys(7, prevWeekEnd)

    const caloriesFor = (key) => (mealsByDate[key] || []).reduce((s, m) => s + (m.estimated_calories || 0), 0)
    const volumeFor = (key) => (logsByDate[key] || []).reduce((s, l) => s + logVolume(l), 0)

    const dailyCalories = weekKeys.map(caloriesFor)
    const daysWithMeals = weekKeys.filter((k) => (mealsByDate[k] || []).length > 0)
    const totalCalories = dailyCalories.reduce((a, b) => a + b, 0)
    const avgCalories = daysWithMeals.length > 0 ? Math.round(totalCalories / daysWithMeals.length) : null

    const prevDaysWithMeals = prevWeekKeys.filter((k) => (mealsByDate[k] || []).length > 0)
    const prevAvgCalories =
      prevDaysWithMeals.length > 0
        ? prevWeekKeys.reduce((s, k) => s + caloriesFor(k), 0) / prevDaysWithMeals.length
        : null

    // A trend needs two genuinely comparable weeks, not a percentage
    // computed off one stray logged day - require at least half of each
    // week to actually have data before showing a delta at all.
    let trendPct = null
    if (avgCalories != null && prevAvgCalories && daysWithMeals.length >= 3 && prevDaysWithMeals.length >= 3) {
      trendPct = Math.round(((avgCalories - prevAvgCalories) / prevAvgCalories) * 100)
    }

    let peakIndex = -1
    let peakValue = 0
    dailyCalories.forEach((v, i) => {
      if (v > peakValue) {
        peakValue = v
        peakIndex = i
      }
    })

    const macroTotals = weekKeys.reduce(
      (acc, k) => {
        for (const m of mealsByDate[k] || []) {
          acc.protein += m.protein_g || 0
          acc.carbs += m.carbs_g || 0
          acc.fat += m.fat_g || 0
        }
        return acc
      },
      { protein: 0, carbs: 0, fat: 0 },
    )
    const hasMacroData = macroTotals.protein + macroTotals.carbs + macroTotals.fat > 0

    // "Best day" prioritizes real training volume (a workout is a stronger
    // signal of a good day than calories alone); falls back to calories
    // logged on weeks with no workouts at all.
    let bestDay = null
    weekKeys.forEach((key, i) => {
      const vol = volumeFor(key)
      const cals = dailyCalories[i]
      if (vol <= 0 && cals <= 0) return
      const score = vol > 0 ? vol + 1e7 : cals
      if (!bestDay || score > bestDay.score) bestDay = { key, score, vol, cals }
    })

    // Same concept as Dashboard.jsx's workoutsThisWeek (distinct days with a
    // logged workout in the last 7 days), computed from this page's own
    // day-keyed logsByDate instead of re-deriving it from raw timestamps.
    const workoutsThisWeek = weekKeys.filter((k) => (logsByDate[k] || []).length > 0).length

    return {
      weekKeys,
      dailyCalories,
      avgCalories,
      trendPct,
      peakIndex,
      macroTotals,
      hasMacroData,
      bestDay,
      workoutsThisWeek,
    }
  }, [today, logsByDate, mealsByDate, checkinsByDate])

  const streak = useMemo(
    () => computeStreak(today, logsByDate, mealsByDate, checkinsByDate),
    [today, logsByDate, mealsByDate, checkinsByDate],
  )

  const hasAnyWeekData = stats.dailyCalories.some((v) => v > 0) || stats.workoutsThisWeek > 0

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading font-bold text-lg">This week's analysis</h2>
        <p className="text-sm text-slate-400 mt-0.5">Built from your own logged workouts, meals, and check-ins.</p>
      </div>

      {hasAnyWeekData ? (
        <>
          <div className="card p-4 md:p-6">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div>
                <h3 className="text-xs uppercase tracking-wide text-slate-500">Calories logged</h3>
                <p className="font-heading font-bold text-2xl leading-none mt-1">
                  {stats.avgCalories != null ? stats.avgCalories.toLocaleString() : '—'}
                  {stats.avgCalories != null && (
                    <span className="text-sm text-slate-400 font-normal ml-1">kcal avg</span>
                  )}
                </p>
              </div>
              <TrendBadge pct={stats.trendPct} />
            </div>
            <div className="h-40 mt-3">
              <Bar
                data={buildCaloriesBarData(stats.weekKeys, stats.dailyCalories, stats.peakIndex)}
                options={caloriesBarOptions}
                plugins={[buildPeakLabelPlugin(stats.peakIndex)]}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="card p-4 flex items-center gap-3">
              <ProgressRing value={streak} label="Day streak" color={LIME} />
            </div>
            <div className="card p-4 flex flex-col justify-center">
              <MacroBar
                label="Workouts this week"
                value={stats.workoutsThisWeek}
                target={profile?.target_frequency}
                unit=""
                color="bg-coral-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="Avg. calories"
              value={stats.avgCalories != null ? stats.avgCalories.toLocaleString() : '—'}
              unit={stats.avgCalories != null ? 'kcal/day' : ''}
              sub="Days with a logged meal, this week"
            />

            <div className="card p-4">
              <span className="text-xs text-slate-500">Macro balance</span>
              {stats.hasMacroData ? (
                <div className="flex items-center gap-3 mt-1">
                  <div className="w-16 h-16 shrink-0">
                    <Doughnut
                      data={{
                        labels: ['Protein', 'Carbs', 'Fat'],
                        datasets: [
                          {
                            data: [stats.macroTotals.protein, stats.macroTotals.carbs, stats.macroTotals.fat],
                            backgroundColor: [PROTEIN_COLOR, CARBS_COLOR, FAT_COLOR],
                            borderColor: '#0c0c0f',
                            borderWidth: 2,
                          },
                        ],
                      }}
                      options={macroDonutOptions}
                    />
                  </div>
                  <div className="space-y-1 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: PROTEIN_COLOR }} />
                      P {Math.round(stats.macroTotals.protein)}g
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: CARBS_COLOR }} />
                      C {Math.round(stats.macroTotals.carbs)}g
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: FAT_COLOR }} />
                      F {Math.round(stats.macroTotals.fat)}g
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 mt-1">No meals logged this week.</p>
              )}
            </div>

            <StatCard
              label="Best day"
              value={stats.bestDay ? WEEKDAY_LONG_FMT.format(new Date(`${stats.bestDay.key}T00:00:00`)) : '—'}
              sub={
                stats.bestDay
                  ? stats.bestDay.vol > 0
                    ? `${stats.bestDay.vol.toLocaleString()} lbs volume`
                    : `${stats.bestDay.cals.toLocaleString()} kcal logged`
                  : 'Nothing logged this week yet'
              }
            />
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500">No activity logged in the last 7 days yet.</p>
      )}

      <div className="card p-4 md:p-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-heading font-semibold text-sm">AI coach notes</h3>
          {!requested && (
            <button
              onClick={handleGenerate}
              disabled={!weekReady}
              className="px-3 py-1.5 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-heading font-semibold whitespace-nowrap"
            >
              Generate report
            </button>
          )}
        </div>

        {!weekReady && !requested && (
          <p className="text-sm text-slate-500">
            {distinctDaysLogged}/7 days logged so far - once a full week of activity is in, short AI notes
            unlock here.
          </p>
        )}

        {weekReady && !requested && (
          <p className="text-sm text-slate-400">A full week of activity is logged - generate notes whenever you're ready.</p>
        )}

        {loading && <p className="text-sm text-slate-400">Synthesizing this week's performance…</p>}

        {digest && nutrition && !loading && (
          <div className="space-y-3 mt-2">
            <div>
              <h4 className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">Training</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">🚀 Win</p>
                  <p className="text-sm font-semibold text-slate-100">{digest.biggest_win}</p>
                </div>
                <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">⚠️ Recovery</p>
                  <p className="text-sm font-semibold text-slate-100">{digest.recovery_note}</p>
                </div>
                <div className="rounded-lg border border-coral-500/40 bg-coral-500/10 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-coral-400 mb-1">🎯 Focus</p>
                  <p className="text-sm font-semibold text-slate-100">{digest.next_week_focus}</p>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">Nutrition</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">📊 Macros</p>
                  <p className="text-sm font-semibold text-slate-100">{nutrition.macro_status}</p>
                </div>
                <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">💡 Pattern</p>
                  <p className="text-sm font-semibold text-slate-100">{nutrition.key_pattern}</p>
                </div>
                <div className="rounded-lg border border-coral-500/40 bg-coral-500/10 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-coral-400 mb-1">🎯 Do next</p>
                  <p className="text-sm font-semibold text-slate-100">{nutrition.recommendation}</p>
                </div>
              </div>
            </div>
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
  // Only needed for the "workouts this week" goal tile - target_frequency,
  // same field/formula Dashboard.jsx already uses for the identical metric.
  const [profile, setProfile] = useState(null)

  const today = new Date()
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(null)

  useEffect(() => {
    api.getProfile(userId).then(setProfile).catch(() => setProfile(null))
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

  const distinctDaysLogged = useMemo(() => {
    const days = new Set([...Object.keys(logsByDate), ...Object.keys(mealsByDate), ...Object.keys(checkinsByDate)])
    return days.size
  }, [logsByDate, mealsByDate, checkinsByDate])

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
          Every logged workout, meal, and readiness check-in, aggregated by day - built entirely from your
          own activity in this app.
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

                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDate(d)}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-start pt-1.5 gap-1 text-xs transition-colors border ${
                      isToday
                        ? 'border-coral-500 bg-coral-500/10'
                        : 'border-transparent hover:bg-forest-800'
                    } ${inMonth ? 'text-slate-200' : 'text-slate-600'}`}
                  >
                    <span className={isToday ? 'font-bold text-coral-300' : ''}>{d.getDate()}</span>
                    <div className="flex items-center gap-1 h-2">
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

            <div className="flex items-center gap-4 mt-4 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-coral-400" /> Workout
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

      {!loading && (
        <WeeklyAnalysisSection
          distinctDaysLogged={distinctDaysLogged}
          logsByDate={logsByDate}
          mealsByDate={mealsByDate}
          checkinsByDate={checkinsByDate}
          profile={profile}
        />
      )}

      {selectedDate && (
        <DayDetailPanel
          date={selectedDate}
          dayData={dayDataFor(dateKeyFromLocalDate(selectedDate))}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  )
}
