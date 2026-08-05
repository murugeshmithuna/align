import { useEffect, useMemo, useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { api } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip)

// Single-series charts - one hue throughout (brand coral), no legend needed.
const CORAL = '#ff7a4d'
const GRID_COLOR = 'rgba(148, 163, 184, 0.12)'
const TEXT_MUTED = '#94a3b8'

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
        pointHoverBorderColor: '#07211c',
        pointHoverBorderWidth: 2,
        tension: 0.25,
        fill: true,
        backgroundColor: (ctx) => {
          const { chart } = ctx
          const { ctx: canvasCtx, chartArea } = chart
          if (!chartArea) return 'rgba(255, 122, 77, 0.12)'
          const gradient = canvasCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
          gradient.addColorStop(0, 'rgba(255, 122, 77, 0.28)')
          gradient.addColorStop(1, 'rgba(255, 122, 77, 0.02)')
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
        pointBorderColor: '#07211c',
        pointBorderWidth: history.map((p) => (p.is_pr ? 2 : 1)),
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
      backgroundColor: '#0b2e27',
      borderColor: 'rgba(28, 110, 89, 0.6)',
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

export default function Progress() {
  const { userId } = useSession()
  const [progress, setProgress] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedExerciseId, setSelectedExerciseId] = useState(null)
  const [recap, setRecap] = useState('')
  const [recapLoading, setRecapLoading] = useState(false)
  const [recapError, setRecapError] = useState('')
  const [showVolumeTable, setShowVolumeTable] = useState(false)
  const [showExerciseTable, setShowExerciseTable] = useState(false)

  useEffect(() => {
    api
      .getProgress(userId)
      .then((data) => {
        setProgress(data)
        if (data.exercises.length > 0) setSelectedExerciseId(data.exercises[0].exercise_id)
      })
      .catch(() => setProgress({ volume_by_date: [], exercises: [] }))
      .finally(() => setLoading(false))
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

  if (loading) {
    return <p className="text-slate-400 text-sm px-6 py-12">Loading your progress…</p>
  }

  const hasVolume = progress.volume_by_date.length > 0
  const hasExercises = progress.exercises.length > 0

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 font-body space-y-6">
      <h1 className="font-heading font-bold text-2xl">Progress</h1>

      <div className="card p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-heading font-semibold">Weekly AI recap</h2>
          <button
            onClick={loadRecap}
            disabled={recapLoading}
            className="px-3 py-1.5 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-xs font-semibold"
          >
            {recapLoading ? 'Generating…' : recap ? 'Regenerate' : 'Generate'}
          </button>
        </div>
        {recapError && <p className="text-sm text-red-400">{recapError}</p>}
        {recap ? (
          <p className="text-sm text-slate-300 leading-relaxed">{recap}</p>
        ) : (
          !recapLoading && (
            <p className="text-sm text-slate-500">Generate a summary of your last 7 days.</p>
          )
        )}
      </div>

      <div className="card p-6">
        <h2 className="font-heading font-semibold mb-1">Training volume</h2>
        <p className="text-xs text-slate-500 mb-4">Total sets × reps × weight, per day.</p>
        {hasVolume ? (
          <>
            <div className="h-64">
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

      <div className="card p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-heading font-semibold">Exercise progression</h2>
          {hasExercises && (
            <select
              value={selectedExerciseId ?? ''}
              onChange={(e) => setSelectedExerciseId(Number(e.target.value))}
              className="px-2 py-1 rounded-lg bg-forest-950 border border-forest-700 text-xs"
            >
              {progress.exercises.map((ex) => (
                <option key={ex.exercise_id} value={ex.exercise_id}>
                  {ex.exercise_name}
                </option>
              ))}
            </select>
          )}
        </div>
        <p className="text-xs text-slate-500 mb-4">Weight over time - larger points mark a PR.</p>
        {hasExercises && selectedExercise ? (
          <>
            <div className="h-64">
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
  )
}
