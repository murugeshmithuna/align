import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

function ChevronDownIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M5 7.5l5 5 5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SearchIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
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

function ClockIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  )
}

function PlayIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  )
}

function CheckIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
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

// A native <select>'s dropdown list is rendered by the OS/browser chrome,
// not by this app's CSS - on Safari/macOS it's a plain light-gray system
// popup with no way to theme it dark, which is exactly what "the scroll
// doesn't match the theme of the app" was reporting. Replaced with a plain
// div-based custom dropdown (this app's existing pattern - see
// ProfileMenu in Navbar.jsx) rendered entirely in this app's own markup,
// so full styling control comes for free.
//
// Defaults to a short "Today's plan" list (today's real scheduled
// exercises, not the entire catalog) with an explicit tab to switch to
// "Different workout" (the full searchable catalog) - avoids forcing a
// scroll through 40+ exercises for the common case of logging exactly
// what was already planned for today.
function ExercisePicker({ exercises, todaysExercises, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState(todaysExercises.length > 0 ? 'today' : 'all')
  const [query, setQuery] = useState('')
  const containerRef = useRef(null)

  useEffect(() => {
    if (todaysExercises.length > 0) setTab('today')
  }, [todaysExercises.length])

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selected = exercises.find((ex) => String(ex.id) === String(value))
  const filteredAll = query.trim()
    ? exercises.filter((ex) => ex.name.toLowerCase().includes(query.trim().toLowerCase()))
    : exercises

  function selectExercise(id) {
    onChange(String(id))
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-forest-950 border border-forest-700 text-sm text-left hover:border-forest-600 transition-colors"
      >
        <span className={`truncate ${selected ? '' : 'text-slate-500'}`}>
          {selected ? selected.name : 'Choose an exercise'}
        </span>
        <ChevronDownIcon className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 w-full rounded-xl border border-forest-700 bg-forest-900 shadow-2xl overflow-hidden">
          {todaysExercises.length > 0 && (
            <div className="flex border-b border-forest-800">
              <button
                type="button"
                onClick={() => setTab('today')}
                className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors ${
                  tab === 'today' ? 'text-coral-400 border-b-2 border-coral-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Today's plan
              </button>
              <button
                type="button"
                onClick={() => setTab('all')}
                className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors ${
                  tab === 'all' ? 'text-coral-400 border-b-2 border-coral-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Different workout
              </button>
            </div>
          )}

          {tab === 'all' && (
            <div className="p-2 border-b border-forest-800">
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-forest-950 border border-forest-700">
                <SearchIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search exercises…"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-slate-500"
                />
              </div>
            </div>
          )}

          <div className="max-h-56 overflow-y-auto py-1">
            {tab === 'today'
              ? todaysExercises.map((pe) => (
                  <button
                    key={pe.id}
                    type="button"
                    onClick={() => selectExercise(pe.exercise_id)}
                    className={`w-full flex items-center justify-between gap-2 text-left px-3 py-2 text-sm transition-colors ${
                      String(pe.exercise_id) === String(value)
                        ? 'text-coral-400 font-semibold bg-forest-800/60'
                        : 'text-slate-200 hover:bg-forest-800/60'
                    }`}
                  >
                    <span className="truncate">{pe.exercise.name}</span>
                    {pe.sets && pe.reps && (
                      <span className="text-[11px] text-slate-500 shrink-0 tabular-nums">
                        {pe.sets}×{pe.reps}
                      </span>
                    )}
                  </button>
                ))
              : filteredAll.length === 0
                ? (
                    <p className="px-3 py-3 text-xs text-slate-500 text-center">
                      No matches - use "+ New" to add it.
                    </p>
                  )
                : filteredAll.map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => selectExercise(ex.id)}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors truncate ${
                        String(ex.id) === String(value)
                          ? 'text-coral-400 font-semibold bg-forest-800/60'
                          : 'text-slate-200 hover:bg-forest-800/60'
                      }`}
                    >
                      {ex.name}
                    </button>
                  ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function WorkoutLog() {
  const { userId } = useSession()
  const { showToast } = useToast()

  const [exercises, setExercises] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [todaysExercises, setTodaysExercises] = useState([])

  const [exerciseId, setExerciseId] = useState('')
  const [newExerciseName, setNewExerciseName] = useState('')
  const [showNewExercise, setShowNewExercise] = useState(false)
  const [creatingExercise, setCreatingExercise] = useState(false)
  const [newExerciseError, setNewExerciseError] = useState('')
  const [sets, setSets] = useState(3)
  const [reps, setReps] = useState(10)
  const [weight, setWeight] = useState('')
  const [rpe, setRpe] = useState('')
  const [notes, setNotes] = useState('')

  // Total time on this page this visit - a real elapsed count, not a fake
  // number, ticking from mount regardless of what else is happening below.
  const [sessionSeconds, setSessionSeconds] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setSessionSeconds((s) => s + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  // Rest timer - a genuine countdown (Play ticks it down to 0 and stops
  // itself there, Pause freezes it, Reset zeroes it), not a decorative
  // readout. +30s/+60s add time whether running or paused.
  const [restSeconds, setRestSeconds] = useState(0)
  const [restRunning, setRestRunning] = useState(false)
  useEffect(() => {
    if (!restRunning) return
    const interval = setInterval(() => {
      setRestSeconds((s) => {
        if (s <= 1) {
          clearInterval(interval)
          setRestRunning(false)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [restRunning])

  function addRestSeconds(delta) {
    setRestSeconds((s) => Math.max(0, s + delta))
  }
  function toggleRest() {
    setRestRunning((running) => {
      if (running) return false
      return restSeconds > 0
    })
  }
  function resetRest() {
    setRestRunning(false)
    setRestSeconds(0)
  }
  // A completed set's real rest period matters more than an idle default -
  // starting the timer running (not just setting a number) is the actual
  // "auto-trigger" the checkmark is meant to do.
  function startRestFor(seconds) {
    setRestSeconds(seconds)
    setRestRunning(true)
  }

  // Per-set tracker for the currently selected exercise - Weight/Reps/RPE
  // per row plus a completion checkmark, distinct from the existing "New
  // set" form below (which logs one aggregate sets x reps entry). Reset
  // to fresh empty rows whenever the selected exercise changes.
  const emptySetRows = () => [
    { weight: '', reps: '', rpe: '', completed: false },
    { weight: '', reps: '', rpe: '', completed: false },
    { weight: '', reps: '', rpe: '', completed: false },
  ]
  const [trackedSets, setTrackedSets] = useState(emptySetRows)
  const [loggingSetIndex, setLoggingSetIndex] = useState(null)

  useEffect(() => {
    setTrackedSets(emptySetRows())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseId])

  function updateTrackedSet(index, field, value) {
    setTrackedSets((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
  }

  function addTrackedSetRow() {
    setTrackedSets((prev) => [...prev, { weight: '', reps: '', rpe: '', completed: false }])
  }

  // Marking a set complete logs a REAL entry (reuses the same API the
  // existing form does, just one set at a time) and auto-starts the rest
  // timer - both real behavior, not a UI-only toggle.
  async function completeTrackedSet(index) {
    const row = trackedSets[index]
    if (!row || row.completed || !exerciseId) return
    setLoggingSetIndex(index)
    try {
      const log = await api.createLog({
        user_id: userId,
        exercise_id: Number(exerciseId),
        sets: 1,
        reps: row.reps === '' ? null : Number(row.reps),
        weight: row.weight === '' ? null : Number(row.weight),
        rpe: row.rpe === '' ? null : Number(row.rpe),
      })
      setLogs((prev) => [log, ...prev])
      setTrackedSets((prev) => prev.map((r, i) => (i === index ? { ...r, completed: true } : r)))
      startRestFor(90)
      showToast('Set logged.')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoggingSetIndex(null)
    }
  }

  function formatClock(totalSeconds) {
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  const [saving, setSaving] = useState(false)
  // Set only by an explicit user pick (see handleExerciseChange) - the
  // default-selection effect below must never clobber a real choice once
  // the user has made one, even if today's plan finishes loading afterward.
  const hasUserPickedRef = useRef(false)

  const loadLogs = useCallback(() => {
    api.listLogs(userId).then(setLogs).catch(() => {})
  }, [userId])

  useEffect(() => {
    Promise.all([api.listExercises(), api.listLogs(userId)])
      .then(([exerciseList, logList]) => {
        setExercises(exerciseList)
        setLogs(logList)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [userId])

  // Real day-wise scheduling, not the entire exercise catalog dumped into
  // one control - a direct request: "i have a listed activity plan day wise
  // for a reason so the log page [should have] the same list of exercise
  // that a user can select". Mirrors the same active-plan + today's-
  // day-of-week filter LiveSession.jsx already uses for its own picker.
  useEffect(() => {
    api
      .listPlans(userId)
      .then((plans) => {
        const active = plans.find((p) => p.is_active)
        if (!active) return
        const today = (new Date().getDay() + 6) % 7 // JS getDay(): 0=Sun..6=Sat -> 0=Mon..6=Sun
        const scheduled = active.plan_exercises
          .filter((pe) => pe.day_of_week === today)
          .sort((a, b) => a.order_index - b.order_index)
        setTodaysExercises(scheduled)
      })
      .catch(() => {})
  }, [userId])

  // Defaults to today's first planned exercise once it's known, falling
  // back to the first catalog exercise only if nothing's scheduled today -
  // never overrides an exercise the user actually picked themselves.
  useEffect(() => {
    if (hasUserPickedRef.current) return
    if (todaysExercises.length > 0) {
      setExerciseId(String(todaysExercises[0].exercise_id))
    } else if (exercises.length > 0) {
      setExerciseId((current) => current || String(exercises[0].id))
    }
  }, [todaysExercises, exercises])

  function handleExerciseChange(id) {
    hasUserPickedRef.current = true
    setExerciseId(id)
  }

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

  const selectedExerciseName = exercises.find((ex) => String(ex.id) === String(exerciseId))?.name || ''

  // Real prior performance for the currently selected exercise - `logs` is
  // already sorted newest-first by the backend (GET /logs/user/{id} orders
  // by performed_at desc), so the first match is genuinely the last time
  // this exercise was logged, not a guess.
  const previousLogForExercise = useMemo(() => {
    if (!exerciseId) return null
    return logs.find((log) => String(log.exercise_id) === String(exerciseId)) || null
  }, [logs, exerciseId])

  // A brand-new exercise name is validated and created immediately, right
  // where the user typed it - not deferred to the final "Log set" submit.
  // Real user report this addresses directly: "what if i enter
  // bananasmoothie? coz thats not a real workout so validation is also
  // mandatory" - the backend's POST /exercises now rejects non-exercise
  // names with a 422 (see backend/app/agent/exercise_validation.py); this
  // surfaces that rejection inline instead of only failing at the very end.
  async function handleAddNewExercise() {
    const trimmed = newExerciseName.trim()
    if (!trimmed) return
    setCreatingExercise(true)
    setNewExerciseError('')
    try {
      const created = await api.createExercise({ name: trimmed })
      setExercises((prev) => [...prev, created])
      handleExerciseChange(String(created.id))
      setShowNewExercise(false)
      setNewExerciseName('')
    } catch (err) {
      setNewExerciseError(err.message)
    } finally {
      setCreatingExercise(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!exerciseId) {
      showToast('Pick or create an exercise first', 'error')
      return
    }
    setSaving(true)
    try {
      const log = await api.createLog({
        user_id: userId,
        exercise_id: Number(exerciseId),
        sets: Number(sets),
        reps: Number(reps),
        weight: weight === '' ? null : Number(weight),
        rpe: rpe === '' ? null : Number(rpe),
        notes: notes || null,
      })
      setLogs((prev) => [log, ...prev])
      setNotes('')
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
    <div className="max-w-7xl mx-auto px-6 py-10 font-body space-y-6">
      {/* Header - muted label over a bold title, adapted from the reference's
          "Welcome back / Hi, Name!" hierarchy, with a circular icon button
          on the right in place of its notification bell (there's no
          notifications feature in this app, so this one links back to the
          dashboard instead of fabricating one). */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Manual logging</p>
          <h1 className="font-heading font-bold text-3xl mt-0.5">Log a Workout</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Real elapsed time on this page this visit, ticking every
              second from mount - a genuine session stopwatch, not a static
              label. */}
          <div
            className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-forest-900 border border-forest-700"
            title="Session time"
          >
            <ClockIcon className="w-3.5 h-3.5 text-coral-400" />
            <span className="text-sm font-heading font-semibold tabular-nums">{formatClock(sessionSeconds)}</span>
          </div>
          <Link
            to="/dashboard"
            title="Back to dashboard"
            className="w-10 h-10 shrink-0 rounded-full bg-forest-900 border border-forest-700 flex items-center justify-center hover:border-coral-400 transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4 text-slate-300" />
          </Link>
        </div>
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

      {/* Split-grid dashboard: the active session (timer + per-set tracking
          + history) on the left, the add/configure forms on the right -
          replaces the old single stacked column of full-width cards. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          {/* Rest timer - a genuine countdown (see restSeconds/restRunning
              state above), not a decorative readout. Anchors the top of the
              active-session column, per the "timer at top" layout rule. */}
          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-coral-500/15 flex items-center justify-center text-coral-400 shrink-0">
                <ClockIcon className="w-4 h-4" />
              </div>
              <h2 className="font-heading font-semibold">Rest timer</h2>
            </div>
            <div className="flex items-center justify-center py-2">
              <span className="font-heading font-bold text-5xl tabular-nums">{formatClock(restSeconds)}</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => addRestSeconds(30)}
                className="px-3 py-1.5 rounded-lg border border-forest-600 hover:border-coral-400 text-xs font-semibold"
              >
                +30s
              </button>
              <button
                type="button"
                onClick={() => addRestSeconds(60)}
                className="px-3 py-1.5 rounded-lg border border-forest-600 hover:border-coral-400 text-xs font-semibold"
              >
                +60s
              </button>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={toggleRest}
                disabled={restSeconds === 0 && !restRunning}
                className="px-6 py-2.5 rounded-xl bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-heading font-semibold flex items-center gap-2"
              >
                {restRunning ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
                {restRunning ? 'Pause' : 'Play'}
              </button>
              <button
                type="button"
                onClick={resetRest}
                className="px-4 py-2.5 rounded-xl border border-forest-600 hover:border-coral-400 text-sm font-semibold"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Per-set tracker for whichever exercise is selected on the right
              - Weight/Reps/RPE per row plus a completion checkmark that logs
              a real set (via the same createLog call the "New set" form
              uses) and auto-starts the rest timer above. */}
          {exerciseId && (
            <div className="card p-6 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-coral-500/15 flex items-center justify-center text-coral-400 shrink-0">
                  <CheckIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-heading font-semibold">Track sets</h2>
                  {selectedExerciseName && (
                    <p className="text-xs text-slate-500 truncate">{selectedExerciseName}</p>
                  )}
                </div>
              </div>

              {previousLogForExercise && (
                <p className="text-xs text-slate-500">
                  Prev: {previousLogForExercise.weight ? `${previousLogForExercise.weight}kg x ` : ''}
                  {previousLogForExercise.reps ?? '—'} reps
                  {previousLogForExercise.rpe ? ` @ RPE ${previousLogForExercise.rpe}` : ''}
                </p>
              )}

              <div className="space-y-2">
                {trackedSets.map((row, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border transition-colors ${
                      row.completed ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-forest-700 bg-forest-950/40'
                    }`}
                  >
                    <span className="text-xs font-semibold text-slate-500 w-11 shrink-0">Set {i + 1}</span>
                    <input
                      type="number"
                      placeholder="kg"
                      value={row.weight}
                      disabled={row.completed}
                      onChange={(e) => updateTrackedSet(i, 'weight', e.target.value)}
                      className="w-16 px-2 py-1.5 rounded-lg bg-forest-950 border border-forest-700 text-sm disabled:opacity-60 min-w-0"
                    />
                    <input
                      type="number"
                      placeholder="reps"
                      value={row.reps}
                      disabled={row.completed}
                      onChange={(e) => updateTrackedSet(i, 'reps', e.target.value)}
                      className="w-16 px-2 py-1.5 rounded-lg bg-forest-950 border border-forest-700 text-sm disabled:opacity-60 min-w-0"
                    />
                    <input
                      type="number"
                      placeholder="RPE"
                      step="0.5"
                      value={row.rpe}
                      disabled={row.completed}
                      onChange={(e) => updateTrackedSet(i, 'rpe', e.target.value)}
                      className="w-16 px-2 py-1.5 rounded-lg bg-forest-950 border border-forest-700 text-sm disabled:opacity-60 min-w-0"
                    />
                    {previousLogForExercise && !row.completed && (
                      <span className="text-[11px] text-slate-500 truncate hidden sm:inline">
                        Prev: {previousLogForExercise.weight ? `${previousLogForExercise.weight}kg x ` : ''}
                        {previousLogForExercise.reps ?? '—'}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => completeTrackedSet(i)}
                      disabled={row.completed || loggingSetIndex === i}
                      title={row.completed ? 'Completed' : 'Mark set complete'}
                      className={`ml-auto w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                        row.completed
                          ? 'bg-emerald-500 text-forest-950'
                          : 'border border-forest-600 hover:border-coral-400 text-slate-400'
                      }`}
                    >
                      {loggingSetIndex === i ? (
                        <span className="w-3 h-3 border-2 border-forest-700 border-t-coral-500 rounded-full motion-safe:animate-spin" />
                      ) : (
                        <CheckIcon className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addTrackedSetRow}
                className="text-xs font-semibold text-coral-400 hover:text-coral-300"
              >
                + Add set
              </button>
            </div>
          )}

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
              <div className="max-h-[600px] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-4 pr-1">
                {logs.slice(0, 15).map((log) => (
                  <LogCard key={log.id} log={log} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          {/* "This week" summary - adapted from the reference's "Overall
              Status" teaser card, using real derived numbers instead of a
              placeholder chart. */}
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
                  <div className="flex-1 min-w-0">
                    <ExercisePicker
                      exercises={exercises}
                      todaysExercises={todaysExercises}
                      value={exerciseId}
                      onChange={handleExerciseChange}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNewExercise(true)}
                    className="px-3 py-2 rounded-xl border border-forest-600 hover:border-coral-400 text-xs font-semibold whitespace-nowrap"
                  >
                    + New
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="New exercise name"
                      value={newExerciseName}
                      onChange={(e) => {
                        setNewExerciseName(e.target.value)
                        setNewExerciseError('')
                      }}
                      className="flex-1 px-3 py-2 rounded-xl bg-forest-950 border border-forest-700 text-sm"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleAddNewExercise}
                      disabled={creatingExercise || !newExerciseName.trim()}
                      className="px-3 py-2 rounded-xl bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-xs font-semibold whitespace-nowrap"
                    >
                      {creatingExercise ? 'Checking…' : 'Add'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewExercise(false)
                        setNewExerciseName('')
                        setNewExerciseError('')
                      }}
                      className="px-3 py-2 rounded-xl border border-forest-600 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                  {newExerciseError && <p className="text-xs text-red-400">{newExerciseError}</p>}
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
              className="w-full px-6 py-2.5 rounded-xl bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-heading font-semibold transition-colors"
            >
              {saving ? 'Logging…' : 'Log set'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
