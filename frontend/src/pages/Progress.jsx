import { useEffect, useMemo, useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Legend,
  Tooltip,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { jsPDF } from 'jspdf'
import { api } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Legend, Tooltip)

// Single-series charts - one hue throughout (brand accent, electric lime),
// no legend needed.
const CORAL = '#c6ff3d'
const GRID_COLOR = 'rgba(148, 163, 184, 0.12)'
const TEXT_MUTED = '#94a3b8'

// Fitness/Fatigue/Form is a 3-series categorical chart, so it needs its own
// fixed-order palette (validated: OKLCH lightness band + CVD separation both
// pass in dark mode against the forest-950 surface) plus a legend - unlike
// the single-series charts above, color alone now carries series identity.
const FITNESS_COLOR = '#059669'
const FATIGUE_COLOR = '#e2542a'
const FORM_COLOR = '#0284c7'

const RISK_STYLES = {
  low: 'text-emerald-400',
  moderate: 'text-amber-400',
  high: 'text-red-400',
  unknown: 'text-slate-500',
}

// Calories reads as a deficit/surplus against target; the other three macros
// read as "how much of the target did I hit" - same underlying percentage,
// different framing, so they're two small helpers rather than one generic one.
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
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400 whitespace-nowrap">
      {pct}% Target achieved
    </span>
  )
}

// Icon+number+sparkline stat tiles for the Weekly Nutrition Audit card - one
// hue per macro, matching the brand colors already used elsewhere (bg-coral-500/
// bg-emerald-500/bg-sky-500/bg-amber-500), each with its own low-opacity fill.
const SPARKLINE_COLORS = {
  calories: { line: '#c6ff3d', fill: 'rgba(198, 255, 61, 0.15)' },
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
      {
        data: dailyData,
        borderColor: colors.line,
        backgroundColor: colors.fill,
        borderWidth: 2,
        fill: true,
        tension: 0.35,
        pointRadius: 0,
      },
    ],
  }
}

function MacroTile({ icon, label, value, unit, badge, dailyData, colors }) {
  return (
    <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-2.5">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
        <span>{icon}</span>
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

// Same text-based jsPDF approach as LiveSession.jsx's buildWorkoutPdf - real
// vector text (small, selectable, searchable) rather than rasterizing a DOM
// snapshot for content that's fundamentally a few labeled numbers and two
// short paragraphs.
function buildNutritionAuditPdf(review) {
  const doc = new jsPDF()
  // A PDF renders on white paper regardless of the app's dark theme - the
  // bright neon lime used on-screen has terrible contrast on white, so this
  // uses a darker, print-safe olive-lime instead of the literal UI accent.
  const CORAL = [122, 176, 24]
  const SLATE = [100, 116, 139]
  const INK = [15, 23, 42]
  const marginX = 20
  let y = 22

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...CORAL)
  doc.text('AI Fitness Agent', marginX, y)
  y += 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(...INK)
  doc.text('Weekly Nutrition Audit', marginX, y)
  y += 6

  doc.setFontSize(10)
  doc.setTextColor(...SLATE)
  doc.text(new Date().toLocaleDateString(undefined, { dateStyle: 'long' }), marginX, y)
  y += 4
  doc.setDrawColor(...SLATE)
  doc.line(marginX, y, 190, y)
  y += 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...INK)
  doc.text('Macro Breakdown', marginX, y)
  y += 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const rows = [
    ['Calories', review.avg_calories, review.calorie_target, ' kcal'],
    ['Protein', review.avg_protein, review.protein_target, 'g'],
    ['Carbs', review.avg_carbs, review.carbs_target, 'g'],
    ['Fat', review.avg_fat, review.fat_target, 'g'],
  ]
  const numericRows = rows.filter(([, value]) => value != null)
  if (numericRows.length === 0) {
    doc.setTextColor(...SLATE)
    doc.text('No numeric macro data available for this period.', marginX, y)
    y += 7
  } else {
    for (const [label, value, target, unit] of numericRows) {
      const pct = target ? Math.round((value / target) * 100) : null
      doc.setTextColor(...SLATE)
      doc.text(label, marginX, y)
      doc.setTextColor(...INK)
      const valueLabel = target
        ? `${Math.round(value)}${unit} / ${Math.round(target)}${unit}${pct != null ? ` (${pct}%)` : ''}`
        : `${Math.round(value)}${unit}`
      doc.text(valueLabel, marginX + 45, y)
      y += 7
    }
  }
  y += 5

  doc.setDrawColor(...SLATE)
  doc.line(marginX, y, 190, y)
  y += 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...INK)
  doc.text('Pattern', marginX, y)
  y += 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...INK)
  const patternLines = doc.splitTextToSize(review.key_pattern || 'n/a', 170)
  doc.text(patternLines, marginX, y)
  y += patternLines.length * 6 + 8

  doc.setDrawColor(...SLATE)
  doc.line(marginX, y, 190, y)
  y += 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...CORAL)
  doc.text('Recommendation', marginX, y)
  y += 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...INK)
  const recLines = doc.splitTextToSize(review.recommendation || 'n/a', 170)
  doc.text(recLines, marginX, y)

  doc.save(`nutrition-audit-${new Date().toISOString().slice(0, 10)}.pdf`)
}

