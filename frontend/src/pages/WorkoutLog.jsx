import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { COACH_DATA_CHANGED_EVENT } from '../utils/coachEvents.js'

// Small inline icon set, matching this app's existing convention (plain SVG,
// currentColor stroke/fill, no icon library) - see AlignWordmark.jsx /
// AIMessageBar.jsx for the pattern this follows.
function PlusIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function ArrowLeftIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  )
}

function ChevronRightIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DumbbellIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="7" x2="4" y2="17" />
      <line x1="20" y1="7" x2="20" y2="17" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="7" y1="9" x2="7" y2="15" />
      <line x1="17" y1="9" x2="17" y2="15" />
    </svg>
  )
}

function LayersIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
    </svg>
  )
}

function GaugeIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 15a8 8 0 1 1 16 0" />
      <path d="M12 15l4-5" />
      <circle cx="12" cy="15" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function FlameIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.963 2.286a.75.75 0 00-1.071-.136 9.742 9.742 0 00-3.539 6.176 7.547 7.547 0 01-1.705-1.715.75.75 0 00-1.152-.082A9 9 0 1015.68 4.534a7.46 7.46 0 01-2.717-2.248zM15.75 14.25a3.75 3.75 0 11-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 011.925-3.545 3.75 3.75 0 013.255 3.717z" />
    </svg>
  )
}

