import { useEffect, useMemo, useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Legend,
  Tooltip,
} from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'
import { jsPDF } from 'jspdf'
import { api } from '../api.js'
import CoachAIIndicator from '../components/CoachAIIndicator.jsx'
import { classifyMuscleGroup, MUSCLE_ZONE_LABELS } from '../utils/muscleZones.js'
import { useSession } from '../context/SessionContext.jsx'

// Plain inline SVG, matching this app's existing icon convention.
function TrophyIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5H5a3 3 0 0 0 3 4M16 5h3a3 3 0 0 1-3 4" />
      <path d="M12 12v3M9 19h6M10 15h4v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-2Z" />
    </svg>
  )
}

function DownloadIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  )
}

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Legend, Tooltip)

// Single-series charts - one hue throughout, no legend needed. CORAL (the
// brand accent) is reserved for whichever chart is the primary trend in its
// section; STEEL is the muted blue-gray used for supporting charts, so lime
// doesn't flood every chart on the page.
const CORAL = '#c7f000'
const STEEL = '#6b8cae'
const GRID_COLOR = 'rgba(148, 163, 184, 0.12)'
const TEXT_MUTED = '#94a3b8'
const STEEL_DIM = 'rgba(107, 140, 174, 0.45)'

// Fitness/Fatigue/Form is a 3-series categorical chart, so it needs its own
// fixed-order palette plus a legend - unlike the single-series charts above,
// color alone now carries series identity.
const FITNESS_COLOR = '#059669'
const FATIGUE_COLOR = '#e2542a'
const FORM_COLOR = '#0284c7'

const RISK_STYLES = {
  low: 'text-emerald-400',
  moderate: 'text-amber-400',
  high: 'text-red-400',
  unknown: 'text-slate-500',
}

const SPARKLINE_COLORS = {
  calories: { line: '#c7f000', fill: 'rgba(199, 240, 0, 0.15)' },
  protein: { line: '#10b981', fill: 'rgba(16, 185, 129, 0.15)' },
  carbs: { line: '#0ea5e9', fill: 'rgba(14, 165, 233, 0.15)' },
  fat: { line: '#f59e0b', fill: 'rgba(245, 158, 11, 0.15)' },
}

const sparklineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: { x: { display: false }, y: { display: false } },
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
  elements: { point: { radius: 0 } },
}

function buildSparklineData(dailyData, colors) {
  return {
    labels: dailyData.map((_, i) => i),
    datasets: [
      { data: dailyData, borderColor: colors.line, backgroundColor: colors.fill, borderWidth: 2, fill: true, tension: 0.35, pointRadius: 0 },
    ],
  }
}

// Calories reads as a deficit/surplus against target; the other three macros
// read as "how much of the target did I hit" - same underlying percentage,
// different framing.
function calorieBadge(value, target) {
  if (value == null || !target) return null
  const pct = Math.round((value / target) * 100)
  if (pct === 100) {
    return <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">On target</span>
  }
  const label = pct < 100 ? `${100 - pct}% Deficit` : `${pct - 100}% Surplus`
  const color = pct < 100 ? 'text-sky-400' : 'text-amber-400'
  return <span className={`text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${color}`}>{label}</span>
}

function macroTargetBadge(value, target) {
  if (value == null || !target) return null
  const pct = Math.round((value / target) * 100)
  return <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400 whitespace-nowrap">{pct}% Target achieved</span>
}

function MacroTile({ label, value, unit, badge, dailyData, colors }) {
  return (
    <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-2.5">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: colors.line }} />
        <span>{label}</span>
      </div>
      <p className="text-lg font-bold tabular-nums">
        {Math.round(value).toLocaleString()}
        {unit}
      </p>
      {badge && <div className="mt-0.5">{badge}</div>}
      {Array.isArray(dailyData) && dailyData.length > 0 && (
        <div className="h-9 mt-1">
          <Line data={buildSparklineData(dailyData, colors)} options={sparklineOptions} />
        </div>
      )}
    </div>
  )
}

// ---------- Date/period helpers (shared by Overview, Trends, Comparison, PRs) ----------

function dateKeyFromLocalDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Same formula as GET /logs/user/{id}/progress's volume_by_date (sets *
// reps * weight, summed) - deliberately not fatigue.py's session_load.
function logVolume(log) {
  return (log.sets || 0) * (log.reps || 0) * (log.weight || 0)
}

// Returns `n` consecutive date keys ending at (and including) `endDate`, oldest first.
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

// Longest historical run of consecutive active days, scanning every date
// that has ever had a log/meal/check-in - not just the streak ending today.
function computeLongestStreak(logsByDate, mealsByDate, checkinsByDate) {
  const allKeys = new Set([...Object.keys(logsByDate), ...Object.keys(mealsByDate), ...Object.keys(checkinsByDate)])
  if (allKeys.size === 0) return 0
  const sorted = [...allKeys].sort()
  let longest = 1
  let current = 1
  for (let i = 1; i < sorted.length; i++) {
    const diffDays = Math.round((new Date(`${sorted[i]}T00:00:00`) - new Date(`${sorted[i - 1]}T00:00:00`)) / 86400000)
    current = diffDays === 1 ? current + 1 : 1
    longest = Math.max(longest, current)
  }
  return longest
}

function pctChange(current, previous) {
  if (previous == null || previous === 0 || current == null) return null
  return Math.round(((current - previous) / previous) * 100)
}

// Real metrics for one arbitrary date-key window, all sourced from data this
// page already fetches (logs, meals, check-ins, the progress endpoint's
// calories_by_date) - no new endpoint, no invented numbers.
function computePeriodMetrics(keys, { logsByDate, mealsByDate, checkinsByDate, caloriesByDateMap }) {
  let volume = 0
  let sets = 0
  let caloriesBurned = 0
  let workoutDays = 0
  let activeDays = 0
  let mealCalorieTotal = 0
  let daysWithMeals = 0
  const readinessScores = []
  for (const key of keys) {
    const logs = logsByDate[key] || []
    if (logs.length > 0) workoutDays += 1
    if (hasActivityOnDay(key, logsByDate, mealsByDate, checkinsByDate)) activeDays += 1
    for (const log of logs) {
      volume += logVolume(log)
      sets += log.sets || 0
    }
    caloriesBurned += caloriesByDateMap[key] || 0
    const meals = mealsByDate[key] || []
    if (meals.length > 0) {
      daysWithMeals += 1
      mealCalorieTotal += meals.reduce((s, m) => s + (m.estimated_calories || 0), 0)
    }
    if (checkinsByDate[key]) readinessScores.push(checkinsByDate[key].score)
  }
  return {
    keys,
    volume,
    sets,
    caloriesBurned,
    workoutDays,
    activeDays,
    avgCaloriesLogged: daysWithMeals > 0 ? mealCalorieTotal / daysWithMeals : null,
    avgReadiness: readinessScores.length > 0 ? readinessScores.reduce((a, b) => a + b, 0) / readinessScores.length : null,
  }
}

