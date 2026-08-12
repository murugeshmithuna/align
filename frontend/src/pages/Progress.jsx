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
import ProgressRing from '../components/ProgressRing.jsx'
import { useSession } from '../context/SessionContext.jsx'
import { classifyMuscleGroup, MUSCLE_ZONE_LABELS } from '../utils/muscleZones.js'

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

// Single-series charts - one hue throughout, no legend needed. CORAL (the
// brand accent) is reserved for Training Volume specifically - the one
// genuinely primary trend on this tab (full-width, hero stat, per its own
// section comment below). The two supporting charts (Calories Burned,
// Exercise Progression) get their own vibrant hues - amber for Calories
// Burned (matches the "logged activity" amber used in the Recap bar chart),
// sky blue for Exercise Progression (matches the sky accent already used
// for carbs/negative-trend text elsewhere in this file) - each color still
// only ever means one specific series, never a default line color.
const CORAL = '#c7f000'
const AMBER = '#f97316'
const SKY = '#38bdf8'
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

const WEEKDAY_SHORT_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'short' })

// Bars colored by whether that day's logged calories fell within tolerance
// of the weekly target - visualizes "adherence" directly rather than just
// raw magnitude. Muted gray when there's no target to compare against yet.
// Active/logged days render in amber - the peak day of the week (the
// single highest bar) gets the brand lime accent as the "hero" highlight,
// exactly like the peak-day treatment already used elsewhere in this app's
// charts. Both colors encode real information (logged vs. not, peak vs.
// not) rather than being decorative.
const RECAP_ACTIVE_COLOR = AMBER
const RECAP_ACTIVE_HOVER = '#fb923c'

function buildRecapChartData(weekKeys, dailyCalories) {
  const peakValue = Math.max(0, ...dailyCalories)
  return {
    labels: weekKeys.map((k) => WEEKDAY_SHORT_FMT.format(new Date(`${k}T00:00:00`))),
    datasets: [
      {
        data: dailyCalories,
        backgroundColor: dailyCalories.map((v) => {
          if (!v) return 'rgba(107, 140, 174, 0.25)'
          return v === peakValue ? CORAL : RECAP_ACTIVE_COLOR
        }),
        hoverBackgroundColor: dailyCalories.map((v) => {
          if (!v) return 'rgba(107, 140, 174, 0.4)'
          return v === peakValue ? CORAL : RECAP_ACTIVE_HOVER
        }),
        borderRadius: { topLeft: 6, topRight: 6, bottomLeft: 0, bottomRight: 0 },
        borderSkipped: false,
        maxBarThickness: 28,
      },
    ],
  }
}

const recapChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { top: 6 } },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#111a2b',
      borderColor: 'rgba(107, 140, 174, 0.35)',
      borderWidth: 1,
      titleColor: '#e2e8f0',
      bodyColor: '#e2e8f0',
      padding: 8,
      displayColors: false,
      callbacks: { label: (ctx) => `${ctx.parsed.y.toLocaleString()} kcal` },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { color: TEXT_MUTED, font: { size: 10 } } },
    y: { display: false, beginAtZero: true },
  },
}

// Draws a dashed reference line at the calorie target's pixel position - a
// tiny inline plugin instead of pulling in a full annotation plugin
// dependency for one line.
function buildTargetLinePlugin(target) {
  return {
    id: 'targetLine',
    afterDraw(chart) {
      if (!target) return
      const { ctx, chartArea, scales } = chart
      const y = scales.y.getPixelForValue(target)
      if (y < chartArea.top || y > chartArea.bottom) return
      ctx.save()
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)'
      ctx.setLineDash([4, 4])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(chartArea.left, y)
      ctx.lineTo(chartArea.right, y)
      ctx.stroke()
      ctx.restore()
    },
  }
}

