import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'
import { useToast } from '../context/ToastContext.jsx'

// The shared exercise catalog had no admin cleanup path at all - name
// validation (exercise_validation.py) only stops NEW junk from being
// created, it can't retroactively remove anything that got in before
// validation existed (e.g. a real "banana smoothie" entry that made it
// into production and stayed in every user's exercise picker with no way
// to remove it short of a direct database edit). Deliberately its own
// small section here rather than a dedicated page - this is a rare cleanup
// action, not a routine one.
function ExerciseCatalogSection() {
  const { showToast } = useToast()
  const [exercises, setExercises] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    api
      .listExercises()
      .then(setExercises)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? exercises.filter((ex) => ex.name.toLowerCase().includes(q)) : exercises
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [exercises, query])

  async function handleDelete(exercise) {
    if (!window.confirm(`Remove "${exercise.name}" from the exercise catalog? This also removes any logs or plan entries using it and can't be undone.`)) {
      return
    }
    setDeletingId(exercise.id)
    try {
      await api.deleteExercise(exercise.id)
      setExercises((prev) => prev.filter((ex) => ex.id !== exercise.id))
      showToast(`Removed "${exercise.name}".`)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="card p-6 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-heading font-semibold">Exercise catalog</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Shared across every user - remove anything invalid (typos, nonsense, duplicates).
          </p>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="px-3 py-1.5 rounded-lg bg-forest-950 border border-forest-700 text-sm w-40"
        />
      </div>
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="max-h-72 overflow-y-auto space-y-1">
          {filtered.length === 0 && <p className="text-sm text-slate-500">No matches.</p>}
          {filtered.map((ex) => (
            <div
              key={ex.id}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-forest-900/60"
            >
              <span className="text-sm truncate">{ex.name}</span>
              <button
                type="button"
                onClick={() => handleDelete(ex)}
                disabled={deletingId === ex.id}
                className="text-xs font-semibold text-red-400 hover:text-red-300 disabled:opacity-50 shrink-0"
              >
                {deletingId === ex.id ? 'Removing…' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Admin() {
  const { userId } = useSession()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .adminListUsers(userId)
      .then(setUsers)
      .catch((err) => setError(err.status === 403 ? 'not_authorized' : err.message))
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) {
    return <p className="text-slate-400 text-sm px-6 py-12">Loading users…</p>
  }

  if (error === 'not_authorized') {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10 font-body">
        <div className="card p-6 text-center">
          <p className="text-sm text-slate-400">
            Your account doesn't have admin access. This page is restricted to allowlisted emails.
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-red-400 px-6 py-12">{error}</p>
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 font-body space-y-4">
      <div>
        <h1 className="font-heading font-bold text-2xl">Admin</h1>
        <p className="text-sm text-slate-500 mt-1">All registered users and their activity.</p>
      </div>

      {/* Real table width (measured live) came out ~44px wider than this
          card's content box at the page's own max-w-4xl - the "View →"
          column was silently clipped past the right edge with no visible
          scrollbar hint, and "Signed up" wrapped its date across 3 lines,
          stretching every row. overflow-x-auto still made it technically
          reachable by scrolling, but nothing signaled that. Tightened cell
          padding (px-4->px-3) and stopped the date/count columns from
          wrapping - comfortably fits the same 8 columns without needing to
          scroll on a standard viewport. */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-forest-800">
              <th className="px-3 py-3 font-semibold">Name</th>
              <th className="px-3 py-3 font-semibold">Email</th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap">Signed up</th>
              <th className="px-3 py-3 font-semibold text-right">Plans</th>
              <th className="px-3 py-3 font-semibold text-right">Logs</th>
              <th className="px-3 py-3 font-semibold text-right">Meals</th>
              <th className="px-3 py-3 font-semibold text-right">Check-ins</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-forest-800/60 last:border-0">
                <td className="px-3 py-3 font-semibold max-w-[10rem] truncate" title={u.name}>
                  {u.name}
                </td>
                <td className="px-3 py-3 text-slate-400 max-w-[14rem]">
                  <span className="truncate inline-block max-w-full align-bottom" title={u.email}>
                    {u.email}
                  </span>
                  {u.signed_in_with_google && (
                    <span className="ml-2 text-xs text-emerald-400 font-semibold uppercase tracking-wide">
                      Google
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-slate-500 whitespace-nowrap">
                  {new Date(u.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{u.plan_count}</td>
                <td className="px-3 py-3 text-right tabular-nums">{u.log_count}</td>
                <td className="px-3 py-3 text-right tabular-nums">{u.meal_count}</td>
                <td className="px-3 py-3 text-right tabular-nums">{u.checkin_count}</td>
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  <Link to={`/admin/users/${u.id}`} className="text-coral-400 hover:text-coral-300 font-semibold">
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ExerciseCatalogSection />
    </div>
  )
}