// Reuses this app's one existing muscle-zone taxonomy (utils/muscleZones.js,
// built for the exercise-muscle body diagram) rather than inventing a new
// Push/Pull/Legs scheme this app's data model has no other use for. Weighted
// by logged sets, not just entry count, so a 5x5 heavy day counts more than
// a single warm-up set of the same lift.
function muscleGroupBreakdown(logs) {
  const counts = {}
  for (const log of logs) {
    const zone = classifyMuscleGroup(log.exercise?.muscle_group)
    if (!zone) continue
    counts[zone] = (counts[zone] || 0) + (log.sets || 1)
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  return Object.entries(counts)
    .map(([zone, count]) => ({ zone, label: MUSCLE_ZONE_LABELS[zone] || zone, count, pct: total ? Math.round((count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count)
}

// Deterministic, transparent grading - not an AI opinion. Blends "how many
// of the last N days had any real activity" with "how many of the days you
// logged a meal landed within 15% of your calorie target" (only when a
// target and real meal data both exist).
function gradeForPct(pct) {
  if (pct >= 90) return 'A'
  if (pct >= 75) return 'B'
  if (pct >= 60) return 'C'
  if (pct >= 40) return 'D'
  return 'F'
}

// ---------- Chart builders (Performance Trends - shared visual language) ----------

function buildVolumeChartData(volumeByDate) {
  return {
    labels: volumeByDate.map((p) => p.date),
    datasets: [
      {
        label: 'Total Volume',
        data: volumeByDate.map((p) => p.total_volume),
        borderColor: CORAL,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: CORAL,
        pointHoverBorderColor: '#0b1220',
        pointHoverBorderWidth: 2,
        tension: 0.25,
        fill: true,
        backgroundColor: (ctx) => {
          const { chart } = ctx
          const { ctx: canvasCtx, chartArea } = chart
          if (!chartArea) return 'rgba(199, 240, 0, 0.1)'
          const gradient = canvasCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
          gradient.addColorStop(0, 'rgba(199, 240, 0, 0.22)')
          gradient.addColorStop(1, 'rgba(199, 240, 0, 0.02)')
          return gradient
        },
      },
    ],
  }
}

function buildCaloriesChartData(caloriesByDate) {
  return {
    labels: caloriesByDate.map((p) => p.date),
    datasets: [
      {
        label: 'Calories Burned (est.)',
        data: caloriesByDate.map((p) => p.total_calories),
        borderColor: STEEL,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: STEEL,
        pointHoverBorderColor: '#0b1220',
        pointHoverBorderWidth: 2,
        tension: 0.25,
        fill: true,
        backgroundColor: (ctx) => {
          const { chart } = ctx
          const { ctx: canvasCtx, chartArea } = chart
          if (!chartArea) return 'rgba(107, 140, 174, 0.12)'
          const gradient = canvasCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
          gradient.addColorStop(0, 'rgba(107, 140, 174, 0.28)')
          gradient.addColorStop(1, 'rgba(107, 140, 174, 0.02)')
          return gradient
        },
      },
    ],
  }
}

function buildExerciseChartData(history) {
  return {
    labels: history.map((p) => new Date(p.performed_at).toLocaleDateString()),
    datasets: [
      {
        label: 'Weight',
        data: history.map((p) => p.weight),
        borderColor: STEEL,
        borderWidth: 2,
        tension: 0.15,
        fill: false,
        pointRadius: history.map((p) => (p.is_pr ? 6 : 2)),
        pointHoverRadius: history.map((p) => (p.is_pr ? 8 : 5)),
        pointBackgroundColor: STEEL,
        pointBorderColor: '#0b1220',
        pointBorderWidth: history.map((p) => (p.is_pr ? 2 : 1)),
      },
    ],
  }
}

function buildFatigueChartData(series) {
  return {
    labels: series.map((p) => p.date),
    datasets: [
      { label: 'Fitness', data: series.map((p) => p.fitness), borderColor: FITNESS_COLOR, backgroundColor: FITNESS_COLOR, borderWidth: 2, pointRadius: 0, tension: 0.2 },
      { label: 'Fatigue', data: series.map((p) => p.fatigue), borderColor: FATIGUE_COLOR, backgroundColor: FATIGUE_COLOR, borderWidth: 2, pointRadius: 0, tension: 0.2 },
      { label: 'Form', data: series.map((p) => p.form), borderColor: FORM_COLOR, backgroundColor: FORM_COLOR, borderWidth: 2, borderDash: [4, 3], pointRadius: 0, tension: 0.2 },
    ],
  }
}

// Workouts completed per calendar week - counts distinct active days per
// week (not raw log rows, so a 5-exercise session still counts as one
// workout), matching "Workout Frequency" in the spec.
function buildWorkoutFrequencyData(logsByDate) {
  const weekCounts = {}
  for (const [key, logs] of Object.entries(logsByDate)) {
    if (!logs.length) continue
    const d = new Date(`${key}T00:00:00`)
    const weekStart = new Date(d)
    weekStart.setDate(d.getDate() - d.getDay())
    const wk = dateKeyFromLocalDate(weekStart)
    weekCounts[wk] = (weekCounts[wk] || 0) + 1
  }
  const weeks = Object.keys(weekCounts).sort()
  return {
    labels: weeks,
    datasets: [{ data: weeks.map((w) => weekCounts[w]), backgroundColor: CORAL, borderRadius: 4, maxBarThickness: 28 }],
  }
}

const baseChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: { backgroundColor: '#111a2b', borderColor: 'rgba(107, 140, 174, 0.35)', borderWidth: 1, titleColor: '#e2e8f0', bodyColor: '#e2e8f0', padding: 10, displayColors: false },
  },
  scales: {
    x: { grid: { display: false }, ticks: { color: TEXT_MUTED, maxRotation: 0, autoSkip: true } },
    y: { grid: { color: GRID_COLOR }, ticks: { color: TEXT_MUTED, callback: (v) => v.toLocaleString() }, beginAtZero: true },
  },
}

const barChartOptions = {
  ...baseChartOptions,
  scales: { ...baseChartOptions.scales, y: { ...baseChartOptions.scales.y, ticks: { ...baseChartOptions.scales.y.ticks, precision: 0 } } },
}

// 3-series chart: legend on, tooltip markers on - color is now the only way
// to tell Fitness/Fatigue/Form apart.
const fatigueChartOptions = {
  ...baseChartOptions,
  plugins: {
    ...baseChartOptions.plugins,
    legend: { display: true, position: 'top', align: 'end', labels: { color: TEXT_MUTED, boxWidth: 12, boxHeight: 2, usePointStyle: false, padding: 16 } },
    tooltip: { ...baseChartOptions.plugins.tooltip, displayColors: true },
  },
}

// ---------- Small shared UI pieces ----------

function ChangeLine({ pct, comparisonLabel }) {
  if (pct == null) {
    return <p className="text-xs text-slate-500 mt-1.5">No {comparisonLabel} to compare yet</p>
  }
  const isFlat = pct === 0
  const tone = isFlat ? 'text-slate-500' : pct > 0 ? 'text-coral-400' : 'text-sky-400'
  const arrow = isFlat ? '→' : pct > 0 ? '↑' : '↓'
  return (
    <p className={`text-xs font-semibold mt-1.5 ${tone}`}>
      {arrow} {Math.abs(pct)}% vs {comparisonLabel}
    </p>
  )
}

function OverviewCard({ label, value, unit, pct, comparisonLabel, empty, emptyText }) {
  return (
    <div className="card py-4 px-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      {empty ? (
        <p className="text-sm text-slate-500 mt-2.5">{emptyText || 'Not enough data yet'}</p>
      ) : (
        <>
          <p className="font-heading font-bold text-2xl tabular-nums mt-1.5 leading-none">
            {value}
            {unit && <span className="text-sm text-slate-400 font-normal ml-1">{unit}</span>}
          </p>
          <ChangeLine pct={pct} comparisonLabel={comparisonLabel} />
        </>
      )}
    </div>
  )
}

const PERIODS = [
  { id: '7d', label: '7 Days', days: 7 },
  { id: '4w', label: '4 Weeks', days: 28 },
  { id: '12w', label: '12 Weeks', days: 84 },
]

// Same tab-pill pattern used elsewhere in the app (MealPhoto.jsx, LiveSession.jsx).
const TABS = [
  { id: 'progress', label: 'Progress' },
  { id: 'insights', label: 'AI Insights' },
  { id: 'biometrics', label: 'Advanced Biometrics & Recovery' },
]

function tabClass(active) {
  return `px-4 py-2 rounded-lg text-sm font-heading font-semibold transition-colors whitespace-nowrap ${
    active ? 'bg-coral-500' : 'bg-forest-900 text-slate-400 hover:text-slate-200'
  }`
}

function pillClass(active) {
  return `px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
    active ? 'bg-coral-500' : 'border border-forest-700 text-slate-400 hover:text-slate-200'
  }`
}

// ---------- PDF export (Progress + Nutrition Audit only - the other two AI
// cards are deterministic now and are already fully visible on-page) ----------

const PDF_MARGIN_X = 20
const PDF_PAGE_BOTTOM = 275
const PDF_CORAL = [122, 176, 24]
const PDF_SLATE = [100, 116, 139]
const PDF_INK = [15, 23, 42]

function buildFullProgressReport({ progress, fatigue, overview, records, nutritionReview }) {
  const doc = new jsPDF()
  let y = 22

  function ensureRoom(neededHeight) {
    if (y + neededHeight > PDF_PAGE_BOTTOM) {
      doc.addPage()
      y = 22
    }
  }
  function sectionRule() {
    ensureRoom(12)
    doc.setDrawColor(...PDF_SLATE)
    doc.line(PDF_MARGIN_X, y, 190, y)
    y += 10
  }
  function sectionTitle(title, color = PDF_INK) {
    ensureRoom(14)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(...color)
    doc.text(title, PDF_MARGIN_X, y)
    y += 8
  }
  function paragraph(text) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(...PDF_INK)
    const lines = doc.splitTextToSize(text || 'n/a', 170)
    ensureRoom(lines.length * 6)
    doc.text(lines, PDF_MARGIN_X, y)
    y += lines.length * 6 + 4
  }
  function statLine(label, value) {
    ensureRoom(7)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(...PDF_SLATE)
    doc.text(label, PDF_MARGIN_X, y)
    doc.setTextColor(...PDF_INK)
    doc.text(String(value), PDF_MARGIN_X + 65, y)
    y += 7
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...PDF_CORAL)
  doc.text('ALIGN', PDF_MARGIN_X, y)
  y += 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(...PDF_INK)
  doc.text('Full Progress Report', PDF_MARGIN_X, y)
  y += 6
  doc.setFontSize(10)
  doc.setTextColor(...PDF_SLATE)
  doc.text(new Date().toLocaleDateString(undefined, { dateStyle: 'long' }), PDF_MARGIN_X, y)
  y += 4
  sectionRule()

  sectionTitle('Performance Overview (last 4 weeks)')
  statLine('Training volume', `${Math.round(overview.current.volume).toLocaleString()} lbs`)
  statLine('Calories burned (est.)', `${Math.round(overview.current.caloriesBurned).toLocaleString()} kcal`)
  statLine('Workouts completed', overview.current.workoutDays)
  sectionRule()

  sectionTitle('Personal Records')
  if (records.length > 0) {
    for (const r of records) statLine(r.title, r.detail)
  } else {
    paragraph('Your first milestones will appear as you build your training history.')
  }
  sectionRule()

  sectionTitle('Training Volume')
  const volumeByDate = progress?.volume_by_date || []
  if (volumeByDate.length > 0) {
    const total = volumeByDate.reduce((sum, p) => sum + p.total_volume, 0)
    statLine('Days trained', volumeByDate.length)
    statLine('Total volume', `${Math.round(total).toLocaleString()} lbs`)
    statLine('Most recent', `${volumeByDate[volumeByDate.length - 1].date} - ${Math.round(volumeByDate[volumeByDate.length - 1].total_volume).toLocaleString()} lbs`)
  } else {
    paragraph('No workouts logged yet.')
  }
  sectionRule()

  sectionTitle('Fitness, Fatigue & Form')
  const fatigueSeries = fatigue?.series || []
  if (fatigueSeries.length > 0) {
    const latest = fatigueSeries[fatigueSeries.length - 1]
    statLine('Fitness', latest.fitness.toFixed(1))
    statLine('Fatigue', latest.fatigue.toFixed(1))
    statLine('Form', latest.form.toFixed(1))
    if (fatigue.risk) {
      statLine('Injury risk', fatigue.risk.risk_level)
      paragraph(fatigue.risk.message)
    }
  } else {
    paragraph('No workouts logged yet.')
  }
  sectionRule()

  sectionTitle('Weekly Nutrition Audit')
  if (nutritionReview) {
    const macroRows = [
      ['Calories', nutritionReview.avg_calories, nutritionReview.calorie_target, ' kcal'],
      ['Protein', nutritionReview.avg_protein, nutritionReview.protein_target, 'g'],
      ['Carbs', nutritionReview.avg_carbs, nutritionReview.carbs_target, 'g'],
      ['Fat', nutritionReview.avg_fat, nutritionReview.fat_target, 'g'],
    ].filter(([, value]) => value != null)
    for (const [label, value, target, unit] of macroRows) {
      const pct = target ? Math.round((value / target) * 100) : null
      const valueLabel = target ? `${Math.round(value)}${unit} / ${Math.round(target)}${unit}${pct != null ? ` (${pct}%)` : ''}` : `${Math.round(value)}${unit}`
      statLine(label, valueLabel)
    }
    y += 2
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    ensureRoom(7)
    doc.setTextColor(...PDF_SLATE)
    doc.text('Pattern', PDF_MARGIN_X, y)
    y += 6
    paragraph(nutritionReview.key_pattern)
    doc.setFont('helvetica', 'bold')
    ensureRoom(7)
    doc.setTextColor(...PDF_CORAL)
    doc.text('Recommendation', PDF_MARGIN_X, y)
    y += 6
    paragraph(nutritionReview.recommendation)
  } else {
    paragraph('Not generated yet - visit AI Insights and click Generate.')
  }

  doc.save(`align-progress-report-${new Date().toISOString().slice(0, 10)}.pdf`)
}