// Same tab-pill pattern used elsewhere in the app (MealPhoto.jsx, LiveSession.jsx).
const TABS = [
  { id: 'insights', label: 'AI Insights & Audits' },
  { id: 'performance', label: 'Performance & Metrics' },
  { id: 'biometrics', label: 'Advanced Biometrics & Recovery' },
]

function tabClass(active) {
  return `px-4 py-2 rounded-lg text-sm font-heading font-semibold transition-colors whitespace-nowrap ${
    active ? 'bg-coral-500' : 'bg-forest-900 text-slate-400 hover:text-slate-200'
  }`
}

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
        pointHoverBorderColor: '#0c0c0f',
        pointHoverBorderWidth: 2,
        tension: 0.25,
        fill: true,
        backgroundColor: (ctx) => {
          const { chart } = ctx
          const { ctx: canvasCtx, chartArea } = chart
          if (!chartArea) return 'rgba(198, 255, 61, 0.12)'
          const gradient = canvasCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
          gradient.addColorStop(0, 'rgba(198, 255, 61, 0.28)')
          gradient.addColorStop(1, 'rgba(198, 255, 61, 0.02)')
          return gradient
        },
      },
    ],
  }
}

// Same shape/style as buildVolumeChartData - Calories Burned is a second
// single-series chart sourced from calories_by_date (MET-formula estimate,
// see backend/app/agent/fatigue.py), not a different visual language.
function buildCaloriesChartData(caloriesByDate) {
  return {
    labels: caloriesByDate.map((p) => p.date),
    datasets: [
      {
        label: 'Calories Burned (est.)',
        data: caloriesByDate.map((p) => p.total_calories),
        borderColor: CORAL,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: CORAL,
        pointHoverBorderColor: '#0c0c0f',
        pointHoverBorderWidth: 2,
        tension: 0.25,
        fill: true,
        backgroundColor: (ctx) => {
          const { chart } = ctx
          const { ctx: canvasCtx, chartArea } = chart
          if (!chartArea) return 'rgba(198, 255, 61, 0.12)'
          const gradient = canvasCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
          gradient.addColorStop(0, 'rgba(198, 255, 61, 0.28)')
          gradient.addColorStop(1, 'rgba(198, 255, 61, 0.02)')
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
        borderColor: CORAL,
        borderWidth: 2,
        tension: 0.15,
        fill: false,
        // PRs get a bigger marker with a surface ring; everything else stays
        // small so the line - not a field of dots - carries the trend.
        pointRadius: history.map((p) => (p.is_pr ? 6 : 2)),
        pointHoverRadius: history.map((p) => (p.is_pr ? 8 : 5)),
        pointBackgroundColor: CORAL,
        pointBorderColor: '#0c0c0f',
        pointBorderWidth: history.map((p) => (p.is_pr ? 2 : 1)),
      },
    ],
  }
}

function buildFatigueChartData(series) {
  return {
    labels: series.map((p) => p.date),
    datasets: [
      {
        label: 'Fitness',
        data: series.map((p) => p.fitness),
        borderColor: FITNESS_COLOR,
        backgroundColor: FITNESS_COLOR,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.2,
      },
      {
        label: 'Fatigue',
        data: series.map((p) => p.fatigue),
        borderColor: FATIGUE_COLOR,
        backgroundColor: FATIGUE_COLOR,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.2,
      },
      {
        label: 'Form',
        data: series.map((p) => p.form),
        borderColor: FORM_COLOR,
        backgroundColor: FORM_COLOR,
        borderWidth: 2,
        borderDash: [4, 3],
        pointRadius: 0,
        tension: 0.2,
      },
    ],
  }
}

const baseChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
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
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: TEXT_MUTED, maxRotation: 0, autoSkip: true },
    },
    y: {
      grid: { color: GRID_COLOR },
      ticks: { color: TEXT_MUTED, callback: (v) => v.toLocaleString() },
      beginAtZero: true,
    },
  },
}

