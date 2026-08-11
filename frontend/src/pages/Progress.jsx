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
import { Line, Bar, Doughnut } from 'react-chartjs-2'
import { jsPDF } from 'jspdf'
import { api } from '../api.js'
import CoachAIIndicator from '../components/CoachAIIndicator.jsx'
import MacroBar from '../components/MacroBar.jsx'
import ProgressRing from '../components/ProgressRing.jsx'
import { useSession } from '../context/SessionContext.jsx'

// Plain inline SVGs, matching this app's existing icon convention - replace
// emoji glyphs in the redesigned JSX below with the same underlying
// information (a labeled stat still says exactly what it said before).
function FlameIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.963 2.286a.75.75 0 00-1.071-.136 9.742 9.742 0 00-3.539 6.176 7.547 7.547 0 01-1.705-1.715.75.75 0 00-1.152-.082A9 9 0 1015.68 4.534a7.46 7.46 0 01-2.717-2.248zM15.75 14.25a3.75 3.75 0 11-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 011.925-3.545 3.75 3.75 0 013.255 3.717z" />
    </svg>
  )
}

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

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Legend,
  Tooltip,
)

// Single-series charts - one hue throughout (brand accent, electric lime),
// no legend needed.
const CORAL = '#ccff00'
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
  calories: { line: '#ccff00', fill: 'rgba(204, 255, 0, 0.15)' },
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

// --- Weekly AI Recap dashboard (moved here from Calendar.jsx) ---
// This card used to be plain AI prose; it's now a real chart dashboard
// (calories-per-day bar chart, streak ring, workouts-this-week goal tile,
// a 3-tile insights row) computed client-side from this user's own logs/
// meals/check-ins, with the AI-generated recap text rendered underneath as
// a compact tinted "Snapshot" box - matching the Weekly Nutrition Audit
// card's tile+tinted-box language instead of a lone paragraph. Nothing
// here is fabricated: every number traces back to a real logged row.

const CORAL_DIM = 'rgba(204, 255, 0, 0.35)'
// Reuses this app's one pre-existing semantic amber tone (already used for
// "surplus"/"attention" states - calorieBadge above, MacroTile's fat
// sparkline) for the week's single peak-day highlight, rather than adding
// a new hue just for this chart.
const PEAK_COLOR = '#f59e0b'
const WEEKDAY_SHORT_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'short' })
const WEEKDAY_LONG_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'long' })

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

// Returns `n` consecutive date keys ending at (and including) `endDate`,
// oldest first.
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
// walking backward from today. If today itself has nothing logged yet,
// that alone doesn't zero out an otherwise-real streak - counting starts
// from yesterday in that case, same as any habit-tracker streak reads.
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

// Two tones only, per this app's dataviz convention: lime for "on track /
// stable", the pre-existing amber warning tone for a swing worth
// attention. Direction alone isn't inherently good or bad without knowing
// the user's goal (cut vs. bulk), so tone is driven by magnitude.
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
        backgroundColor: dailyCalories.map((_, i) => (i === peakIndex ? PEAK_COLOR : CORAL_DIM)),
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
  // buildPeakLabelPlugin below).
  layout: { padding: { top: 20 } },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#121214',
      borderColor: 'rgba(204, 255, 0, 0.35)',
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

// Direct-labels the week's peak calorie bar with its real value - a tiny
// inline plugin object instead of adding the chartjs-plugin-datalabels
// dependency for a single label.
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
      backgroundColor: '#121214',
      borderColor: 'rgba(204, 255, 0, 0.35)',
      borderWidth: 1,
      titleColor: '#e2e8f0',
      bodyColor: '#e2e8f0',
      padding: 8,
      callbacks: { label: (ctx) => `${ctx.label}: ${Math.round(ctx.parsed)}g` },
    },
  },
}

// A colored dot matching the tile's own sparkline color stands in for the
// old food emoji (🥩🌾🥑) - same "color carries identity" convention already
// used for macros everywhere else in this app (Meal Photo, Macro
// Calculator), rather than decorative icons a text label already covers.
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

// Single consolidated report across the whole Analytics tab (recap, weekly
// insights, nutrition audit, training volume, calories burned, fatigue
// model) rather than one PDF per card - real vector text throughout (small,
// selectable, searchable), same approach as LiveSession.jsx's
// buildWorkoutPdf, extended with page-break handling since this report is
// much longer than the old single-card one.
const PDF_MARGIN_X = 20
const PDF_PAGE_BOTTOM = 275
// A PDF renders on white paper regardless of the app's dark theme - the
// bright neon lime used on-screen has terrible contrast on white, so this
// uses a darker, print-safe olive-lime instead of the literal UI accent.
const PDF_CORAL = [122, 176, 24]
const PDF_SLATE = [100, 116, 139]
const PDF_INK = [15, 23, 42]