export default function Progress() {
  const { userId } = useSession()
  const [activeTab, setActiveTab] = useState('progress')
  const [progress, setProgress] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedExerciseId, setSelectedExerciseId] = useState(null)
  const [comparisonPeriod, setComparisonPeriod] = useState('4w')
  const [nutritionReview, setNutritionReview] = useState(null)
  const [nutritionReviewLoading, setNutritionReviewLoading] = useState(false)
  const [nutritionReviewError, setNutritionReviewError] = useState('')
  const [showVolumeTable, setShowVolumeTable] = useState(false)
  const [showCaloriesTable, setShowCaloriesTable] = useState(false)
  const [showExerciseTable, setShowExerciseTable] = useState(false)
  const [fatigue, setFatigue] = useState(null)
  const [asymmetryForm, setAsymmetryForm] = useState({ metricName: '', left: '', right: '' })
  const [asymmetryResult, setAsymmetryResult] = useState(null)
  const [asymmetryError, setAsymmetryError] = useState('')
  const [asymmetryLoading, setAsymmetryLoading] = useState(false)
  // Same three per-day lookups the old Weekly AI Recap dashboard used - now
  // also the backbone of the new Overview/Trends/Records/Comparison
  // sections, all computed client-side from real logged rows.
  const [logsByDate, setLogsByDate] = useState({})
  const [mealsByDate, setMealsByDate] = useState({})
  const [checkinsByDate, setCheckinsByDate] = useState({})
  const [weekProfile, setWeekProfile] = useState(null)
  const [exportingReport, setExportingReport] = useState(false)

  useEffect(() => {
    api
      .getProgress(userId)
      .then((data) => {
        setProgress(data)
        if (data.exercises.length > 0) setSelectedExerciseId(data.exercises[0].exercise_id)
      })
      .catch(() => setProgress({ volume_by_date: [], calories_by_date: [], exercises: [] }))
      .finally(() => setLoading(false))

    api.getFatigue(userId).then(setFatigue).catch(() => setFatigue({ series: [], risk: null }))
    api.getProfile(userId).then(setWeekProfile).catch(() => setWeekProfile(null))

    Promise.all([api.listLogs(userId), api.listMealAnalyses(userId), api.getCheckinHistory(userId)])
      .then(([logs, meals, checkins]) => {
        const byLogDate = {}
        for (const log of logs) {
          const key = log.performed_at.slice(0, 10)
          ;(byLogDate[key] ||= []).push(log)
        }
        const byMealDate = {}
        for (const meal of meals) {
          const key = meal.analyzed_at.slice(0, 10)
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
        // No history yet (or a fetch failure) - every section below has its
        // own honest empty state, same as everywhere else in this app.
      })
  }, [userId])

  const caloriesByDateMap = useMemo(() => {
    const map = {}
    for (const p of progress?.calories_by_date || []) map[p.date] = p.total_calories
    return map
  }, [progress])

  const dataCtx = useMemo(
    () => ({ logsByDate, mealsByDate, checkinsByDate, caloriesByDateMap }),
    [logsByDate, mealsByDate, checkinsByDate, caloriesByDateMap],
  )

  const distinctDaysLogged = useMemo(() => {
    const days = new Set([...Object.keys(logsByDate), ...Object.keys(mealsByDate), ...Object.keys(checkinsByDate)])
    return days.size
  }, [logsByDate, mealsByDate, checkinsByDate])
  const hasAnyHistory = distinctDaysLogged > 0

  const selectedExercise = useMemo(
    () => progress?.exercises.find((e) => e.exercise_id === selectedExerciseId),
    [progress, selectedExerciseId],
  )

  // ---- Performance Overview (fixed 4-week window vs the 4 weeks before it) ----
  const overview = useMemo(() => {
    const today = new Date()
    const currentKeys = lastNDayKeys(28, today)
    const prevEnd = new Date(today)
    prevEnd.setDate(prevEnd.getDate() - 28)
    const previousKeys = lastNDayKeys(28, prevEnd)
    const current = computePeriodMetrics(currentKeys, dataCtx)
    const previous = computePeriodMetrics(previousKeys, dataCtx)

    function inWindow(history, keys) {
      const set = new Set(keys)
      const rows = history.filter((h) => set.has(h.performed_at.slice(0, 10)) && h.weight != null)
      return rows.length ? rows[rows.length - 1].weight : null
    }
    const strengthNow = selectedExercise ? inWindow(selectedExercise.history, currentKeys) : null
    const strengthPrev = selectedExercise ? inWindow(selectedExercise.history, previousKeys) : null

    return { current, previous, strengthNow, strengthPrev }
  }, [dataCtx, selectedExercise])

  // ---- Weekly Recap (deterministic - consistency/adherence only) ----
  const recapStats = useMemo(() => {
    const days = 7
    const keys = lastNDayKeys(days, new Date())
    const activeDays = keys.filter((k) => hasActivityOnDay(k, logsByDate, mealsByDate, checkinsByDate)).length
    const target = weekProfile?.daily_calorie_target
    let adherenceDays = 0
    let daysWithMealsAndTarget = 0
    if (target) {
      for (const k of keys) {
        const meals = mealsByDate[k] || []
        if (!meals.length) continue
        daysWithMealsAndTarget += 1
        const total = meals.reduce((s, m) => s + (m.estimated_calories || 0), 0)
        if (Math.abs(total - target) / target <= 0.15) adherenceDays += 1
      }
    }
    const adherencePct = daysWithMealsAndTarget > 0 ? Math.round((adherenceDays / daysWithMealsAndTarget) * 100) : null
    const consistencyPct = Math.round((activeDays / days) * 100)
    const overallPct = adherencePct != null ? Math.round((consistencyPct + adherencePct) / 2) : consistencyPct
    return { days, activeDays, adherencePct, adherenceDays, daysWithMealsAndTarget, consistencyPct, overallPct, grade: gradeForPct(overallPct) }
  }, [logsByDate, mealsByDate, checkinsByDate, weekProfile])

  // ---- Weekly Insights (deterministic - training/strength/fatigue only) ----
  const insightsStats = useMemo(() => {
    const days = 7
    const thisKeys = lastNDayKeys(days, new Date())
    const prevEnd = new Date()
    prevEnd.setDate(prevEnd.getDate() - days)
    const prevKeys = lastNDayKeys(days, prevEnd)
    const thisMetrics = computePeriodMetrics(thisKeys, dataCtx)
    const prevMetrics = computePeriodMetrics(prevKeys, dataCtx)
    const allLogsThisWeek = thisKeys.flatMap((k) => logsByDate[k] || [])
    return {
      volume: thisMetrics.volume,
      volumeChangePct: pctChange(thisMetrics.volume, prevMetrics.volume),
      sets: thisMetrics.sets,
      workoutDays: thisMetrics.workoutDays,
      muscleSplit: muscleGroupBreakdown(allLogsThisWeek).slice(0, 4),
      hasActivity: thisMetrics.workoutDays > 0,
    }
  }, [dataCtx, logsByDate])

  // ---- Personal Records / Milestones ----
  const personalRecords = useMemo(() => {
    if (!progress) return []
    const records = []

    let mostRecentPR = null
    for (const ex of progress.exercises) {
      for (const h of ex.history) {
        if (h.is_pr && (!mostRecentPR || new Date(h.performed_at) > new Date(mostRecentPR.date))) {
          mostRecentPR = { date: h.performed_at, exercise: ex.exercise_name, weight: h.weight }
        }
      }
    }
    if (mostRecentPR) {
      records.push({
        title: 'New PR',
        detail: `${mostRecentPR.exercise} — ${mostRecentPR.weight != null ? `${mostRecentPR.weight}` : 'bodyweight'} on ${new Date(mostRecentPR.date).toLocaleDateString()}`,
      })
    }

    if (progress.volume_by_date.length > 0) {
      const top = progress.volume_by_date.reduce((a, b) => (b.total_volume > a.total_volume ? b : a))
      records.push({ title: 'Highest Training Volume', detail: `${Math.round(top.total_volume).toLocaleString()} on ${top.date}` })
    }

    let biggestGain = null
    for (const ex of progress.exercises) {
      const withWeight = ex.history.filter((h) => h.weight != null)
      if (withWeight.length < 2) continue
      const gain = withWeight[withWeight.length - 1].weight - withWeight[0].weight
      if (gain > 0 && (!biggestGain || gain > biggestGain.gain)) {
        biggestGain = { exercise: ex.exercise_name, gain, first: withWeight[0].weight, last: withWeight[withWeight.length - 1].weight }
      }
    }
    if (biggestGain) {
      records.push({ title: 'Biggest Strength Improvement', detail: `${biggestGain.exercise}: ${biggestGain.first} → ${biggestGain.last} (+${biggestGain.gain})` })
    }

    const weekCounts = {}
    for (const [key, logs] of Object.entries(logsByDate)) {
      if (!logs.length) continue
      const d = new Date(`${key}T00:00:00`)
      const weekStart = new Date(d)
      weekStart.setDate(d.getDate() - d.getDay())
      const wk = dateKeyFromLocalDate(weekStart)
      weekCounts[wk] = (weekCounts[wk] || 0) + 1
    }
    const bestWeek = Object.entries(weekCounts).sort((a, b) => b[1] - a[1])[0]
    if (bestWeek && bestWeek[1] >= 2) {
      records.push({ title: 'Most Workouts in a Week', detail: `${bestWeek[1]} sessions - week of ${bestWeek[0]}` })
    }

    const longestStreak = computeLongestStreak(logsByDate, mealsByDate, checkinsByDate)
    if (longestStreak >= 2) {
      records.push({ title: 'Longest Consistency Streak', detail: `${longestStreak} days` })
    }

    return records
  }, [progress, logsByDate, mealsByDate, checkinsByDate])

  // ---- Period Comparison (user-selectable window) ----
  const comparison = useMemo(() => {
    const period = PERIODS.find((p) => p.id === comparisonPeriod) || PERIODS[1]
    const today = new Date()
    const currentKeys = lastNDayKeys(period.days, today)
    const prevEnd = new Date(today)
    prevEnd.setDate(prevEnd.getDate() - period.days)
    const previousKeys = lastNDayKeys(period.days, prevEnd)
    const current = computePeriodMetrics(currentKeys, dataCtx)
    const previous = computePeriodMetrics(previousKeys, dataCtx)
    const avgWorkoutVolume = current.workoutDays > 0 ? current.volume / current.workoutDays : null
    const prevAvgWorkoutVolume = previous.workoutDays > 0 ? previous.volume / previous.workoutDays : null
    return { period, current, previous, avgWorkoutVolume, prevAvgWorkoutVolume }
  }, [dataCtx, comparisonPeriod])

  async function loadNutritionReview() {
    setNutritionReviewLoading(true)
    setNutritionReviewError('')
    try {
      setNutritionReview(await api.getWeeklyNutritionReview(userId))
    } catch (err) {
      setNutritionReviewError(err.message)
    } finally {
      setNutritionReviewLoading(false)
    }
  }

  async function handleExportFullReport() {
    setExportingReport(true)
    try {
      const nutritionData = nutritionReview || (await api.getWeeklyNutritionReview(userId).catch(() => null))
      if (nutritionData && nutritionData !== nutritionReview) setNutritionReview(nutritionData)
      buildFullProgressReport({ progress, fatigue, overview, records: personalRecords, nutritionReview: nutritionData })
    } finally {
      setExportingReport(false)
    }
  }

  async function handleAsymmetrySubmit(event) {
    event.preventDefault()
    setAsymmetryLoading(true)
    setAsymmetryError('')
    setAsymmetryResult(null)
    try {
      const parseValues = (raw) =>
        raw.split(',').map((v) => v.trim()).filter(Boolean).map(Number)
      const left_values = parseValues(asymmetryForm.left)
      const right_values = parseValues(asymmetryForm.right)
      if (left_values.some(Number.isNaN) || right_values.some(Number.isNaN)) {
        throw new Error('Enter comma-separated numbers only, e.g. 92, 94, 91')
      }
      const data = await api.checkAsymmetry({ left_values, right_values, metric_name: asymmetryForm.metricName.trim() || 'measurement' })
      setAsymmetryResult(data)
    } catch (err) {
      setAsymmetryError(err.message)
    } finally {
      setAsymmetryLoading(false)
    }
  }

  if (loading) {
    return <p className="text-slate-400 text-sm px-6 py-12">Loading your progress…</p>
  }

  const hasVolume = progress.volume_by_date.length > 0
  const hasCalories = (progress.calories_by_date || []).length > 0
  const hasExercises = progress.exercises.length > 0
  const hasWorkoutFrequency = Object.values(logsByDate).some((l) => l.length > 0)

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 font-body space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Performance intelligence</p>
          <h1 className="font-heading font-bold text-3xl mt-0.5">Progress</h1>
          <p className="text-sm text-slate-400 mt-1">Track how your training performance is changing over time.</p>
        </div>
        <button
          onClick={handleExportFullReport}
          disabled={exportingReport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-forest-700 hover:border-coral-400 transition-colors text-xs font-semibold disabled:opacity-50"
        >
          <DownloadIcon className="w-3.5 h-3.5" />
          {exportingReport ? 'Building report…' : 'Export Full PDF Report'}
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={tabClass(activeTab === tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'progress' && (
        <div className="space-y-6">
          {/* 2. Performance Overview */}
          <div>
            <h2 className="font-heading font-semibold text-sm text-slate-400 mb-3">Performance Overview</h2>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <OverviewCard
                label="Training Volume"
                value={hasVolume ? `${Math.round(overview.current.volume).toLocaleString()} lbs` : null}
                pct={pctChange(overview.current.volume, overview.previous.volume)}
                comparisonLabel="previous 4 weeks"
                empty={overview.current.volume === 0}
                emptyText="No workouts logged yet"
              />
              <OverviewCard
                label="Strength Progress"
                value={overview.strengthNow != null ? `${overview.strengthNow} ${selectedExercise?.exercise_name || ''}` : null}
                pct={pctChange(overview.strengthNow, overview.strengthPrev)}
                comparisonLabel="previous 4 weeks"
                empty={overview.strengthNow == null}
                emptyText={hasExercises ? 'No recent sessions for this exercise' : 'Log an exercise to track strength'}
              />
              <OverviewCard
                label="Calories Burned"
                value={overview.current.caloriesBurned > 0 ? `${Math.round(overview.current.caloriesBurned).toLocaleString()} kcal` : null}
                pct={pctChange(overview.current.caloriesBurned, overview.previous.caloriesBurned)}
                comparisonLabel="previous 4 weeks"
                empty={overview.current.caloriesBurned === 0}
                emptyText="Set your weight in Profile to see estimates"
              />
              <OverviewCard
                label="Workouts Completed"
                value={overview.current.workoutDays > 0 ? overview.current.workoutDays : null}
                pct={pctChange(overview.current.workoutDays, overview.previous.workoutDays)}
                comparisonLabel="previous 4 weeks"
                empty={overview.current.workoutDays === 0}
                emptyText="No workouts logged yet"
              />
              <OverviewCard
                label="Consistency"
                value={overview.current.activeDays > 0 ? `${Math.round((overview.current.activeDays / 28) * 100)}%` : null}
                pct={pctChange(overview.current.activeDays, overview.previous.activeDays)}
                comparisonLabel="previous 4 weeks"
                empty={overview.current.activeDays === 0}
                emptyText="Nothing logged yet"
              />
              <OverviewCard
                label="Recovery / Readiness"
                value={overview.current.avgReadiness != null ? `${overview.current.avgReadiness.toFixed(1)}/5` : null}
                pct={pctChange(overview.current.avgReadiness, overview.previous.avgReadiness)}
                comparisonLabel="previous 4 weeks"
                empty={overview.current.avgReadiness == null}
                emptyText="Check in daily to track readiness"
              />
            </div>
          </div>

          {/* 3. Performance Trends - reuses the exact chart/card language
              from the original Performance & Metrics tab. */}
          <div>
            <h2 className="font-heading font-semibold text-sm text-slate-400 mb-3">Performance Trends</h2>
            <div className="space-y-4">
              <div className="card py-4 px-5">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
                  <div>
                    <h3 className="font-heading font-semibold">Training Volume</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Total sets × reps × weight over time</p>
                  </div>
                  {hasVolume && (
                    <div className="text-right shrink-0">
                      <p className="text-3xl font-heading font-bold tabular-nums leading-none">
                        {progress.volume_by_date[progress.volume_by_date.length - 1].total_volume.toLocaleString()}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">Most recent session</p>
                    </div>
                  )}
                </div>
                {hasVolume ? (
                  <>
                    <div className="h-64 mt-2">
                      <Line data={buildVolumeChartData(progress.volume_by_date)} options={baseChartOptions} />
                    </div>
                    <button onClick={() => setShowVolumeTable((v) => !v)} className="text-xs text-slate-500 hover:text-slate-300 mt-3">
                      {showVolumeTable ? 'Hide' : 'View'} as table
                    </button>
                    {showVolumeTable && (
                      <table className="w-full text-xs mt-2 text-slate-400">
                        <thead>
                          <tr className="text-left border-b border-forest-700">
                            <th className="py-1">Date</th>
                            <th className="py-1">Total volume</th>
                          </tr>
                        </thead>
                        <tbody>
                          {progress.volume_by_date.map((p) => (
                            <tr key={p.date} className="border-b border-forest-800">
                              <td className="py-1">{p.date}</td>
                              <td className="py-1 tabular-nums">{p.total_volume.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-500 mt-3">No workouts logged yet - once you log a few sessions, your volume trend shows up here.</p>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="card py-3 px-4">
                  <h3 className="font-heading font-semibold text-sm mb-1">Calories Burned</h3>
                  <p className="text-xs text-slate-500 mb-3">Estimated calories burned from logged workouts</p>
                  {hasCalories ? (
                    <>
                      <div className="h-56">
                        <Line data={buildCaloriesChartData(progress.calories_by_date)} options={baseChartOptions} />
                      </div>
                      <button onClick={() => setShowCaloriesTable((v) => !v)} className="text-xs text-slate-500 hover:text-slate-300 mt-3">
                        {showCaloriesTable ? 'Hide' : 'View'} as table
                      </button>
                      {showCaloriesTable && (
                        <table className="w-full text-xs mt-2 text-slate-400">
                          <thead>
                            <tr className="text-left border-b border-forest-700">
                              <th className="py-1">Date</th>
                              <th className="py-1">Calories (est.)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {progress.calories_by_date.map((p) => (
                              <tr key={p.date} className="border-b border-forest-800">
                                <td className="py-1">{p.date}</td>
                                <td className="py-1 tabular-nums">~{Math.round(p.total_calories).toLocaleString()} kcal</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">
                      {hasVolume ? 'Set your weight on your profile to see a calorie-burned estimate here.' : 'No workouts logged yet - once you log a few sessions, your calories-burned trend shows up here.'}
                    </p>
                  )}
                </div>

                <div className="card py-3 px-4">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="font-heading font-semibold text-sm">Strength Progress</h3>
                    {hasExercises && (
                      <select
                        value={selectedExerciseId ?? ''}
                        onChange={(e) => setSelectedExerciseId(Number(e.target.value))}
                        className="px-2 py-1 rounded-lg bg-forest-950 border border-forest-700 text-xs shrink-0"
                      >
                        {progress.exercises.map((ex) => (
                          <option key={ex.exercise_id} value={ex.exercise_id}>
                            {ex.exercise_name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mb-3">Track how your working weight is changing</p>
                  {hasExercises && selectedExercise ? (
                    <>
                      <div className="h-56">
                        <Line data={buildExerciseChartData(selectedExercise.history)} options={baseChartOptions} />
                      </div>
                      <button onClick={() => setShowExerciseTable((v) => !v)} className="text-xs text-slate-500 hover:text-slate-300 mt-3">
                        {showExerciseTable ? 'Hide' : 'View'} as table
                      </button>
                      {showExerciseTable && (
                        <table className="w-full text-xs mt-2 text-slate-400">
                          <thead>
                            <tr className="text-left border-b border-forest-700">
                              <th className="py-1">Date</th>
                              <th className="py-1">Weight</th>
                              <th className="py-1">Sets × Reps</th>
                              <th className="py-1">PR</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedExercise.history.map((p, i) => (
                              <tr key={i} className="border-b border-forest-800">
                                <td className="py-1">{new Date(p.performed_at).toLocaleDateString()}</td>
                                <td className="py-1 tabular-nums">{p.weight ?? 'bodyweight'}</td>
                                <td className="py-1 tabular-nums">{p.sets}×{p.reps}</td>
                                <td className="py-1">{p.is_pr && <TrophyIcon className="w-3.5 h-3.5 text-coral-400" />}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">No exercises logged yet - log a workout to start tracking progression.</p>
                  )}
                </div>

                <div className="card py-3 px-4 lg:col-span-2">
                  <h3 className="font-heading font-semibold text-sm mb-1">Workout Frequency</h3>
                  <p className="text-xs text-slate-500 mb-3">Completed workouts over time</p>
                  {hasWorkoutFrequency ? (
                    <div className="h-48">
                      <Bar data={buildWorkoutFrequencyData(logsByDate)} options={barChartOptions} />
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">No workouts logged yet - your weekly frequency shows up here once you do.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 4. Personal Records / Milestones */}
          <div>
            <h2 className="font-heading font-semibold text-sm text-slate-400 mb-3">Personal Records</h2>
            <div className="card p-4">
              {personalRecords.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {personalRecords.map((r) => (
                    <div key={r.title} className="flex items-start gap-2.5 rounded-lg border border-forest-700 bg-forest-950/40 p-3">
                      <TrophyIcon className="w-4 h-4 text-coral-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-heading font-semibold">{r.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{r.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Your first milestones will appear as you build your training history.</p>
              )}
            </div>
          </div>

          {/* 5. Performance Comparison */}
          <div>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <h2 className="font-heading font-semibold text-sm text-slate-400">Performance Comparison</h2>
              <div className="flex gap-2">
                {PERIODS.map((p) => (
                  <button key={p.id} onClick={() => setComparisonPeriod(p.id)} className={pillClass(comparisonPeriod === p.id)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="card p-4">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <OverviewCard
                  label="Training Volume"
                  value={comparison.current.volume > 0 ? `${Math.round(comparison.current.volume).toLocaleString()} lbs` : null}
                  pct={pctChange(comparison.current.volume, comparison.previous.volume)}
                  comparisonLabel={`previous ${comparison.period.label.toLowerCase()}`}
                  empty={comparison.current.volume === 0}
                />
                <OverviewCard
                  label="Calories Burned"
                  value={comparison.current.caloriesBurned > 0 ? `${Math.round(comparison.current.caloriesBurned).toLocaleString()} kcal` : null}
                  pct={pctChange(comparison.current.caloriesBurned, comparison.previous.caloriesBurned)}
                  comparisonLabel={`previous ${comparison.period.label.toLowerCase()}`}
                  empty={comparison.current.caloriesBurned === 0}
                />
                <OverviewCard
                  label="Workout Count"
                  value={comparison.current.workoutDays > 0 ? comparison.current.workoutDays : null}
                  pct={pctChange(comparison.current.workoutDays, comparison.previous.workoutDays)}
                  comparisonLabel={`previous ${comparison.period.label.toLowerCase()}`}
                  empty={comparison.current.workoutDays === 0}
                />
                <OverviewCard
                  label="Avg Workout Volume"
                  value={comparison.avgWorkoutVolume != null ? `${Math.round(comparison.avgWorkoutVolume).toLocaleString()} lbs` : null}
                  pct={pctChange(comparison.avgWorkoutVolume, comparison.prevAvgWorkoutVolume)}
                  comparisonLabel={`previous ${comparison.period.label.toLowerCase()}`}
                  empty={comparison.avgWorkoutVolume == null}
                />
                <OverviewCard
                  label="Strength (selected exercise)"
                  value={
                    selectedExercise
                      ? (() => {
                          const set = new Set(comparison.current.keys)
                          const rows = selectedExercise.history.filter((h) => set.has(h.performed_at.slice(0, 10)) && h.weight != null)
                          return rows.length ? `${rows[rows.length - 1].weight}` : null
                        })()
                      : null
                  }
                  comparisonLabel={`previous ${comparison.period.label.toLowerCase()}`}
                  empty={
                    !selectedExercise ||
                    !selectedExercise.history.some((h) => new Set(comparison.current.keys).has(h.performed_at.slice(0, 10)))
                  }
                  emptyText="Not enough data in this window"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'insights' && (
        <div className="space-y-4">
          {/* Weekly Recap - compliance/consistency only, fully computed from
              real logged data (no LLM call, so there's nothing here that can
              ever overlap with the training or diet cards below). */}
          <div className="card py-4 px-5">
            <h2 className="font-heading font-semibold text-sm mb-3">Weekly Recap</h2>
            {hasAnyHistory ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Active days</p>
                  <p className="text-xl font-bold tabular-nums">{recapStats.activeDays}<span className="text-sm text-slate-400 font-normal">/{recapStats.days}</span></p>
                </div>
                <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Calorie target adherence</p>
                  <p className="text-xl font-bold tabular-nums">{recapStats.adherencePct != null ? `${recapStats.adherencePct}%` : '—'}</p>
                  {recapStats.adherencePct == null && <p className="text-[11px] text-slate-500 mt-0.5">Set a calorie target to track this</p>}
                </div>
                <div className="rounded-lg border border-coral-500/40 bg-coral-500/10 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-coral-400 mb-1">Consistency rating</p>
                  <p className="text-xl font-bold">Grade {recapStats.grade}<span className="text-sm text-slate-400 font-normal ml-1">— {recapStats.overallPct}%</span></p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No activity logged in the last 7 days yet - once you log workouts, meals, or check in, your weekly recap shows up here.</p>
            )}
          </div>

          {/* Weekly Insights - training/strength/fatigue only, deterministic. */}
          <div className="card py-4 px-5">
            <h2 className="font-heading font-semibold text-sm mb-3">Weekly Insights</h2>
            {insightsStats.hasActivity ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Volume lifted</p>
                    <p className="text-lg font-bold tabular-nums">{Math.round(insightsStats.volume).toLocaleString()}</p>
                    <ChangeLine pct={insightsStats.volumeChangePct} comparisonLabel="last week" />
                  </div>
                  <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Sets completed</p>
                    <p className="text-lg font-bold tabular-nums">{insightsStats.sets}</p>
                    <p className="text-[11px] text-slate-500 mt-1.5">{insightsStats.workoutDays} workout day{insightsStats.workoutDays === 1 ? '' : 's'}</p>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">Muscle group split</p>
                  {insightsStats.muscleSplit.length > 0 ? (
                    <div className="space-y-1.5">
                      {insightsStats.muscleSplit.map((m) => (
                        <div key={m.zone} className="flex items-center gap-2">
                          <span className="text-xs text-slate-300 w-20 shrink-0 truncate">{m.label}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-forest-800 overflow-hidden">
                            <div className="h-full bg-coral-500" style={{ width: `${m.pct}%` }} />
                          </div>
                          <span className="text-xs text-slate-500 w-9 text-right shrink-0">{m.pct}%</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">No exercise catalog with a muscle group logged this week.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No workouts logged in the last 7 days - once you log a session, your training breakdown shows up here.</p>
            )}
          </div>

          {/* Weekly Nutrition Audit - the one remaining real AI call, already
              scoped to diet only. Everything else on this page (Progress and
              the two cards above) is deterministic, so there is no domain
              overlap left to fix. */}
          <div className="card py-4 px-5">
            <div className="flex justify-between items-center mb-3 gap-2">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 shrink-0">
                  <CoachAIIndicator />
                </div>
                <h2 className="font-heading font-semibold text-sm">Weekly Nutrition Audit</h2>
              </div>
              <button
                onClick={loadNutritionReview}
                disabled={nutritionReviewLoading}
                className="px-3 py-1.5 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-xs font-semibold"
              >
                {nutritionReviewLoading ? 'Auditing…' : nutritionReview ? 'Regenerate' : 'Generate'}
              </button>
            </div>
            {nutritionReviewError && <p className="text-sm text-red-400">{nutritionReviewError}</p>}
            {nutritionReviewLoading ? (
              <p className="text-sm text-slate-500 flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-forest-700 border-t-coral-500 rounded-full motion-safe:animate-spin" />
                Auditing…
              </p>
            ) : nutritionReview ? (
              <div className="space-y-3">
                {nutritionReview.avg_calories != null ? (
                  <div className="grid grid-cols-2 gap-2">
                    <MacroTile label="Calories" value={nutritionReview.avg_calories} unit=" kcal" badge={calorieBadge(nutritionReview.avg_calories, nutritionReview.calorie_target)} dailyData={nutritionReview.daily_calories} colors={SPARKLINE_COLORS.calories} />
                    <MacroTile label="Protein" value={nutritionReview.avg_protein} unit="g" badge={macroTargetBadge(nutritionReview.avg_protein, nutritionReview.protein_target)} dailyData={nutritionReview.daily_protein} colors={SPARKLINE_COLORS.protein} />
                    <MacroTile label="Carbs" value={nutritionReview.avg_carbs} unit="g" badge={macroTargetBadge(nutritionReview.avg_carbs, nutritionReview.carbs_target)} dailyData={nutritionReview.daily_carbs} colors={SPARKLINE_COLORS.carbs} />
                    <MacroTile label="Fat" value={nutritionReview.avg_fat} unit="g" badge={macroTargetBadge(nutritionReview.avg_fat, nutritionReview.fat_target)} dailyData={nutritionReview.daily_fat} colors={SPARKLINE_COLORS.fat} />
                  </div>
                ) : (
                  <p className="text-sm text-slate-200">{nutritionReview.macro_status}</p>
                )}
                <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Pattern</p>
                  <p className="text-sm text-slate-200">{nutritionReview.key_pattern}</p>
                  {nutritionReview.days_logged != null && <p className="text-xs text-slate-500 mt-1">Logged {nutritionReview.days_logged} of 7 days</p>}
                </div>
                <div className="rounded-lg border border-coral-500/40 bg-coral-500/10 p-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-coral-400 mb-1">Recommendation</p>
                  <p className="text-sm text-slate-100">{nutritionReview.recommendation}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Macro consistency, protein-target, and calorie-trend audit for the last 7 days.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'biometrics' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card py-3 px-4">
            <div className="flex justify-between items-center mb-1">
              <h2 className="font-heading font-semibold text-sm">Fatigue &amp; Injury-Risk Model</h2>
              {fatigue?.risk && fatigue.risk.risk_level !== 'unknown' && (
                <span className={`text-xs font-semibold uppercase tracking-wide shrink-0 ${RISK_STYLES[fatigue.risk.risk_level]}`}>{fatigue.risk.risk_level} risk</span>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-3">Banister impulse-response model - Fitness/Fatigue accumulate from training load, Form is the balance between them.</p>
            {fatigue && fatigue.series.length > 0 ? (
              <>
                <div className="h-56">
                  <Line data={buildFatigueChartData(fatigue.series)} options={fatigueChartOptions} />
                </div>
                {fatigue.risk && <p className="text-sm text-slate-300 mt-3">{fatigue.risk.message}</p>}
              </>
            ) : (
              <p className="text-sm text-slate-500">No workouts logged yet - once you log a few sessions, your fitness/fatigue trend shows up here.</p>
            )}
          </div>

          <div className="card py-3 px-4">
            <h2 className="font-heading font-semibold text-sm mb-1">Limb Asymmetry Check</h2>
            <p className="text-xs text-slate-500 mb-3">Compare left vs. right side measurements - per-rep knee angle, rep tempo, or peak load. Comma-separated numbers per side.</p>
            <form onSubmit={handleAsymmetrySubmit} className="space-y-3">
              <input
                type="text"
                value={asymmetryForm.metricName}
                onChange={(e) => setAsymmetryForm((f) => ({ ...f, metricName: e.target.value }))}
                placeholder="Metric name (e.g. knee angle, rep tempo)"
                className="w-full px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={asymmetryForm.left}
                  onChange={(e) => setAsymmetryForm((f) => ({ ...f, left: e.target.value }))}
                  placeholder="Left side values, e.g. 92, 94, 91"
                  className="px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
                />
                <input
                  type="text"
                  value={asymmetryForm.right}
                  onChange={(e) => setAsymmetryForm((f) => ({ ...f, right: e.target.value }))}
                  placeholder="Right side values, e.g. 80, 82, 79"
                  className="px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
                />
              </div>
              <button type="submit" disabled={asymmetryLoading} className="px-4 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-heading font-semibold">
                {asymmetryLoading ? 'Checking…' : 'Check asymmetry'}
              </button>
            </form>
            {asymmetryError && <p className="text-sm text-red-400 mt-3">{asymmetryError}</p>}
            {asymmetryResult && (
              <div className={`mt-4 p-4 rounded-xl border ${asymmetryResult.flagged ? 'border-red-500/60 bg-red-500/10' : 'border-forest-700 bg-forest-900/40'}`}>
                <p className="text-sm text-slate-200">
                  <span className="font-semibold">{asymmetryResult.diff_pct}%</span>{' '}
                  {asymmetryResult.stronger_side === 'even' ? 'difference' : `${asymmetryResult.stronger_side}-side dominance`} on {asymmetryResult.metric_name} (left avg {asymmetryResult.left_avg}, right avg {asymmetryResult.right_avg}).
                </p>
                <p className={`text-xs mt-1 ${asymmetryResult.flagged ? 'text-red-400' : 'text-slate-500'}`}>{asymmetryResult.message}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