// Daily training volume for the week, single-hue - the "workout volume
// visual" alongside Insights' number tiles.
function buildInsightsVolumeChartData(weekKeys, logsByDate) {
  return {
    labels: weekKeys.map((k) => WEEKDAY_SHORT_FMT.format(new Date(`${k}T00:00:00`))),
    datasets: [
      {
        data: weekKeys.map((k) => (logsByDate[k] || []).reduce((s, l) => s + logVolume(l), 0)),
        backgroundColor: CORAL,
        hoverBackgroundColor: '#d6f23d',
        borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
        borderSkipped: false,
        maxBarThickness: 20,
      },
    ],
  }
}

const miniBarChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#111a2b',
      borderColor: 'rgba(107, 140, 174, 0.35)',
      borderWidth: 1,
      titleColor: '#e2e8f0',
      bodyColor: '#e2e8f0',
      padding: 8,
      displayColors: false,
      callbacks: { label: (ctx) => `${Math.round(ctx.parsed.y).toLocaleString()} lbs` },
    },
  },
  scales: {
    x: { display: false },
    y: { display: false, beginAtZero: true },
  },
}


const macroDonutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '68%',
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#111a2b',
      borderColor: 'rgba(107, 140, 174, 0.35)',
      borderWidth: 1,
      titleColor: '#e2e8f0',
      bodyColor: '#e2e8f0',
      padding: 8,
      callbacks: { label: (ctx) => `${ctx.label}: ${Math.round(ctx.parsed)}g` },
    },
  },
}

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
// walking backward from today - a consistency metric, same domain as
// "active days" above, not diet- or training-specific. If today itself has
// nothing logged yet, that alone doesn't zero out an otherwise-real streak -
// counting starts from yesterday in that case, same as any habit tracker.
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

// Deterministic, real-data-only stats for three strictly-separated domains
// (Weekly AI Recap = compliance/consistency, Weekly AI Insights = training,
// Weekly Nutrition Audit = diet) - computed here instead of asking three
// independent LLM calls to each stay in their lane, since free-generated
// prose has no hard guarantee against repeating another card's numbers.
// Each function below only ever touches the fields its own domain owns.

function gradeForPct(pct) {
  if (pct >= 90) return 'A'
  if (pct >= 75) return 'B'
  if (pct >= 60) return 'C'
  if (pct >= 40) return 'D'
  return 'F'
}

// RECAP DOMAIN: active days + calorie-target adherence only - no macro
// breakdown, no exercise/set detail (that's Insights' and the Nutrition
// Audit's territory respectively).
function computeRecapStats(weekKeys, logsByDate, mealsByDate, checkinsByDate, calorieTarget) {
  const activeDays = weekKeys.filter((k) => hasActivityOnDay(k, logsByDate, mealsByDate, checkinsByDate)).length
  let adherenceDays = 0
  let daysWithMealsAndTarget = 0
  if (calorieTarget) {
    for (const k of weekKeys) {
      const meals = mealsByDate[k] || []
      if (!meals.length) continue
      daysWithMealsAndTarget += 1
      const total = meals.reduce((s, m) => s + (m.estimated_calories || 0), 0)
      if (Math.abs(total - calorieTarget) / calorieTarget <= 0.15) adherenceDays += 1
    }
  }
  const adherencePct = daysWithMealsAndTarget > 0 ? Math.round((adherenceDays / daysWithMealsAndTarget) * 100) : null
  const consistencyPct = Math.round((activeDays / weekKeys.length) * 100)
  // The grade reflects ACTIVITY consistency alone - literally "how
  // consistent were you" - rather than a 50/50 blend with calorie
  // adherence. Blending them let an unrelated, strict diet metric (a
  // narrow +/-15% tolerance) drag a fully-active week down to a failing
  // grade; adherence is still shown, just as its own honest, separate
  // stat instead of silently halving the grade.
  const streak = computeStreak(new Date(), logsByDate, mealsByDate, checkinsByDate)
  return { activeDays, totalDays: weekKeys.length, adherencePct, consistencyPct, streak, grade: gradeForPct(consistencyPct) }
}

