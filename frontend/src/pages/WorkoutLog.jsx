import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { COACH_DATA_CHANGED_EVENT } from '../utils/coachEvents.js'

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
    <div className="max-w-2xl mx-auto px-6 py-10 font-body space-y-6">
      <div>
        <h1 className="font-heading font-bold text-2xl">Log a Workout</h1>
        <p className="text-sm text-slate-400 mt-1">
          Manually record a completed set - useful when you're not running a live-tracked session.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
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
                className="flex-1 px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
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
                className="px-3 py-2 rounded-lg border border-forest-600 hover:border-coral-400 text-xs font-semibold whitespace-nowrap"
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
                className="flex-1 px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowNewExercise(false)}
                className="px-3 py-2 rounded-lg border border-forest-600 text-xs font-semibold"
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
              className="w-full px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
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
              className="w-full px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
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
              className="w-full px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
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
              className="w-full px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
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
            className="w-full px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-heading font-semibold"
        >
          {saving ? 'Logging…' : 'Log set'}
        </button>
      </form>

      <div className="card p-6">
        <h2 className="font-heading font-semibold mb-3">Recent logs</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing logged yet.</p>
        ) : (
          <div className="space-y-2">
            {logs.slice(0, 15).map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between border-b border-forest-800 last:border-0 pb-2 last:pb-0 text-sm"
              >
                <div>
                  <span className="font-semibold">{log.exercise.name}</span>
                  <span className="text-slate-500 ml-2">
                    {new Date(log.performed_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-slate-300 tabular-nums">
                    {log.sets}×{log.reps}
                    {log.weight ? ` @ ${log.weight}` : ''}
                    {log.rpe ? ` (RPE ${log.rpe})` : ''}
                  </div>
                  {log.estimated_calories != null && (
                    <div className="text-xs text-coral-400 tabular-nums">
                      ~{Math.round(log.estimated_calories)} kcal (est.)
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