// 3-series chart: legend on, tooltip markers on - color is now the only way
// to tell Fitness/Fatigue/Form apart, so both must show it.
const fatigueChartOptions = {
  ...baseChartOptions,
  plugins: {
    ...baseChartOptions.plugins,
    legend: {
      display: true,
      position: 'top',
      align: 'end',
      labels: { color: TEXT_MUTED, boxWidth: 12, boxHeight: 2, usePointStyle: false, padding: 16 },
    },
    tooltip: { ...baseChartOptions.plugins.tooltip, displayColors: true },
  },
}

export default function Progress() {
  const { userId } = useSession()
  const [activeTab, setActiveTab] = useState('insights')
  const [progress, setProgress] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedExerciseId, setSelectedExerciseId] = useState(null)
  const [recap, setRecap] = useState('')
  const [recapLoading, setRecapLoading] = useState(false)
  const [recapError, setRecapError] = useState('')
  const [digest, setDigest] = useState(null)
  const [digestLoading, setDigestLoading] = useState(false)
  const [digestError, setDigestError] = useState('')
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

  useEffect(() => {
    api
      .getProgress(userId)
      .then((data) => {
        setProgress(data)
        if (data.exercises.length > 0) setSelectedExerciseId(data.exercises[0].exercise_id)
      })
      .catch(() => setProgress({ volume_by_date: [], calories_by_date: [], exercises: [] }))
      .finally(() => setLoading(false))

    api
      .getFatigue(userId)
      .then(setFatigue)
      .catch(() => setFatigue({ series: [], risk: null }))
  }, [userId])

  const selectedExercise = useMemo(
    () => progress?.exercises.find((e) => e.exercise_id === selectedExerciseId),
    [progress, selectedExerciseId],
  )

  async function loadRecap() {
    setRecapLoading(true)
    setRecapError('')
    try {
      const data = await api.getWeeklyRecap(userId)
      setRecap(data.recap)
    } catch (err) {
      setRecapError(err.message)
    } finally {
      setRecapLoading(false)
    }
  }

  async function loadDigest() {
    setDigestLoading(true)
    setDigestError('')
    try {
      const data = await api.getWeeklyDigest(userId)
      setDigest(data)
    } catch (err) {
      setDigestError(err.message)
    } finally {
      setDigestLoading(false)
    }
  }

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

  async function handleAsymmetrySubmit(event) {
    event.preventDefault()
    setAsymmetryLoading(true)
    setAsymmetryError('')
    setAsymmetryResult(null)
    try {
      const parseValues = (raw) =>
        raw
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
          .map(Number)

      const left_values = parseValues(asymmetryForm.left)
      const right_values = parseValues(asymmetryForm.right)
      if (left_values.some(Number.isNaN) || right_values.some(Number.isNaN)) {
        throw new Error('Enter comma-separated numbers only, e.g. 92, 94, 91')
      }

      const data = await api.checkAsymmetry({
        left_values,
        right_values,
        metric_name: asymmetryForm.metricName.trim() || 'measurement',
      })
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

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 font-body space-y-4">
      <h1 className="font-heading font-bold text-2xl">Progress</h1>

      <div className="flex gap-2 flex-wrap">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={tabClass(activeTab === tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'insights' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
          <div className="card py-3 px-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-heading font-semibold text-sm">Weekly AI Recap</h2>
              <button
                onClick={loadRecap}
                disabled={recapLoading}
                className="px-3 py-1.5 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-xs font-semibold shrink-0"
              >
                {recapLoading ? 'Generating…' : recap ? 'Regenerate' : 'Generate'}
              </button>
            </div>
            {recapError && <p className="text-sm text-red-400">{recapError}</p>}
            {recap ? (
              <p className="text-sm text-slate-300 leading-relaxed">{recap}</p>
            ) : (
              !recapLoading && <p className="text-sm text-slate-500">Summary of your last 7 days.</p>
            )}
          </div>

          <div className="card py-3 px-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-heading font-semibold text-sm">Weekly AI Insights</h2>
              <button
                onClick={loadDigest}
                disabled={digestLoading}
                className="px-3 py-1.5 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-xs font-semibold shrink-0"
              >
                {digestLoading ? 'Synthesizing…' : digest ? 'Regenerate' : 'Generate'}
              </button>
            </div>
            {digestError && <p className="text-sm text-red-400">{digestError}</p>}
            {digestLoading ? (
              <p className="text-sm text-slate-500 flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-forest-700 border-t-coral-500 rounded-full animate-spin" />
                Synthesizing…
              </p>
            ) : digest ? (
              <ul className="space-y-1.5 text-sm text-slate-200">
                <li className="flex gap-2">
                  <span>🚀</span>
                  <span>
                    <span className="font-semibold">Win:</span> {digest.biggest_win}
                  </span>
                </li>
                <li className="flex gap-2">
                  <span>⚠️</span>
                  <span>
                    <span className="font-semibold">Recovery:</span> {digest.recovery_note}
                  </span>
                </li>
                <li className="flex gap-2">
                  <span>🎯</span>
                  <span>
                    <span className="font-semibold">Focus:</span> {digest.next_week_focus}
                  </span>
                </li>
              </ul>
            ) : (
              <p className="text-sm text-slate-500">
                Workouts, readiness, and meals from the last 7 days into three bullets.
              </p>
            )}
          </div>

          <div className="card py-3 px-4">
            <div className="flex justify-between items-center mb-2 gap-2">
              <h2 className="font-heading font-semibold text-sm">Weekly Nutrition Audit</h2>
              <div className="flex gap-2 shrink-0">
                {nutritionReview && (
                  <button
                    onClick={() => buildNutritionAuditPdf(nutritionReview)}
                    className="px-3 py-1.5 rounded-lg border border-forest-700 hover:border-coral-400 transition-colors text-xs font-semibold"
                  >
                    📄 Export PDF Report
                  </button>
                )}
                <button
                  onClick={loadNutritionReview}
                  disabled={nutritionReviewLoading}
                  className="px-3 py-1.5 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-xs font-semibold"
                >
                  {nutritionReviewLoading ? 'Auditing…' : nutritionReview ? 'Regenerate' : 'Generate'}
                </button>
              </div>
            </div>
            {nutritionReviewError && <p className="text-sm text-red-400">{nutritionReviewError}</p>}
            {nutritionReviewLoading ? (
              <p className="text-sm text-slate-500 flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-forest-700 border-t-coral-500 rounded-full animate-spin" />
                Auditing…
              </p>
            ) : nutritionReview ? (
              <div className="space-y-3">
                {nutritionReview.avg_calories != null ? (
                  <div className="grid grid-cols-2 gap-2">
                    <MacroTile
                      icon="🔥"
                      label="Calories"
                      value={nutritionReview.avg_calories}
                      unit=" kcal"
                      badge={calorieBadge(nutritionReview.avg_calories, nutritionReview.calorie_target)}
                      dailyData={nutritionReview.daily_calories}
                      colors={SPARKLINE_COLORS.calories}
                    />
                    <MacroTile
                      icon="🥩"
                      label="Protein"
                      value={nutritionReview.avg_protein}
                      unit="g"
                      badge={macroTargetBadge(nutritionReview.avg_protein, nutritionReview.protein_target)}
                      dailyData={nutritionReview.daily_protein}
                      colors={SPARKLINE_COLORS.protein}
                    />
                    <MacroTile
                      icon="🌾"
                      label="Carbs"
                      value={nutritionReview.avg_carbs}
                      unit="g"
                      badge={macroTargetBadge(nutritionReview.avg_carbs, nutritionReview.carbs_target)}
                      dailyData={nutritionReview.daily_carbs}
                      colors={SPARKLINE_COLORS.carbs}
                    />
                    <MacroTile
                      icon="🥑"
                      label="Fat"
                      value={nutritionReview.avg_fat}
                      unit="g"
                      badge={macroTargetBadge(nutritionReview.avg_fat, nutritionReview.fat_target)}
                      dailyData={nutritionReview.daily_fat}
                      colors={SPARKLINE_COLORS.fat}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-slate-200 flex gap-2">
                    <span>📊</span>
                    <span>{nutritionReview.macro_status}</span>
                  </p>
                )}

                <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">🔄 Pattern</p>
                  <p className="text-sm text-slate-200">{nutritionReview.key_pattern}</p>
                  {nutritionReview.days_logged != null && (
                    <p className="text-xs text-slate-500 mt-1">Logged {nutritionReview.days_logged} of 7 days</p>
                  )}
                </div>

                <div className="rounded-lg border border-coral-500/40 bg-coral-500/10 p-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-coral-400 mb-1">🎯 Recommendation</p>
                  <p className="text-sm text-slate-100">{nutritionReview.recommendation}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Macro consistency, protein-target, and calorie-trend audit for the last 7 days.
              </p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'performance' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="card py-3 px-4">
            <h2 className="font-heading font-semibold text-sm mb-1">Training Volume</h2>
            <p className="text-xs text-slate-500 mb-3">Total sets × reps × weight, per day.</p>
            {hasVolume ? (
              <>
                <div className="h-56">
                  <Line data={buildVolumeChartData(progress.volume_by_date)} options={baseChartOptions} />
                </div>
                <button
                  onClick={() => setShowVolumeTable((v) => !v)}
                  className="text-xs text-slate-500 hover:text-slate-300 mt-3"
                >
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
              <p className="text-sm text-slate-500">
                No workouts logged yet - once you log a few sessions, your volume trend shows up here.
              </p>
            )}
          </div>

          <div className="card py-3 px-4">
            <h2 className="font-heading font-semibold text-sm mb-1">Calories Burned</h2>
            <p className="text-xs text-slate-500 mb-3">
              MET-formula estimate per day (est.), from your logged sets/reps/weight/RPE and body weight.
            </p>
            {hasCalories ? (
              <>
                <div className="h-56">
                  <Line data={buildCaloriesChartData(progress.calories_by_date)} options={baseChartOptions} />
                </div>
                <button
                  onClick={() => setShowCaloriesTable((v) => !v)}
                  className="text-xs text-slate-500 hover:text-slate-300 mt-3"
                >
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
                {hasVolume
                  ? 'Set your weight on your profile to see a calorie-burned estimate here.'
                  : 'No workouts logged yet - once you log a few sessions, your calories-burned trend shows up here.'}
              </p>
            )}
          </div>

          <div className="card py-3 px-4">
            <div className="flex justify-between items-center mb-1">
              <h2 className="font-heading font-semibold text-sm">Exercise Progression</h2>
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
            <p className="text-xs text-slate-500 mb-3">Weight over time - larger points mark a PR.</p>
            {hasExercises && selectedExercise ? (
              <>
                <div className="h-56">
                  <Line data={buildExerciseChartData(selectedExercise.history)} options={baseChartOptions} />
                </div>
                <button
                  onClick={() => setShowExerciseTable((v) => !v)}
                  className="text-xs text-slate-500 hover:text-slate-300 mt-3"
                >
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
                          <td className="py-1 tabular-nums">
                            {p.sets}×{p.reps}
                          </td>
                          <td className="py-1">{p.is_pr ? '🏆' : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-500">
                No exercises logged yet - log a workout to start tracking progression.
              </p>
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
                <span
                  className={`text-xs font-semibold uppercase tracking-wide shrink-0 ${RISK_STYLES[fatigue.risk.risk_level]}`}
                >
                  {fatigue.risk.risk_level} risk
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Banister impulse-response model - Fitness/Fatigue accumulate from training load, Form is the
              balance between them.
            </p>
            {fatigue && fatigue.series.length > 0 ? (
              <>
                <div className="h-56">
                  <Line data={buildFatigueChartData(fatigue.series)} options={fatigueChartOptions} />
                </div>
                {fatigue.risk && <p className="text-sm text-slate-300 mt-3">{fatigue.risk.message}</p>}
              </>
            ) : (
              <p className="text-sm text-slate-500">
                No workouts logged yet - once you log a few sessions, your fitness/fatigue trend shows up
                here.
              </p>
            )}
          </div>

          <div className="card py-3 px-4">
            <h2 className="font-heading font-semibold text-sm mb-1">Limb Asymmetry Check</h2>
            <p className="text-xs text-slate-500 mb-3">
              Compare left vs. right side measurements - per-rep knee angle, rep tempo, or peak load.
              Comma-separated numbers per side.
            </p>
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
              <button
                type="submit"
                disabled={asymmetryLoading}
                className="px-4 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-heading font-semibold"
              >
                {asymmetryLoading ? 'Checking…' : 'Check asymmetry'}
              </button>
            </form>
            {asymmetryError && <p className="text-sm text-red-400 mt-3">{asymmetryError}</p>}
            {asymmetryResult && (
              <div
                className={`mt-4 p-4 rounded-xl border ${
                  asymmetryResult.flagged
                    ? 'border-red-500/60 bg-red-500/10'
                    : 'border-forest-700 bg-forest-900/40'
                }`}
              >
                <p className="text-sm text-slate-200">
                  <span className="font-semibold">{asymmetryResult.diff_pct}%</span>{' '}
                  {asymmetryResult.stronger_side === 'even'
                    ? 'difference'
                    : `${asymmetryResult.stronger_side}-side dominance`}{' '}
                  on {asymmetryResult.metric_name} (left avg {asymmetryResult.left_avg}, right avg{' '}
                  {asymmetryResult.right_avg}).
                </p>
                <p className={`text-xs mt-1 ${asymmetryResult.flagged ? 'text-red-400' : 'text-slate-500'}`}>
                  {asymmetryResult.message}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