function buildFullAnalyticsReport({ recap, digest, nutritionReview, progress, fatigue }) {
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
    doc.text(String(value), PDF_MARGIN_X + 55, y)
    y += 7
  }

  // Header
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

  // Weekly Recap
  sectionTitle('Weekly Recap')
  paragraph(recap || 'Not generated yet - visit AI Insights & Audits and click Generate.')
  sectionRule()

  // Weekly Insights
  sectionTitle('Weekly Insights')
  if (digest) {
    statLine('Win', digest.biggest_win || 'n/a')
    statLine('Recovery', digest.recovery_note || 'n/a')
    statLine('Focus', digest.next_week_focus || 'n/a')
  } else {
    paragraph('Not generated yet - visit AI Insights & Audits and click Generate.')
  }
  sectionRule()

  // Weekly Nutrition Audit
  sectionTitle('Weekly Nutrition Audit')
  if (nutritionReview) {
    const macroRows = [
      ['Calories', nutritionReview.avg_calories, nutritionReview.calorie_target, ' kcal'],
      ['Protein', nutritionReview.avg_protein, nutritionReview.protein_target, 'g'],
      ['Carbs', nutritionReview.avg_carbs, nutritionReview.carbs_target, 'g'],
      ['Fat', nutritionReview.avg_fat, nutritionReview.fat_target, 'g'],
    ].filter(([, value]) => value != null)
    if (macroRows.length === 0) {
      paragraph('No numeric macro data available for this period.')
    } else {
      for (const [label, value, target, unit] of macroRows) {
        const pct = target ? Math.round((value / target) * 100) : null
        const valueLabel = target
          ? `${Math.round(value)}${unit} / ${Math.round(target)}${unit}${pct != null ? ` (${pct}%)` : ''}`
          : `${Math.round(value)}${unit}`
        statLine(label, valueLabel)
      }
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
    paragraph('Not generated yet - visit AI Insights & Audits and click Generate.')
  }
  sectionRule()

  // Training Volume
  sectionTitle('Training Volume')
  const volumeByDate = progress?.volume_by_date || []
  if (volumeByDate.length > 0) {
    const total = volumeByDate.reduce((sum, p) => sum + p.total_volume, 0)
    statLine('Days trained', volumeByDate.length)
    statLine('Total volume', `${Math.round(total).toLocaleString()} lbs`)
    statLine('Avg per session', `${Math.round(total / volumeByDate.length).toLocaleString()} lbs`)
    statLine('Most recent', `${volumeByDate[volumeByDate.length - 1].date} - ${Math.round(volumeByDate[volumeByDate.length - 1].total_volume).toLocaleString()} lbs`)
  } else {
    paragraph('No workouts logged yet.')
  }
  sectionRule()

  // Calories Burned
  sectionTitle('Calories Burned (est.)')
  const caloriesByDate = progress?.calories_by_date || []
  if (caloriesByDate.length > 0) {
    const total = caloriesByDate.reduce((sum, p) => sum + p.total_calories, 0)
    statLine('Days logged', caloriesByDate.length)
    statLine('Total burned', `~${Math.round(total).toLocaleString()} kcal`)
    statLine('Avg per session', `~${Math.round(total / caloriesByDate.length).toLocaleString()} kcal`)
  } else {
    paragraph('No workouts logged yet.')
  }
  sectionRule()

  // Fitness / Fatigue / Form
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

  doc.save(`align-progress-report-${new Date().toISOString().slice(0, 10)}.pdf`)
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
        pointHoverBorderColor: '#0c0c0e',
        pointHoverBorderWidth: 2,
        tension: 0.25,
        fill: true,
        backgroundColor: (ctx) => {
          const { chart } = ctx
          const { ctx: canvasCtx, chartArea } = chart
          if (!chartArea) return 'rgba(204, 255, 0, 0.12)'
          const gradient = canvasCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
          gradient.addColorStop(0, 'rgba(204, 255, 0, 0.28)')
          gradient.addColorStop(1, 'rgba(204, 255, 0, 0.02)')
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
        pointHoverBorderColor: '#0c0c0e',
        pointHoverBorderWidth: 2,
        tension: 0.25,
        fill: true,
        backgroundColor: (ctx) => {
          const { chart } = ctx
          const { ctx: canvasCtx, chartArea } = chart
          if (!chartArea) return 'rgba(204, 255, 0, 0.12)'
          const gradient = canvasCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
          gradient.addColorStop(0, 'rgba(204, 255, 0, 0.28)')
          gradient.addColorStop(1, 'rgba(204, 255, 0, 0.02)')
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
        pointBorderColor: '#0c0c0e',
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
      backgroundColor: '#121214',
      borderColor: 'rgba(204, 255, 0, 0.35)',
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
  // Backs the Weekly AI Recap card's moved chart dashboard - same three
  // per-day aggregations Calendar.jsx used to build, now fetched here
  // instead. Fetched independently of the page's top-level `loading` gate
  // (like the fatigue fetch below) so it doesn't block the rest of the tab.
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

    api
      .getFatigue(userId)
      .then(setFatigue)
      .catch(() => setFatigue({ series: [], risk: null }))

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
        // No history yet (or a fetch failure) - the dashboard just falls
        // back to its empty state below, same as everywhere else in this app.
      })
  }, [userId])

  const distinctDaysLogged = useMemo(() => {
    const days = new Set([...Object.keys(logsByDate), ...Object.keys(mealsByDate), ...Object.keys(checkinsByDate)])
    return days.size
  }, [logsByDate, mealsByDate, checkinsByDate])

  const weekReady = distinctDaysLogged >= 7

  const weekStats = useMemo(() => {
    const today = new Date()
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
    // computed off one stray logged day.
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

    // "Best day" prioritizes real training volume; falls back to calories
    // logged on weeks with no workouts at all.
    let bestDay = null
    weekKeys.forEach((key, i) => {
      const vol = volumeFor(key)
      const cals = dailyCalories[i]
      if (vol <= 0 && cals <= 0) return
      const score = vol > 0 ? vol + 1e7 : cals
      if (!bestDay || score > bestDay.score) bestDay = { key, score, vol, cals }
    })

    const workoutsThisWeek = weekKeys.filter((k) => (logsByDate[k] || []).length > 0).length
    const streak = computeStreak(today, logsByDate, mealsByDate, checkinsByDate)

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
      streak,
    }
  }, [logsByDate, mealsByDate, checkinsByDate])

  const hasAnyWeekData = weekStats.dailyCalories.some((v) => v > 0) || weekStats.workoutsThisWeek > 0

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

  // One PDF covering the whole tab, not just whichever card happened to have
  // an export button - fills in any of the three AI sections that haven't
  // been generated yet on this visit (best-effort per section; one section
  // failing to fetch doesn't block the rest of the report), then builds from
  // whatever's available. Training volume/calories/fatigue are always
  // already loaded (no Generate step for those), so they're included as-is.
  async function handleExportFullReport() {
    setExportingReport(true)
    try {
      const [recapText, digestData, nutritionData] = await Promise.all([
        recap ? Promise.resolve(recap) : api.getWeeklyRecap(userId).then((d) => d.recap).catch(() => recap),
        digest ? Promise.resolve(digest) : api.getWeeklyDigest(userId).catch(() => digest),
        nutritionReview ? Promise.resolve(nutritionReview) : api.getWeeklyNutritionReview(userId).catch(() => nutritionReview),
      ])
      if (recapText && recapText !== recap) setRecap(recapText)
      if (digestData && digestData !== digest) setDigest(digestData)
      if (nutritionData && nutritionData !== nutritionReview) setNutritionReview(nutritionData)
      buildFullAnalyticsReport({ recap: recapText, digest: digestData, nutritionReview: nutritionData, progress, fatigue })
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
    <div className="max-w-7xl mx-auto px-6 py-8 font-body space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Performance intelligence</p>
          <h1 className="font-heading font-bold text-3xl mt-0.5">Progress</h1>
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

      {activeTab === 'insights' && (
        <div className="space-y-4">
          <div className="card py-3 px-4">
            <div className="flex justify-between items-center mb-2 gap-2">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 shrink-0">
                  <CoachAIIndicator />
                </div>
                <h2 className="font-heading font-semibold text-sm">Weekly AI Recap</h2>
              </div>
              <button
                onClick={loadRecap}
                disabled={recapLoading || !weekReady}
                className="px-3 py-1.5 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold shrink-0"
              >
                {recapLoading ? 'Generating…' : recap ? 'Regenerate' : 'Generate'}
              </button>
            </div>
            {recapError && <p className="text-sm text-red-400 mb-2">{recapError}</p>}

            {hasAnyWeekData ? (
              <div className="space-y-4">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <h3 className="text-xs uppercase tracking-wide text-slate-500">Calories logged</h3>
                      <p className="font-heading font-bold text-2xl leading-none mt-1">
                        {weekStats.avgCalories != null ? weekStats.avgCalories.toLocaleString() : '—'}
                        {weekStats.avgCalories != null && (
                          <span className="text-sm text-slate-400 font-normal ml-1">kcal avg</span>
                        )}
                      </p>
                    </div>
                    <TrendBadge pct={weekStats.trendPct} />
                  </div>
                  <div className="h-40 mt-3">
                    <Bar
                      data={buildCaloriesBarData(weekStats.weekKeys, weekStats.dailyCalories, weekStats.peakIndex)}
                      options={caloriesBarOptions}
                      plugins={[buildPeakLabelPlugin(weekStats.peakIndex)]}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-2.5 flex items-center justify-center">
                    <ProgressRing value={weekStats.streak} label="Day streak" color={CORAL} />
                  </div>
                  <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-2.5 flex flex-col justify-center">
                    <MacroBar
                      label="Workouts this week"
                      value={weekStats.workoutsThisWeek}
                      target={weekProfile?.target_frequency}
                      unit=""
                      color="bg-coral-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-2.5">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                      <FlameIcon className="w-3 h-3 text-coral-400 shrink-0" />
                      <span>Avg. calories</span>
                    </div>
                    <p className="text-lg font-bold tabular-nums">
                      {weekStats.avgCalories != null ? weekStats.avgCalories.toLocaleString() : '—'}
                      {weekStats.avgCalories != null && (
                        <span className="text-xs font-normal text-slate-400 ml-1">kcal/day</span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">Days with a logged meal, this week</p>
                  </div>

                  <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-2.5">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                      <span>Macro balance</span>
                    </div>
                    {weekStats.hasMacroData ? (
                      <div className="flex items-center gap-2 mt-1">
                        <div className="w-11 h-11 shrink-0">
                          <Doughnut
                            data={{
                              labels: ['Protein', 'Carbs', 'Fat'],
                              datasets: [
                                {
                                  data: [
                                    weekStats.macroTotals.protein,
                                    weekStats.macroTotals.carbs,
                                    weekStats.macroTotals.fat,
                                  ],
                                  backgroundColor: [
                                    SPARKLINE_COLORS.protein.line,
                                    SPARKLINE_COLORS.carbs.line,
                                    SPARKLINE_COLORS.fat.line,
                                  ],
                                  borderColor: '#0c0c0e',
                                  borderWidth: 2,
                                },
                              ],
                            }}
                            options={macroDonutOptions}
                          />
                        </div>
                        <div className="space-y-0.5 text-[10px] text-slate-400">
                          <span className="flex items-center gap-1">
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: SPARKLINE_COLORS.protein.line }}
                            />
                            P {Math.round(weekStats.macroTotals.protein)}g
                          </span>
                          <span className="flex items-center gap-1">
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: SPARKLINE_COLORS.carbs.line }}
                            />
                            C {Math.round(weekStats.macroTotals.carbs)}g
                          </span>
                          <span className="flex items-center gap-1">
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: SPARKLINE_COLORS.fat.line }}
                            />
                            F {Math.round(weekStats.macroTotals.fat)}g
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 mt-1">No meals logged this week.</p>
                    )}
                  </div>

                  <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-2.5">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                      <TrophyIcon className="w-3 h-3 text-coral-400 shrink-0" />
                      <span>Best day</span>
                    </div>
                    <p className="text-lg font-bold">
                      {weekStats.bestDay
                        ? WEEKDAY_LONG_FMT.format(new Date(`${weekStats.bestDay.key}T00:00:00`))
                        : '—'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {weekStats.bestDay
                        ? weekStats.bestDay.vol > 0
                          ? `${weekStats.bestDay.vol.toLocaleString()} lbs volume`
                          : `${weekStats.bestDay.cals.toLocaleString()} kcal logged`
                        : 'Nothing logged this week yet'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                No activity logged in the last 7 days yet - once you log workouts, meals, or check in,
                your weekly dashboard shows up here.
              </p>
            )}

            {!weekReady && (
              <p className="text-xs text-slate-500 mt-3">
                {distinctDaysLogged}/7 days logged - once a full week of activity is in, an AI snapshot
                unlocks here.
              </p>
            )}
            {recapLoading && (
              <p className="text-sm text-slate-500 flex items-center gap-2 mt-3">
                <span className="w-3.5 h-3.5 border-2 border-forest-700 border-t-coral-500 rounded-full motion-safe:animate-spin" />
                Generating…
              </p>
            )}
            {recap && !recapLoading && (
              <div className="rounded-lg border border-coral-500/40 bg-coral-500/10 p-2.5 mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-coral-400 mb-1">Snapshot</p>
                <p className="text-sm text-slate-100">{recap}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <div className="card py-3 px-4">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 shrink-0">
                  <CoachAIIndicator />
                </div>
                <h2 className="font-heading font-semibold text-sm">Weekly AI Insights</h2>
              </div>
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
                <span className="w-3.5 h-3.5 border-2 border-forest-700 border-t-coral-500 rounded-full motion-safe:animate-spin" />
                Synthesizing…
              </p>
            ) : digest ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Win</p>
                  <p className="text-sm font-semibold text-slate-100">{digest.biggest_win}</p>
                </div>
                <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Recovery</p>
                  <p className="text-sm font-semibold text-slate-100">{digest.recovery_note}</p>
                </div>
                <div className="rounded-lg border border-coral-500/40 bg-coral-500/10 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-coral-400 mb-1">Focus</p>
                  <p className="text-sm font-semibold text-slate-100">{digest.next_week_focus}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Workouts, readiness, and meals from the last 7 days into three bullets.
              </p>
            )}
          </div>

          <div className="card py-3 px-4">
            <div className="flex justify-between items-center mb-2 gap-2">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 shrink-0">
                  <CoachAIIndicator />
                </div>
                <h2 className="font-heading font-semibold text-sm">Weekly Nutrition Audit</h2>
              </div>
              <div className="flex gap-2 shrink-0">
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
                <span className="w-3.5 h-3.5 border-2 border-forest-700 border-t-coral-500 rounded-full motion-safe:animate-spin" />
                Auditing…
              </p>
            ) : nutritionReview ? (
              <div className="space-y-3">
                {nutritionReview.avg_calories != null ? (
                  <div className="grid grid-cols-2 gap-2">
                    <MacroTile
                      label="Calories"
                      value={nutritionReview.avg_calories}
                      unit=" kcal"
                      badge={calorieBadge(nutritionReview.avg_calories, nutritionReview.calorie_target)}
                      dailyData={nutritionReview.daily_calories}
                      colors={SPARKLINE_COLORS.calories}
                    />
                    <MacroTile
                      label="Protein"
                      value={nutritionReview.avg_protein}
                      unit="g"
                      badge={macroTargetBadge(nutritionReview.avg_protein, nutritionReview.protein_target)}
                      dailyData={nutritionReview.daily_protein}
                      colors={SPARKLINE_COLORS.protein}
                    />
                    <MacroTile
                      label="Carbs"
                      value={nutritionReview.avg_carbs}
                      unit="g"
                      badge={macroTargetBadge(nutritionReview.avg_carbs, nutritionReview.carbs_target)}
                      dailyData={nutritionReview.daily_carbs}
                      colors={SPARKLINE_COLORS.carbs}
                    />
                    <MacroTile
                      label="Fat"
                      value={nutritionReview.avg_fat}
                      unit="g"
                      badge={macroTargetBadge(nutritionReview.avg_fat, nutritionReview.fat_target)}
                      dailyData={nutritionReview.daily_fat}
                      colors={SPARKLINE_COLORS.fat}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-slate-200">{nutritionReview.macro_status}</p>
                )}

                <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Pattern</p>
                  <p className="text-sm text-slate-200">{nutritionReview.key_pattern}</p>
                  {nutritionReview.days_logged != null && (
                    <p className="text-xs text-slate-500 mt-1">Logged {nutritionReview.days_logged} of 7 days</p>
                  )}
                </div>

                <div className="rounded-lg border border-coral-500/40 bg-coral-500/10 p-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-coral-400 mb-1">Recommendation</p>
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
        </div>
      )}

      {activeTab === 'performance' && (
        <div className="space-y-4">
          {/* Training Volume is the primary trend on this tab - full width,
              taller, with its own hero stat - rather than one of three
              equal-weight chart cards in a uniform grid. */}
          <div className="card py-4 px-5">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
              <div>
                <h2 className="font-heading font-semibold">Training Volume</h2>
                <p className="text-xs text-slate-500 mt-0.5">Total sets × reps × weight, per day.</p>
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
              <p className="text-sm text-slate-500 mt-3">
                No workouts logged yet - once you log a few sessions, your volume trend shows up here.
              </p>
            )}
          </div>

          {/* Supporting charts - same data/behavior, deliberately smaller and
              quieter than the primary trend above. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                            <td className="py-1 tabular-nums">
                              ~{Math.round(p.total_calories).toLocaleString()} kcal
                            </td>
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
                            <td className="py-1">
                              {p.is_pr && <TrophyIcon className="w-3.5 h-3.5 text-coral-400" />}
                            </td>
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