// Icon-forward stat tile - small colored icon chip + tiny muted label +
// bold value, the reference screenshot's core stat-presentation pattern,
// rebuilt on this app's own forest/coral tokens.
function StatTile({ icon, label, value, tint }) {
  return (
    <div className="rounded-xl bg-forest-950/60 border border-forest-800 p-3 flex flex-col gap-1.5 min-w-0">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${tint.bg} ${tint.text}`}>
        {icon}
      </div>
      <span className="text-[10px] text-slate-500 uppercase tracking-wide truncate">{label}</span>
      <span className="text-sm font-heading font-bold tabular-nums truncate">{value}</span>
    </div>
  )
}

const TINTS = {
  setsReps: { bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  weight: { bg: 'bg-sky-500/15', text: 'text-sky-400' },
  rpe: { bg: 'bg-amber-500/15', text: 'text-amber-400' },
  calories: { bg: 'bg-coral-500/15', text: 'text-coral-400' },
}

// One recent-log entry, restyled from a plain flex-row text line into a
// card with an icon+name header and a row of icon-forward stat tiles
// (sets x reps / weight / RPE / estimated calories) - same visual language
// as the "This week" and per-exercise summary cards above it.
function LogCard({ log }) {
  const tiles = [
    {
      key: 'sr',
      icon: <LayersIcon className="w-3.5 h-3.5" />,
      label: 'Sets x Reps',
      value: `${log.sets}×${log.reps}`,
      tint: TINTS.setsReps,
    },
  ]
  if (log.weight) {
    tiles.push({
      key: 'w',
      icon: <DumbbellIcon className="w-3.5 h-3.5" />,
      label: 'Weight',
      value: log.weight,
      tint: TINTS.weight,
    })
  }
  if (log.rpe) {
    tiles.push({ key: 'rpe', icon: <GaugeIcon className="w-3.5 h-3.5" />, label: 'RPE', value: log.rpe, tint: TINTS.rpe })
  }
  if (log.estimated_calories != null) {
    tiles.push({
      key: 'cal',
      icon: <FlameIcon className="w-3.5 h-3.5" />,
      label: 'Calories',
      value: `~${Math.round(log.estimated_calories)}`,
      tint: TINTS.calories,
    })
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-coral-500/15 flex items-center justify-center text-coral-400 shrink-0">
            <DumbbellIcon className="w-4 h-4" />
          </div>
          <p className="font-heading font-semibold text-sm truncate">{log.exercise.name}</p>
        </div>
        <span className="text-[11px] text-slate-500 whitespace-nowrap">
          {new Date(log.performed_at).toLocaleDateString()}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <StatTile key={t.key} icon={t.icon} label={t.label} value={t.value} tint={t.tint} />
        ))}
      </div>
    </div>
  )
}

export default function WorkoutLog() {
  const { userId } = useSession()
  const { showToast } = useToast()

  const [exercises, setExercises] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  const [exerciseId, setExerciseId] = useState('')
  const [newExerciseName, setNewExerciseName] = useState('')
  const [showNewExercise, setShowNewExercise] = useState(false)
  const [sets, setSets] = useState(3)
  const [reps, setReps] = useState(10)
  const [weight, setWeight] = useState('')
  const [rpe, setRpe] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const loadLogs = useCallback(() => {
    api.listLogs(userId).then(setLogs).catch(() => {})
  }, [userId])

  useEffect(() => {
    Promise.all([api.listExercises(), api.listLogs(userId)])
      .then(([exerciseList, logList]) => {
        setExercises(exerciseList)
        setLogs(logList)
        if (exerciseList.length > 0) setExerciseId(String(exerciseList[0].id))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [userId])

  // The AI Coach can log/correct/delete entries from its own floating
  // drawer, mounted separately from this page - refetch the recent-logs
  // list whenever that happens so a chat-confirmed change is actually
  // visible here without a manual reload (reproduced live as a real bug).
  useEffect(() => {
    window.addEventListener(COACH_DATA_CHANGED_EVENT, loadLogs)
    return () => window.removeEventListener(COACH_DATA_CHANGED_EVENT, loadLogs)
  }, [loadLogs])

  // Purely client-side, derived from logs already in memory - no extra
  // API call, mirrors the reference's "Overall Status / This week" teaser
  // card with real numbers instead of a placeholder chart.
  const weeklyStats = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    const recent = logs.filter((log) => new Date(log.performed_at).getTime() >= cutoff)
    const setsCount = recent.reduce((sum, log) => sum + Number(log.sets || 0), 0)
    const calories = recent.reduce((sum, log) => sum + (log.estimated_calories || 0), 0)
    return { sessionCount: recent.length, setsCount, calories }
  }, [logs])

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    try {
      let targetExerciseId = exerciseId ? Number(exerciseId) : null

      if (showNewExercise && newExerciseName.trim()) {
        const created = await api.createExercise({ name: newExerciseName.trim() })
        targetExerciseId = created.id
        setExercises((prev) => [...prev, created])
      }

      if (!targetExerciseId) {
        showToast('Pick or create an exercise first', 'error')
        return
      }

      const log = await api.createLog({
        user_id: userId,
        exercise_id: targetExerciseId,
        sets: Number(sets),
        reps: Number(reps),
        weight: weight === '' ? null : Number(weight),
        rpe: rpe === '' ? null : Number(rpe),
        notes: notes || null,
      })
      setLogs((prev) => [log, ...prev])
      setNotes('')
      setShowNewExercise(false)
      setNewExerciseName('')
      showToast('Set logged.')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-slate-400 text-sm px-6 py-12">Loading…</p>
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 font-body space-y-6">
      {/* Header - muted label over a bold title, adapted from the reference's
          "Welcome back / Hi, Name!" hierarchy, with a circular icon button
          on the right in place of its notification bell (there's no
          notifications feature in this app, so this one links back to the
          dashboard instead of fabricating one). */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Manual logging</p>
          <h1 className="font-heading font-bold text-2xl mt-0.5">Log a Workout</h1>
        </div>
        <Link
          to="/dashboard"
          title="Back to dashboard"
          className="w-10 h-10 shrink-0 rounded-full bg-forest-900 border border-forest-700 flex items-center justify-center hover:border-coral-400 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4 text-slate-300" />
        </Link>
      </div>

      {/* Pill-shaped filter/nav row - adapted from the reference's
          "+ / My Goals / Schedule / Mentoring" tabs. The "+" circle doubles
          as the exercise-creation toggle further down; the other pills are
          real navigation into this app's related workout routes. */}
      <div className="flex items-center flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowNewExercise((v) => !v)}
          title="New exercise"
          className="w-9 h-9 shrink-0 rounded-full bg-forest-900 border border-forest-700 flex items-center justify-center text-coral-400 hover:border-coral-400 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
        </button>
        <span className="px-4 py-2 rounded-full bg-coral-500 text-sm font-heading font-semibold whitespace-nowrap">
          Manual Log
        </span>
        <Link
          to="/workout/live"
          className="px-4 py-2 rounded-full bg-forest-900 border border-forest-700 text-sm font-semibold text-slate-400 hover:border-coral-400 hover:text-slate-200 transition-colors whitespace-nowrap"
        >
          Live Session
        </Link>
        <Link
          to="/plans"
          className="px-4 py-2 rounded-full bg-forest-900 border border-forest-700 text-sm font-semibold text-slate-400 hover:border-coral-400 hover:text-slate-200 transition-colors whitespace-nowrap"
        >
          Plans
        </Link>
      </div>

      {/* "This week" summary - adapted from the reference's "Overall Status"
          teaser card, using real derived numbers instead of a placeholder
          chart. */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-semibold">This week</h2>
          <Link
            to="/analytics"
            className="text-xs font-semibold text-coral-400 hover:text-coral-300 flex items-center gap-0.5"
          >
            See all
            <ChevronRightIcon className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            icon={<LayersIcon className="w-3.5 h-3.5" />}
            label="Sets logged"
            value={weeklyStats.setsCount}
            tint={TINTS.setsReps}
          />
          <StatTile
            icon={<FlameIcon className="w-3.5 h-3.5" />}
            label="Est. calories"
            value={weeklyStats.calories ? `~${Math.round(weeklyStats.calories)}` : '—'}
            tint={TINTS.calories}
          />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-coral-500/15 flex items-center justify-center text-coral-400 shrink-0">
            <DumbbellIcon className="w-4 h-4" />
          </div>
          <h2 className="font-heading font-semibold">New set</h2>
        </div>

        <div>
          <label className="block text-sm mb-1" htmlFor="exercise">
            Exercise
          </label>
          {!showNewExercise ? (
            <div className="flex gap-2">
              <select
                id="exercise"
                value={exerciseId}
                onChange={(e) => setExerciseId(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-forest-950 border border-forest-700 text-sm"
              >
                {exercises.length === 0 && <option value="">No exercises yet</option>}
                {exercises.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNewExercise(true)}
                className="px-3 py-2 rounded-xl border border-forest-600 hover:border-coral-400 text-xs font-semibold whitespace-nowrap"
              >
                + New
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="New exercise name"
                value={newExerciseName}
                onChange={(e) => setNewExerciseName(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-forest-950 border border-forest-700 text-sm"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowNewExercise(false)}
                className="px-3 py-2 rounded-xl border border-forest-600 text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1" htmlFor="sets">
              Sets
            </label>
            <input
              id="sets"
              type="number"
              min="1"
              max="20"
              value={sets}
              onChange={(e) => setSets(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-forest-950 border border-forest-700 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm mb-1" htmlFor="reps">
              Reps
            </label>
            <input
              id="reps"
              type="number"
              min="1"
              max="200"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-forest-950 border border-forest-700 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm mb-1" htmlFor="weight">
              Weight (optional)
            </label>
            <input
              id="weight"
              type="number"
              min="0"
              max="1200"
              step="0.5"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-forest-950 border border-forest-700 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm mb-1" htmlFor="rpe">
              RPE (optional, 1-10)
            </label>
            <input
              id="rpe"
              type="number"
              min="1"
              max="10"
              step="0.5"
              value={rpe}
              onChange={(e) => setRpe(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-forest-950 border border-forest-700 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm mb-1" htmlFor="notes">
            Notes (optional)
          </label>
          <textarea
            id="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-forest-950 border border-forest-700 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-heading font-semibold transition-colors"
        >
          {saving ? 'Logging…' : 'Log set'}
        </button>
      </form>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading font-semibold">Recent logs</h2>
          <Link
            to="/analytics"
            className="text-xs font-semibold text-coral-400 hover:text-coral-300 flex items-center gap-0.5"
          >
            See all
            <ChevronRightIcon className="w-3 h-3" />
          </Link>
        </div>
        {logs.length === 0 ? (
          <div className="card p-6">
            <p className="text-sm text-slate-500">Nothing logged yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {logs.slice(0, 15).map((log) => (
              <LogCard key={log.id} log={log} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