// PERFORMANCE DOMAIN: volume/sets/muscle split/progression only - no
// calories, no protein grams, no meal intake (that's the Recap's and
// Nutrition Audit's territory respectively).
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

function computeInsightsStats(weekKeys, prevWeekKeys, logsByDate) {
  const sumFor = (keys) =>
    keys.reduce(
      (acc, k) => {
        for (const log of logsByDate[k] || []) {
          acc.volume += logVolume(log)
          acc.sets += log.sets || 0
        }
        return acc
      },
      { volume: 0, sets: 0 },
    )
  const current = sumFor(weekKeys)
  const previous = sumFor(prevWeekKeys)
  const volumeChangePct =
    previous.volume > 0 ? Math.round(((current.volume - previous.volume) / previous.volume) * 100) : null
  const allLogsThisWeek = weekKeys.flatMap((k) => logsByDate[k] || [])
  return {
    volume: current.volume,
    sets: current.sets,
    volumeChangePct,
    muscleSplit: muscleGroupBreakdown(allLogsThisWeek).slice(0, 4),
    workoutDays: weekKeys.filter((k) => (logsByDate[k] || []).length > 0).length,
  }
}

// DIET DOMAIN: protein-target hit rate + fat/carb split - the two precise
// stats the spec calls for that the existing AI nutrition review doesn't
// return as structured fields. No set totals, no workout stats.
function computeDietStats(weekKeys, mealsByDate, proteinTarget) {
  let proteinHitDays = 0
  let daysWithMealsAndProteinTarget = 0
  let totalFatG = 0
  let totalCarbsG = 0
  let totalProteinG = 0
  let daysWithMeals = 0
  for (const k of weekKeys) {
    const meals = mealsByDate[k] || []
    if (!meals.length) continue
    daysWithMeals += 1
    const dayProtein = meals.reduce((s, m) => s + (m.protein_g || 0), 0)
    totalProteinG += dayProtein
    totalFatG += meals.reduce((s, m) => s + (m.fat_g || 0), 0)
    totalCarbsG += meals.reduce((s, m) => s + (m.carbs_g || 0), 0)
    if (proteinTarget) {
      daysWithMealsAndProteinTarget += 1
      if (dayProtein >= proteinTarget * 0.9) proteinHitDays += 1
    }
  }
  const fatCalories = totalFatG * 9
  const carbCalories = totalCarbsG * 4
  const totalMacroCalories = fatCalories + carbCalories
  const fatPct = totalMacroCalories > 0 ? Math.round((fatCalories / totalMacroCalories) * 100) : null
  const carbPct = totalMacroCalories > 0 ? 100 - fatPct : null
  return {
    proteinHitDays,
    proteinEligibleDays: daysWithMealsAndProteinTarget,
    fatPct,
    carbPct,
    daysWithMeals,
    totalProteinG,
    totalCarbsG,
    totalFatG,
    hasMacroData: totalProteinG + totalCarbsG + totalFatG > 0,
  }
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

function buildFullAnalyticsReport({ recapStats, insightsStats, dietStats, nutritionReview, progress, fatigue }) {
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

  // Weekly Recap - compliance/consistency only (see computeRecapStats)
  sectionTitle('Weekly Recap')
  statLine('Active days', `${recapStats.activeDays}/${recapStats.totalDays}`)
  statLine('Calorie target adherence', recapStats.adherencePct != null ? `${recapStats.adherencePct}%` : 'No calorie target set')
  statLine('Consistency rating', `Grade ${recapStats.grade} - ${recapStats.consistencyPct}% On Track`)
  sectionRule()

  // Weekly Insights - training/strength only (see computeInsightsStats)
  sectionTitle('Weekly Insights')
  statLine('Volume lifted', `${Math.round(insightsStats.volume).toLocaleString()} lbs`)
  statLine('Sets completed', insightsStats.sets)
  statLine(
    'Volume vs last week',
    insightsStats.volumeChangePct != null ? `${insightsStats.volumeChangePct > 0 ? '+' : ''}${insightsStats.volumeChangePct}%` : 'No prior week to compare',
  )
  if (insightsStats.muscleSplit.length > 0) {
    statLine('Muscle split', insightsStats.muscleSplit.map((m) => `${m.label} ${m.pct}%`).join(', '))
  }
  sectionRule()

  // Weekly Nutrition Audit - diet only (see computeDietStats + the real AI nutritionReview)
  sectionTitle('Weekly Nutrition Audit')
  statLine(
    'Protein target hit rate',
    dietStats.proteinEligibleDays > 0 ? `${dietStats.proteinHitDays}/${dietStats.proteinEligibleDays} days` : 'No protein target set',
  )
  statLine('Fat vs carb split', dietStats.fatPct != null ? `${dietStats.fatPct}% fat / ${dietStats.carbPct}% carbs` : 'No macros logged')
  if (nutritionReview) {
    const macroRows = [
      ['Calories', nutritionReview.avg_calories, nutritionReview.calorie_target, ' kcal'],
      ['Protein', nutritionReview.avg_protein, nutritionReview.protein_target, 'g'],
      ['Carbs', nutritionReview.avg_carbs, nutritionReview.carbs_target, 'g'],
      ['Fat', nutritionReview.avg_fat, nutritionReview.fat_target, 'g'],
    ].filter(([, value]) => value != null)
    if (macroRows.length > 0) {
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
        borderColor: AMBER,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: AMBER,
        pointHoverBorderColor: '#0b1220',
        pointHoverBorderWidth: 2,
        tension: 0.25,
        fill: true,
        backgroundColor: (ctx) => {
          const { chart } = ctx
          const { ctx: canvasCtx, chartArea } = chart
          if (!chartArea) return 'rgba(249, 115, 22, 0.14)'
          const gradient = canvasCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
          gradient.addColorStop(0, 'rgba(249, 115, 22, 0.3)')
          gradient.addColorStop(1, 'rgba(249, 115, 22, 0.02)')
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
        borderColor: SKY,
        borderWidth: 2,
        tension: 0.15,
        fill: true,
        backgroundColor: (ctx) => {
          const { chart } = ctx
          const { ctx: canvasCtx, chartArea } = chart
          if (!chartArea) return 'rgba(56, 189, 248, 0.1)'
          const gradient = canvasCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
          gradient.addColorStop(0, 'rgba(56, 189, 248, 0.22)')
          gradient.addColorStop(1, 'rgba(56, 189, 248, 0.02)')
          return gradient
        },
        // PRs get a bigger marker in the brand lime accent with a surface
        // ring - a real PR is the single most exciting data point on this
        // chart, so it earns the hero color; everything else stays a small
        // sky-blue dot so the line, not a field of dots, carries the trend.
        pointRadius: history.map((p) => (p.is_pr ? 7 : 2)),
        pointHoverRadius: history.map((p) => (p.is_pr ? 9 : 6)),
        pointBackgroundColor: history.map((p) => (p.is_pr ? CORAL : SKY)),
        pointBorderColor: '#0b1220',
        pointBorderWidth: history.map((p) => (p.is_pr ? 2 : 1)),
      },
    ],
  }
}

// Supporting chart for the Performance Overview - distinct active workout
// DAYS per Sunday-start calendar week (not raw log-row counts, so a single
// session that logged five exercises still only counts as one active day).
// Sourced from logsByDate (already keyed 'YYYY-MM-DD' -> that day's logs).
function buildWorkoutFrequencyData(logsByDate) {
  const activeDayKeys = Object.keys(logsByDate)
    .filter((k) => (logsByDate[k] || []).length > 0)
    .sort()
  if (activeDayKeys.length === 0) return { labels: [], datasets: [{ data: [] }] }
  const weekStartKey = (dayKey) => {
    const d = new Date(`${dayKey}T00:00:00`)
    d.setDate(d.getDate() - d.getDay())
    return dateKeyFromLocalDate(d)
  }
  const counts = {}
  for (const dayKey of activeDayKeys) {
    const wk = weekStartKey(dayKey)
    counts[wk] = (counts[wk] || 0) + 1
  }
  const weeks = Object.keys(counts).sort()
  return {
    labels: weeks,
    datasets: [
      {
        label: 'Active days',
        data: weeks.map((w) => counts[w]),
        backgroundColor: CORAL,
        hoverBackgroundColor: '#d6f23d',
        borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
        borderSkipped: false,
        maxBarThickness: 28,
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
      backgroundColor: '#111a2b',
      borderColor: 'rgba(107, 140, 174, 0.35)',
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

// Workout Frequency's y-axis is a small whole-number day count (0-7) - with
// only 1-2 weeks of history, Chart.js's default autoscale can pick a max of
// 1 and label the axis in 0.2 decimal steps, which reads as broken for a
// literal day-count. `precision: 0` + a forced integer stepSize keeps it to
// whole numbers regardless of how little history exists yet.
const workoutFrequencyChartOptions = {
  ...baseChartOptions,
  scales: {
    ...baseChartOptions.scales,
    y: {
      ...baseChartOptions.scales.y,
      ticks: { ...baseChartOptions.scales.y.ticks, precision: 0, stepSize: 1 },
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

  // Shared 7-day window the three domain-scoped stats below all key off of -
  // kept minimal since each card's own compute* helper (further down) now
  // owns its own domain's actual numbers.
  const weekStats = useMemo(() => {
    const weekKeys = lastNDayKeys(7, new Date())
    const dailyCalories = weekKeys.map((k) => (mealsByDate[k] || []).reduce((s, m) => s + (m.estimated_calories || 0), 0))
    const workoutsThisWeek = weekKeys.filter((k) => (logsByDate[k] || []).length > 0).length
    return { weekKeys, dailyCalories, workoutsThisWeek }
  }, [logsByDate, mealsByDate])

  const hasAnyWeekData = weekStats.dailyCalories.some((v) => v > 0) || weekStats.workoutsThisWeek > 0

  const selectedExercise = useMemo(
    () => progress?.exercises.find((e) => e.exercise_id === selectedExerciseId),
    [progress, selectedExerciseId],
  )

  // Bodyweight exercises (or a brand-new entry with only reps logged so
  // far) legitimately have no `weight` value at all - a real, valid state,
  // not missing data. Rendering the weight-over-time chart against an
  // all-null/zero series produces a degenerate 0-1 Chart.js axis, so this
  // gates on there being at least one real weighted data point instead.
  const selectedExerciseHasWeight = selectedExercise?.history.some((p) => p.weight > 0) ?? false

  // Weekly AI Recap, Weekly AI Insights, and the Nutrition Audit's two
  // precision stats are computed here instead of via separate LLM calls -
  // each reads only the fields its own domain owns (see the three compute*
  // helpers above), which is what actually guarantees zero overlap between
  // the three cards rather than just asking three prompts nicely.
  const recapStats = useMemo(
    () => computeRecapStats(weekStats.weekKeys, logsByDate, mealsByDate, checkinsByDate, weekProfile?.daily_calorie_target),
    [weekStats.weekKeys, logsByDate, mealsByDate, checkinsByDate, weekProfile],
  )

  const insightsStats = useMemo(() => {
    const prevWeekEnd = new Date()
    prevWeekEnd.setDate(prevWeekEnd.getDate() - 7)
    const prevWeekKeys = lastNDayKeys(7, prevWeekEnd)
    return computeInsightsStats(weekStats.weekKeys, prevWeekKeys, logsByDate)
  }, [weekStats.weekKeys, logsByDate])

  const dietStats = useMemo(
    () => computeDietStats(weekStats.weekKeys, mealsByDate, weekProfile?.daily_protein_target),
    [weekStats.weekKeys, mealsByDate, weekProfile],
  )

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

  // One PDF covering the whole tab. Recap/Insights are always already
  // computed client-side (no Generate step, no fetch needed); only the
  // Nutrition Audit still involves a real AI call, so that's the one
  // section fetched here if it hasn't been generated yet this visit.
  async function handleExportFullReport() {
    setExportingReport(true)
    try {
      const nutritionData = nutritionReview || (await api.getWeeklyNutritionReview(userId).catch(() => nutritionReview))
      if (nutritionData && nutritionData !== nutritionReview) setNutritionReview(nutritionData)
      buildFullAnalyticsReport({ recapStats, insightsStats, dietStats, nutritionReview: nutritionData, progress, fatigue })
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

  // Require at least one genuinely non-zero data point, not just a non-empty
  // array - a brand-new account's first logged set (or a bodyweight
  // exercise with no external weight) can produce a real row whose value is
  // 0/null. Rendering a line chart against all-zero data doesn't fail, but
  // Chart.js's default beginAtZero autoscale picks a degenerate 0-1 axis
  // for it (decimal gridlines, no visible line) - worse than the honest
  // "not enough data yet" empty state this app uses everywhere else.
  const hasVolume = progress.volume_by_date.some((p) => p.total_volume > 0)
  const hasCalories = (progress.calories_by_date || []).some((p) => p.total_calories > 0)
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
              <h2 className="font-heading font-semibold text-sm">Weekly AI Recap</h2>
            </div>
            {/* RECAP DOMAIN: high-level compliance/consistency only - active
                days, calorie-target adherence, and an overall grade. No
                exercise detail, no per-macro breakdown (that's Insights' and
                the Nutrition Audit's territory - see computeRecapStats). The
                bar chart visualizes real daily activity - amber for a
                logged day, lime for the week's peak day - it isn't a second,
                different metric. */}
            {hasAnyWeekData ? (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  <ProgressRing value={recapStats.streak} label="Day streak" color={CORAL} />
                  <div className="h-32 flex-1 w-full">
                    <Bar
                      data={buildRecapChartData(weekStats.weekKeys, weekStats.dailyCalories)}
                      options={recapChartOptions}
                      plugins={[buildTargetLinePlugin(weekProfile?.daily_calorie_target)]}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-forest-950/40 border border-forest-700 text-slate-300">
                    Active days: {recapStats.activeDays}/{recapStats.totalDays}
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-forest-950/40 border border-forest-700 text-slate-300">
                    Calorie adherence: {recapStats.adherencePct != null ? `${recapStats.adherencePct}%` : 'No target set'}
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-coral-500/10 border border-coral-500/40 text-coral-400">
                    Grade {recapStats.grade} - {recapStats.consistencyPct}% On Track
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                No activity logged in the last 7 days yet - once you log workouts, meals, or check in,
                your weekly recap shows up here.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <div className="card py-3 px-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-heading font-semibold text-sm">Weekly AI Insights</h2>
            </div>
            {/* PERFORMANCE DOMAIN: training/strength/fatigue only - volume,
                sets, muscle split, week-over-week progression. No calorie
                numbers, no protein grams, no meal intake (see
                computeInsightsStats). */}
            {insightsStats.workoutDays > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div
                      className={`rounded-lg border p-2.5 ${
                        insightsStats.volumeChangePct != null && insightsStats.volumeChangePct >= 0
                          ? 'border-emerald-500/40 bg-emerald-500/5'
                          : 'border-forest-700 bg-forest-950/40'
                      }`}
                    >
                      <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Volume lifted</p>
                      <p className="text-lg font-bold tabular-nums">
                        {Math.round(insightsStats.volume).toLocaleString()}
                        <span className="text-xs font-normal text-slate-400 ml-1">lbs</span>
                      </p>
                      {insightsStats.volumeChangePct != null ? (
                        <p
                          className={`text-[11px] font-semibold mt-1 ${
                            insightsStats.volumeChangePct >= 0 ? 'text-emerald-400' : 'text-sky-400'
                          }`}
                        >
                          {insightsStats.volumeChangePct >= 0 ? '↑' : '↓'} {Math.abs(insightsStats.volumeChangePct)}% vs last week
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-500 mt-1">No prior week to compare</p>
                      )}
                    </div>
                    <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-2.5">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Sets completed</p>
                      <p className="text-lg font-bold tabular-nums">{insightsStats.sets}</p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {insightsStats.workoutDays} workout day{insightsStats.workoutDays === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Daily volume</p>
                    <div className="h-20">
                      <Bar data={buildInsightsVolumeChartData(weekStats.weekKeys, logsByDate)} options={miniBarChartOptions} />
                    </div>
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
              <p className="text-sm text-slate-500">
                No workouts logged in the last 7 days - once you log a session, your training breakdown
                shows up here.
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
            {/* DIET DOMAIN: macro balance/micronutrient precision only - the
                two exact stats the domain spec calls for (protein hit rate,
                fat vs. carb split), computed directly from logged meals so
                they're always available, independent of the Generate button
                below. No workout stats, no set totals (see
                computeDietStats). */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-2.5 flex items-center gap-2">
                <ProgressRing
                  value={dietStats.proteinHitDays}
                  target={dietStats.proteinEligibleDays || undefined}
                  label=""
                  color="#10b981"
                />
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Protein target hit rate</p>
                  <p className="text-lg font-bold tabular-nums">
                    {dietStats.proteinEligibleDays > 0 ? `${dietStats.proteinHitDays}/${dietStats.proteinEligibleDays}` : '—'}
                    <span className="text-xs font-normal text-slate-400 ml-1">days</span>
                  </p>
                  {dietStats.proteinEligibleDays === 0 && (
                    <p className="text-[11px] text-slate-500 mt-1">Set a protein target to track this</p>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-2.5 flex items-center gap-2">
                {dietStats.hasMacroData ? (
                  <div className="w-11 h-11 shrink-0">
                    <Doughnut
                      data={{
                        labels: ['Protein', 'Carbs', 'Fat'],
                        datasets: [
                          {
                            data: [dietStats.totalProteinG, dietStats.totalCarbsG, dietStats.totalFatG],
                            backgroundColor: [SPARKLINE_COLORS.protein.line, SPARKLINE_COLORS.carbs.line, SPARKLINE_COLORS.fat.line],
                            borderColor: '#0b1220',
                            borderWidth: 2,
                          },
                        ],
                      }}
                      options={macroDonutOptions}
                    />
                  </div>
                ) : (
                  <div className="w-11 h-11 shrink-0 rounded-full border-2 border-dashed border-forest-700" />
                )}
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Fat vs. carb split</p>
                  <p className="text-lg font-bold tabular-nums">
                    {dietStats.fatPct != null ? `${dietStats.fatPct}% / ${dietStats.carbPct}%` : '—'}
                  </p>
                  {dietStats.fatPct == null && <p className="text-[11px] text-slate-500 mt-1">No macros logged yet</p>}
                </div>
              </div>
            </div>
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
          {/* Performance Overview - compact at-a-glance tiles, same tile
              pattern as the Insights tab's Weekly AI Recap card, so this tab
              reads as part of the same dashboard instead of a set of
              oversized, mostly-empty chart panels. */}
          <div className="card py-3 px-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-heading font-semibold text-sm">Performance Overview</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div
                className={`rounded-lg border p-2.5 ${
                  insightsStats.volumeChangePct != null && insightsStats.volumeChangePct >= 0
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : 'border-forest-700 bg-forest-950/40'
                }`}
              >
                <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Training volume</p>
                <p className="text-lg font-bold tabular-nums">
                  {hasVolume
                    ? progress.volume_by_date[progress.volume_by_date.length - 1].total_volume.toLocaleString()
                    : '—'}
                  {hasVolume && <span className="text-xs font-normal text-slate-400 ml-1">lbs</span>}
                </p>
                {insightsStats.volumeChangePct != null ? (
                  <p
                    className={`text-[11px] font-semibold mt-1 ${
                      insightsStats.volumeChangePct >= 0 ? 'text-emerald-400' : 'text-sky-400'
                    }`}
                  >
                    {insightsStats.volumeChangePct >= 0 ? '↑' : '↓'} {Math.abs(insightsStats.volumeChangePct)}% vs last week
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500 mt-1">
                    {hasVolume ? 'Most recent session' : 'No workouts logged yet'}
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Calories burned</p>
                <p className="text-lg font-bold tabular-nums">
                  {hasCalories
                    ? `~${Math.round(
                        progress.calories_by_date[progress.calories_by_date.length - 1].total_calories,
                      ).toLocaleString()}`
                    : '—'}
                  {hasCalories && <span className="text-xs font-normal text-slate-400 ml-1">kcal</span>}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {hasCalories ? 'Most recent session' : 'No estimate yet'}
                </p>
              </div>
              <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Workouts</p>
                <p className="text-lg font-bold tabular-nums">
                  {weekStats.workoutsThisWeek}
                  <span className="text-sm text-slate-400 font-normal">/{weekStats.weekKeys.length}</span>
                </p>
                <p className="text-[11px] text-slate-500 mt-1">Last 7 days</p>
              </div>
              <div className="rounded-lg border border-coral-500/40 bg-coral-500/10 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-coral-400 mb-1">Consistency</p>
                <p className="text-lg font-heading font-bold tabular-nums">{recapStats.consistencyPct}%</p>
                <p className="text-[11px] text-slate-500 mt-1">Active days this week</p>
              </div>
            </div>
          </div>

          {/* Performance Trends - same compact card/chart-container language
              as every other tab, just carrying Chart.js content instead of
              tiles. Heights trimmed so a chart with real data reads as part
              of a tight dashboard rather than an oversized, empty-looking box. */}
          <div className="card py-3 px-4">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
              <div>
                <h2 className="font-heading font-semibold text-sm">Training Volume</h2>
                <p className="text-xs text-slate-500 mt-0.5">Total sets × reps × weight, per day.</p>
              </div>
              {hasVolume && (
                <div className="text-right shrink-0">
                  <p className="text-xl font-heading font-bold tabular-nums leading-none">
                    {progress.volume_by_date[progress.volume_by_date.length - 1].total_volume.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">Most recent session</p>
                </div>
              )}
            </div>
            {hasVolume ? (
              <>
                <div className="h-48 mt-2">
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
                {progress.volume_by_date.length > 0
                  ? 'Your logged sessions so far have no external weight (bodyweight-only) - volume trends show up once a weighted set is logged.'
                  : 'No workouts logged yet - once you log a few sessions, your volume trend shows up here.'}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card py-3 px-4">
              <h2 className="font-heading font-semibold text-sm mb-1">Calories Burned</h2>
              <p className="text-xs text-slate-500 mb-3">
                MET-formula estimate per day (est.), from your logged sets/reps/weight/RPE and body weight.
              </p>
              {hasCalories ? (
                <>
                  <div className="h-48">
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
                  {selectedExerciseHasWeight ? (
                    <div className="h-48">
                      <Line data={buildExerciseChartData(selectedExercise.history)} options={baseChartOptions} />
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">
                      No weight logged for this exercise yet - it may be a bodyweight movement. Set/rep
                      history is below.
                    </p>
                  )}
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

          {/* Workout Frequency - distinct active workout days per Sunday-start
              week, from logsByDate (already gathered for the Insights tab's
              stats). Small supporting chart, not a hero - kept short. */}
          <div className="card py-3 px-4">
            <h2 className="font-heading font-semibold text-sm mb-1">Workout Frequency</h2>
            <p className="text-xs text-slate-500 mb-3">Distinct active workout days per week.</p>
            {Object.values(logsByDate).some((v) => (v || []).length > 0) ? (
              <div className="h-40">
                <Bar data={buildWorkoutFrequencyData(logsByDate)} options={workoutFrequencyChartOptions} />
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                No workouts logged yet - once you log a few sessions, your weekly frequency shows up here.
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
